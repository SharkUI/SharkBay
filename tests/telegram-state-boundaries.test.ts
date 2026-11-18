import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTelegramConfig } from "../src/main/config.js";
import { BotApi } from "../src/main/telegram/api.js";
import { TelegramService, TELEGRAM_BUFFER_MAX_BYTES, type TelegramServiceDeps } from "../src/main/telegram/service.js";
import { applyTurnEvent, createTurn } from "../src/main/telegram/turn.js";
import type { TelegramSessionRow } from "../src/main/telegram/types.js";

const services: TelegramService[] = [];
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => { for (const service of services.splice(0)) await service.stop(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const row = (id: string): TelegramSessionRow => ({ sessionId: id, terminalId: `pty-${id}`, projectPath: "/fixture", cwdUri: "local:/fixture", projectName: id, agentId: "test", model: null, title: id, subtitle: null, lastEventAt: "", state: null });
async function fixture() {
  const deps: TelegramServiceDeps = {
    loadConfig: async () => ({ ...createDefaultTelegramConfig(), pairedUsers: [1, 2].map(id => ({ telegramUserId: id, displayName: String(id), pairedAt: "2026-11-17" })) }), saveConfig: vi.fn().mockResolvedValue(undefined),
    secretGet: vi.fn().mockResolvedValue("fixture"), secretSet: vi.fn().mockResolvedValue(undefined), secretDelete: vi.fn().mockResolvedValue(undefined),
    getMachineIdentity: async () => ({ label: "fixture", machineId: "fixture" }),
    listSessions: vi.fn().mockResolvedValue({ rows: [row("A")], total: 1 }), listOpenSessions: vi.fn().mockResolvedValue([row("A")]),
    resolveOpenTerminal: id => `pty-${id}`, restoreSession: vi.fn().mockResolvedValue(undefined), inputTerminal: vi.fn(),
    listProjects: async () => [], listAgents: async () => [], listSessionTasks: async () => [], launchSession: vi.fn().mockResolvedValue(undefined),
    currentOpenTerminalIds: () => [], resolveHookForTerminal: () => null,
    fetchImpl: vi.fn().mockRejectedValue(new Error("Unexpected network request")),
  };
  const service = new TelegramService(deps); services.push(service); await service.init();
  const api = new BotApi({ token: "fixture", fetch: deps.fetchImpl });
  let messageId = 0;
  vi.spyOn(api, "sendMessage").mockImplementation(async ({ chatId }) => ({ message_id: ++messageId, chat: { id: chatId } }));
  vi.spyOn(api, "answerCallbackQuery").mockResolvedValue(true); vi.spyOn(api, "deleteMessage").mockResolvedValue(true); vi.spyOn(api, "sendChatAction").mockResolvedValue(true);
  service["api"] = api;
  const register = (id = "A", userId = 1, chatId = 11) => service["registerChat"](chatId, userId, row(id), `pty-${id}`);
  const approval = async (id = "A", userId = 1, chatId = 11) => {
    const chat = register(id, userId, chatId);
    chat.turn = applyTurnEvent(createTurn({ turnId: `turn-${id}`, ptyId: chat.ptyId, hookSessionId: id, projectPath: "/fixture", startedAt: Date.now() }), { type: "status", state: "waiting", at: Date.now(), hookSessionId: id, projectPath: "/fixture" }).turn;
    await service["sendApproval"](chat);
    return chat;
  };
  const callback = (data: string, id: number, userId = 1, chatId = 11) => service["handleCallback"]({ id: "callback", from: { id: userId }, message: { message_id: id, chat: { id: chatId } }, data });
  return { service, api, deps, register, approval, callback };
}

describe("Telegram request ownership", () => {
  it.each([["y", "y\r"], ["n", "n\r"], ["enter", "\r"]])("consumes %s approval exactly once and rejects old and malformed callbacks", async (key, input) => {
    const { approval, callback, deps } = await fixture(); const chat = await approval(); const request = chat.approvalRequest!;
    await callback(`akey:${request.token}:${key}`, request.messageId!);
    await callback(`akey:${request.token}:${key}`, request.messageId!);
    await callback("akey:y", request.messageId!);
    expect(deps.inputTerminal).toHaveBeenCalledTimes(1); expect(deps.inputTerminal).toHaveBeenCalledWith("pty-A", input);
  });
  it("rejects approval from the wrong user, chat, message, or turn", async () => {
    const { approval, callback, deps } = await fixture(); const chat = await approval(); const request = chat.approvalRequest!;
    const data = `akey:${request.token}:n`;
    await callback(data, request.messageId!, 2); await callback(data, request.messageId!, 1, 22); await callback(data, request.messageId! + 1);
    chat.turn = { ...chat.turn!, turnId: "new-turn" }; await callback(data, request.messageId!);
    expect(deps.inputTerminal).not.toHaveBeenCalled();
  });
  it("does not redirect an old approval to a newly attached terminal", async () => {
    const { approval, register, callback, deps } = await fixture(); const old = await approval(); const request = old.approvalRequest!;
    register("B"); await callback(`akey:${request.token}:y`, request.messageId!);
    expect(deps.inputTerminal).not.toHaveBeenCalled();
  });
  it("invalidates an approval whose send completes after detach", async () => {
    const { service, api, register, callback, deps } = await fixture(); const chat = register();
    chat.turn = { ...createTurn({ turnId: "turn", ptyId: chat.ptyId, hookSessionId: "A", projectPath: "/fixture", startedAt: Date.now() }), approvalHeld: true };
    let finish!: (value: { message_id: number; chat: { id: number } }) => void;
    vi.mocked(api.sendMessage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const sending = service["sendApproval"](chat); const token = chat.approvalRequest!.token;
    service["detach"](chat); finish({ message_id: 99, chat: { id: 11 } }); await sending;
    await callback(`akey:${token}:y`, 99); expect(deps.inputTerminal).not.toHaveBeenCalled(); expect(api.deleteMessage).toHaveBeenCalledWith(11, 99);
  });
  it("isolates numeric selections between users and list kinds", async () => {
    const { service, deps } = await fixture();
    await service["sendSessions"](11, 1, "");
    vi.mocked(deps.listSessions).mockResolvedValue({ rows: [row("B")], total: 1 });
    deps.resolveOpenTerminal = id => id === "B" ? null : `pty-${id}`;
    await service["sendResume"](22, 2, "");
    await service["handleUpdate"]({ update_id: 1, message: { message_id: 9, from: { id: 1 }, chat: { id: 11 }, text: "1" } });
    expect(service["chats"].get(1)?.ptyId).toBe("pty-A"); expect(deps.restoreSession).not.toHaveBeenCalled();
  });
  it("rejects callbacks and replies to superseded selection messages", async () => {
    const { service, deps, callback } = await fixture();
    await service["sendSessions"](11, 1, ""); const first = service["selections"].get(1)!.messageId!;
    await service["sendSessions"](11, 1, "");
    await callback("use:A", first);
    await service["handleUpdate"]({ update_id: 1, message: { message_id: 9, from: { id: 1 }, chat: { id: 11 }, text: "1", reply_to_message: { message_id: first } } });
    expect(service["chats"].has(1)).toBe(false); expect(deps.inputTerminal).not.toHaveBeenCalled();
  });
  it("transfers PTY control exclusively and stale detach cannot remove its new route", async () => {
    const { service, register, deps } = await fixture(); const first = register("A", 1, 11); register("A", 2, 22);
    expect(service["chats"].has(1)).toBe(false); expect(service["ptyToChat"].get("pty-A")).toBe(2);
    service["detach"](first); expect(service["ptyToChat"].get("pty-A")).toBe(2);
    await service["handleAgentInput"](11, 1, "wrong", "wrong"); expect(deps.inputTerminal).not.toHaveBeenCalled();
    await service["handleAgentInput"](22, 2, "right", "right"); expect(deps.inputTerminal).toHaveBeenCalledWith("pty-A", "right\r");
  });
});

describe("Telegram polling lifecycle", () => {
  it("single-flights startup and stop prevents delayed startup activation", async () => {
    const { service, deps } = await fixture(); let finish!: (token: string) => void;
    vi.mocked(deps.secretGet).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const a = service.start(), b = service.start(); expect(a).toBe(b); expect(deps.secretGet).toHaveBeenCalledTimes(1);
    await service.stop(); finish("fixture"); await a;
    expect(service.getConfigView().enabled).toBe(false); expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
  it("drops late poll results after stop even if the fake transport ignores abort", async () => {
    const { service, api } = await fixture(); let finish!: (updates: unknown[]) => void;
    vi.spyOn(api, "getUpdates").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const handle = vi.spyOn(service as never, "handleUpdate" as never); service["polling"] = true;
    const loop = service["pollLoop"](service["generation"], api, new AbortController().signal);
    await service.stop(); finish([{ update_id: 1 }]); await loop;
    expect(handle).not.toHaveBeenCalled(); expect(service["offset"]).toBe(0);
  });
  it("cannot reactivate after stop while bot validation is pending", async () => {
    const { service } = await fixture(); let finish!: (value: { id: number; is_bot: boolean; first_name: string }) => void;
    vi.spyOn(BotApi.prototype, "getMe").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const commands = vi.spyOn(BotApi.prototype, "setMyCommands").mockResolvedValue(true);
    const starting = service.start(); await vi.advanceTimersByTimeAsync(0); await service.stop();
    finish({ id: 1, is_bot: true, first_name: "fixture" }); await starting;
    expect(commands).not.toHaveBeenCalled(); expect(service.getConfigView().status).toBe("disabled");
  });
  it("restarts with a fresh bot offset and invalidates the old poll on token rotation", async () => {
    const { service, deps } = await fixture(); const signals: AbortSignal[] = []; const offsets: number[] = [];
    let token = "first"; vi.mocked(deps.secretGet).mockImplementation(async () => token); vi.mocked(deps.secretSet).mockImplementation(async value => { token = value; });
    deps.fetchImpl = vi.fn(async (url, init) => {
      if (url.endsWith("/getUpdates")) return new Promise<Response>((_resolve, reject) => { const signal = init?.signal as AbortSignal; signals.push(signal); offsets.push(JSON.parse(String(init?.body)).offset); signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); });
      return new Response(JSON.stringify({ ok: true, result: url.endsWith("/getMe") ? { username: "fixture" } : true }));
    });
    await service.start(); service["offset"] = 99;
    expect((await service.setToken("second")).ok).toBe(true);
    expect(signals).toHaveLength(2); expect(signals[0]!.aborted).toBe(true); expect(signals[1]!.aborted).toBe(false); expect(offsets).toEqual([0, 0]);
  });
  it("aborts the actual injected getUpdates fetch on stop", async () => {
    const { service, deps } = await fixture(); let pollSignal: AbortSignal | undefined;
    deps.fetchImpl = vi.fn(async (url, init) => {
      if (url.endsWith("/getUpdates")) return new Promise<Response>((_resolve, reject) => { pollSignal = init?.signal as AbortSignal; pollSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); });
      return new Response(JSON.stringify({ ok: true, result: url.endsWith("/getMe") ? { username: "fixture" } : true }));
    });
    await service.start(); expect(pollSignal?.aborted).toBe(false);
    await service.stop(); expect(pollSignal?.aborted).toBe(true); await vi.advanceTimersByTimeAsync(0);
  });
});

describe("Telegram output bounds", () => {
  it("keeps a UTF-8 tail within the byte budget", async () => {
    const { service, register } = await fixture(); const chat = register();
    chat.turn = createTurn({ turnId: "turn", ptyId: "pty-A", hookSessionId: "A", projectPath: "/fixture", startedAt: Date.now() });
    for (let index = 0; index < 10; index++) service.feedTerminalData("pty-A", "中🙂".repeat(3000));
    expect(Buffer.byteLength(chat.buffer)).toBeLessThanOrEqual(TELEGRAM_BUFFER_MAX_BYTES); expect(chat.buffer.length).toBeGreaterThan(0); expect(chat.buffer).not.toContain("\ufffd");
  });
  it("does not retain raw PTY output when a transcript reader exists", async () => {
    const { service, deps, register } = await fixture(); deps.transcript = { supports: () => true, cursor: () => 0, turnStartCursor: () => 0, answer: () => null, progress: () => null };
    const chat = register(); chat.turn = createTurn({ turnId: "turn", ptyId: "pty-A", hookSessionId: "A", projectPath: "/fixture", startedAt: Date.now() });
    service.feedTerminalData("pty-A", "raw output"); expect(chat.buffer).toBe("");
  });
});


it("does not start polling after stop while initial config was still loading", async () => {
  const { service, deps } = await fixture();
  let finish!: (config: ReturnType<typeof createDefaultTelegramConfig>) => void;
  deps.loadConfig = () => new Promise(resolve => { finish = resolve; });
  const initialization = service.init();
  await service.stop();
  finish({ ...createDefaultTelegramConfig(), enabled: true });
  await initialization;
  expect(deps.secretGet).not.toHaveBeenCalled();
  expect(service.getConfigView().status).toBe("disabled");
});
