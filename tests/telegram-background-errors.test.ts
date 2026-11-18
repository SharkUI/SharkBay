import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTelegramConfig } from "../src/main/config.js";
import { BotApi } from "../src/main/telegram/api.js";
import { TelegramService, type TelegramServiceDeps } from "../src/main/telegram/service.js";
import type { TelegramSessionRow } from "../src/main/telegram/types.js";

const services: TelegramService[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

function fixture(transcript?: TelegramServiceDeps["transcript"]) {
  const row: TelegramSessionRow = {
    sessionId: "session", terminalId: "terminal", projectPath: "/fixture", cwdUri: "local:/fixture",
    projectName: "fixture", agentId: "test", model: null, title: null, subtitle: null, lastEventAt: "", state: null,
  };
  const service = new TelegramService({
    loadConfig: async () => createDefaultTelegramConfig(), saveConfig: async () => {},
    secretGet: async () => null, secretSet: async () => {}, secretDelete: async () => {},
    getMachineIdentity: async () => ({ label: "fixture", machineId: "fixture" }),
    listSessions: async () => ({ rows: [row], total: 1 }), listOpenSessions: async () => [row],
    resolveOpenTerminal: () => "terminal", restoreSession: async () => {}, inputTerminal: () => {},
    listProjects: async () => [], listAgents: async () => [], listSessionTasks: async () => [], launchSession: async () => {},
    currentOpenTerminalIds: () => [], resolveHookForTerminal: () => "session", transcript,
  });
  services.push(service);
  const api = new BotApi({ token: "fixture", fetch: vi.fn().mockRejectedValue(new Error("Unexpected network request")) });
  vi.spyOn(api, "sendMessage").mockResolvedValue({ message_id: 1, chat: { id: 1 } });
  vi.spyOn(api, "sendChatAction").mockResolvedValue(true);
  vi.spyOn(api, "deleteMessage").mockResolvedValue(true);
  service["api"] = api;
  const chat = service["registerChat"](1, 1, row, "terminal");
  const status = (state: "working" | "done") => service.feedStatusChange({ sessionId: "session", projectPath: "/fixture", state, action: "", at: Date.now() });
  return { service, api, chat, status };
}

describe("Telegram background failures", () => {
  it("contains failed typing pings and continues processing status", async () => {
    const { api, status, chat } = fixture();
    vi.mocked(api.sendChatAction).mockRejectedValue(new Error("network failure"));
    status("working");
    await vi.advanceTimersByTimeAsync(4000);
    expect(api.sendChatAction).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith("[telegram] Typing notification failed");
    status("done"); await vi.advanceTimersByTimeAsync(0);
    expect(chat.typingTimer).toBeNull();
    expect(chat.turn).toBeNull();
  });
  it("contains failed progress edits and approval cleanup", async () => {
    const { service, api, chat } = fixture();
    vi.spyOn(api, "editMessageText").mockRejectedValue(new Error("message missing"));
    vi.mocked(api.deleteMessage).mockRejectedValue(new Error("forbidden"));
    chat.progressMessageId = 1; chat.approvalMessageId = 2;
    service["flushEdit"](chat); service["clearApproval"](chat);
    await vi.advanceTimersByTimeAsync(0);
    expect(console.warn).toHaveBeenCalledWith("[telegram] Progress update failed");
    expect(console.warn).toHaveBeenCalledWith("[telegram] Approval cleanup failed");
    expect(chat.approvalMessageId).toBeNull();
  });
  it("cleans up a turn even when its transcript reader fails", async () => {
    const { status, chat } = fixture({
      cursor: () => 1, turnStartCursor: () => 1, progress: () => null,
      answer: () => { throw new Error("transcript unavailable"); }, supports: () => true,
    });
    status("working"); await vi.advanceTimersByTimeAsync(0);
    status("done"); await vi.advanceTimersByTimeAsync(0);
    expect(console.warn).toHaveBeenCalledWith("[telegram] Turn finalization failed");
    expect(chat.turn).toBeNull(); expect(chat.transcriptCursor).toBeNull(); expect(chat.buffer).toBe("");
  });
  it("does not clear a newer turn when delayed finalization fails", async () => {
    const answer = vi.fn().mockReturnValueOnce(null).mockImplementation(() => { throw new Error("old transcript unavailable"); });
    const { status, chat } = fixture({ cursor: () => 1, turnStartCursor: () => 1, progress: () => null, answer, supports: () => true });
    status("working"); await vi.advanceTimersByTimeAsync(0);
    status("done");
    status("working"); chat.buffer = "new turn";
    const current = chat.turn;
    await vi.advanceTimersByTimeAsync(500);
    expect(console.warn).toHaveBeenCalledWith("[telegram] Turn finalization failed");
    expect(chat.turn).toBe(current); expect(chat.buffer).toBe("new turn");
  });
});
