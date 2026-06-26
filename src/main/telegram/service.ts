/**
 * Telegram remote-control orchestrator (spec tasks #8/#9).
 *
 * Owns the long-polling loop, command routing, pairing, and the chat bridge that
 * drives a resume PTY per authorized user and streams its output back with the
 * turn state machine. Electron/core specifics are injected so this stays free of
 * direct electron imports; the harness in ipc.ts supplies the dependencies.
 *
 * Runtime module — verified by typecheck; the pure pieces it composes
 * (dispatch/turn/render/pairing/ansi/session-registry) carry the unit tests.
 */

import type {
  TelegramConfig,
  TelegramConfigView,
  TelegramConnectionStatus,
  TelegramPairCodeResult,
} from "../../shared/types.js";
import { BotApi, type BotCommandSpec, type FetchLike, type ReplyMarkup } from "./api.js";
import { dispatchMessage } from "./dispatch.js";
import { PairStore } from "./pairing.js";
import { stripAnsi } from "./ansi.js";
import { formatForTelegram } from "./format.js";
import {
  HELP_TEXT,
  NOT_IN_CHAT_TEXT,
  UNAUTHORIZED_TEXT,
  UNKNOWN_COMMAND_TEXT,
  chunkMessage,
  parseSelection,
  renderSessionsList,
  statusBadge,
} from "./render.js";
import { applyTurnEvent, createTurn, type Turn } from "./turn.js";
import type { SessionState, TelegramSessionRow } from "./types.js";

const DEFAULT_SESSIONS_LIMIT = 10;
const EDIT_THROTTLE_MS = 1000;
const POLL_TIMEOUT_SEC = 30;
const POLL_ERROR_BACKOFF_MS = 3000;
/** Progress bubble shows only a short fixed-length tail of the live output. */
const PROGRESS_TAIL_CHARS = 200;
/** Safety cap on the final message so a runaway PTY can never dump the whole scrollback. */
const FINAL_MAX_CHARS = 6000;

const BOT_COMMAND_MENU: BotCommandSpec[] = [
  { command: "sessions", description: "已打开的会话" },
  { command: "resume", description: "恢复未打开的历史会话" },
  { command: "tasks", description: "本会话关联的任务" },
  { command: "machine", description: "本机信息" },
  { command: "status", description: "当前会话状态" },
  { command: "stop", description: "退出当前会话聊天" },
  { command: "whoami", description: "我的配对信息" },
  { command: "help", description: "命令帮助" },
];

export type StatusChangeInput = {
  sessionId: string;
  projectPath: string;
  state: SessionState;
  action: string;
  at: number;
};

export type MachineIdentity = { label: string; githubUserId?: string; machineId: string };

export type TelegramServiceDeps = {
  loadConfig: () => Promise<TelegramConfig>;
  saveConfig: (patch: Partial<TelegramConfig>) => Promise<void>;
  secretGet: () => Promise<string | null>;
  secretSet: (token: string) => Promise<void>;
  secretDelete: () => Promise<void>;
  getMachineIdentity: () => Promise<MachineIdentity>;
  /** All known agent sessions (open + historical), newest first. */
  listSessions: () => Promise<{ rows: TelegramSessionRow[]; total: number }>;
  /** Sessions currently open as SharkBay agent tabs (authoritative, immediate). */
  listOpenSessions: () => Promise<TelegramSessionRow[]>;
  /** Terminal id if the session is currently open as a SharkBay agent tab, else null. */
  resolveOpenTerminal: (hookSessionId: string) => string | null;
  /** Ask SharkBay to restore a not-open session as a real agent tab. */
  restoreSession: (row: TelegramSessionRow) => Promise<void>;
  inputTerminal: (terminalId: string, data: string) => void;
  /** Live three-state status for a session, fresh at call time. */
  currentStatus?: (row: TelegramSessionRow) => { state: SessionState; action: string } | null;
  /**
   * Clean final-answer source from the agent transcript (PTY of a TUI agent can't
   * yield a clean answer). `cursor` snapshots the transcript at prompt time;
   * `turnStartCursor` is the start of the latest turn (for "show last result");
   * `answer` returns assistant text since a cursor, or null to fall back.
   */
  transcript?: {
    cursor: (row: TelegramSessionRow) => number;
    turnStartCursor: (row: TelegramSessionRow) => number;
    answer: (row: TelegramSessionRow, cursor: number) => string | null;
    /** Clean in-progress activity (text + tool calls) since a cursor. */
    progress: (row: TelegramSessionRow, cursor: number) => string | null;
    /** Whether this agent has a transcript reader (if so, never fall back to raw PTY). */
    supports: (agentId: string) => boolean;
  };
  /** Tasks associated with a session (frontmatter sessionId match), with full markdown. */
  listSessionTasks: (projectPath: string, hookSessionId: string) => Promise<Array<{ taskId: string; title: string; raw: string }>>;
  onStatusChanged?: () => void;
  now?: () => number;
  fetchImpl?: FetchLike;
};

type ChatSession = {
  chatId: number;
  telegramUserId: number;
  ptyId: string;
  hookSessionId: string;
  projectPath: string;
  row: TelegramSessionRow;
  turn: Turn | null;
  progressMessageId: number | null;
  buffer: string;
  lastEditAt: number;
  lastActivityAt: number;
  liveState: SessionState | null;
  lastAction: string;
  editTimer: ReturnType<typeof setTimeout> | null;
  transcriptCursor: number | null;
  typingTimer: ReturnType<typeof setInterval> | null;
  approvalMessageId: number | null;
  lastProgressText: string;
  lastTasks: Array<{ taskId: string; title: string; raw: string }>;
};

type TelegramUpdate = {
  update_id: number;
  message?: { message_id: number; from?: { id: number; first_name?: string; username?: string }; chat: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number; first_name?: string; username?: string }; message?: { chat: { id: number } }; data?: string };
};

export class TelegramService {
  private readonly deps: TelegramServiceDeps;
  private readonly now: () => number;
  private api: BotApi | null = null;
  private pairStore = new PairStore();
  private polling = false;
  private offset = 0;
  private status: TelegramConnectionStatus = "disabled";
  private statusMessage: string | undefined;
  private botUsername: string | null = null;
  private idleTimeoutMs = 15 * 60 * 1000;
  private chats = new Map<number, ChatSession>(); // by telegramUserId
  private ptyToChat = new Map<string, number>();
  private lastSessionRows: TelegramSessionRow[] = [];
  private lastResumeRows: TelegramSessionRow[] = [];
  private lastListKind: "use" | "resume" = "use";
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: TelegramServiceDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  /** Load persisted config and start polling if enabled and a token is present. */
  async init(): Promise<void> {
    const config = await this.deps.loadConfig();
    this.botUsername = config.botUsername;
    this.idleTimeoutMs = config.idleTimeoutMs;
    this.pairStore = new PairStore({ initialUsers: config.pairedUsers });
    if (config.enabled) await this.start();
    else this.status = "disabled";
  }

  getConfigView(): TelegramConfigView {
    return {
      enabled: this.polling || this.status === "checking",
      hasToken: this.api !== null,
      botUsername: this.botUsername,
      status: this.status,
      statusMessage: this.statusMessage,
      idleTimeoutMs: this.idleTimeoutMs,
      pairedUsers: this.pairStore.list(),
    };
  }

  async setToken(token: string): Promise<{ ok: boolean; botUsername?: string; message?: string }> {
    const trimmed = token.trim();
    if (!trimmed) {
      await this.deps.secretDelete();
      this.api = null;
      this.botUsername = null;
      this.status = "unconfigured";
      await this.deps.saveConfig({ botUsername: null });
      this.notify();
      return { ok: false, message: "Token 已清除" };
    }
    this.status = "checking";
    this.notify();
    const api = new BotApi({ token: trimmed, fetch: this.deps.fetchImpl });
    try {
      const me = await api.getMe();
      await this.deps.secretSet(trimmed);
      this.api = api;
      this.botUsername = me.username ?? null;
      this.status = this.polling ? "connected" : "disabled";
      await this.deps.saveConfig({ botUsername: this.botUsername });
      this.notify();
      return { ok: true, botUsername: this.botUsername ?? undefined };
    } catch (error) {
      this.status = "error";
      this.statusMessage = errorMessage(error);
      this.notify();
      return { ok: false, message: this.statusMessage };
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.deps.saveConfig({ enabled });
    if (enabled) await this.start();
    else await this.stop();
  }

  async start(): Promise<void> {
    if (this.polling) return;
    const token = await this.deps.secretGet();
    if (!token) {
      this.status = "unconfigured";
      this.notify();
      return;
    }
    this.api = new BotApi({ token, fetch: this.deps.fetchImpl });
    try {
      const me = await this.api.getMe();
      this.botUsername = me.username ?? this.botUsername;
      await this.api.setMyCommands(BOT_COMMAND_MENU);
    } catch (error) {
      this.status = "error";
      this.statusMessage = errorMessage(error);
      this.notify();
      return;
    }
    this.polling = true;
    this.status = "connected";
    this.notify();
    this.idleTimer = setInterval(() => this.sweepIdle(), 30_000);
    this.idleTimer.unref?.();
    void this.pollLoop();
  }

  async stop(): Promise<void> {
    this.polling = false;
    if (this.idleTimer) { clearInterval(this.idleTimer); this.idleTimer = null; }
    for (const chat of [...this.chats.values()]) {
      this.detach(chat);
      void this.send(chat.chatId, "🧹 Telegram 已停用，已退出会话（SharkBay 终端保留）。");
    }
    this.status = "disabled";
    this.notify();
  }

  generatePairCode(): TelegramPairCodeResult {
    return this.pairStore.issueCode();
  }

  async revokeUser(telegramUserId: number): Promise<void> {
    this.pairStore.revoke(telegramUserId);
    const chat = this.chats.get(telegramUserId);
    if (chat) { this.detach(chat); void this.send(chat.chatId, "🔒 访问已被吊销。"); }
    await this.persistUsers();
    this.notify();
  }

  // --- polling --------------------------------------------------------------

  private async pollLoop(): Promise<void> {
    while (this.polling && this.api) {
      try {
        const updates = (await this.api.getUpdates(this.offset, POLL_TIMEOUT_SEC)) as TelegramUpdate[];
        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.handleUpdate(update).catch(() => { /* fail-safe per update */ });
        }
      } catch {
        // Network/timeout — back off, never throw into the app.
        await delay(POLL_ERROR_BACKOFF_MS);
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) return this.handleCallback(update.callback_query);
    const message = update.message;
    if (!message?.text || !message.from) return;
    const chatId = message.chat.id;
    const from = message.from;
    const text = message.text;
    const displayName = from.username ? `@${from.username}` : (from.first_name ?? String(from.id));

    const dispatch = dispatchMessage(text);

    // Unauthenticated users: only /start and /pair.
    if (!this.pairStore.isAuthorized(from.id)) {
      if (dispatch.kind === "bot" && dispatch.command === "start") return this.sendStartUnpaired(chatId);
      if (dispatch.kind === "bot" && dispatch.command === "pair") return this.handlePair(chatId, from.id, displayName, dispatch.args);
      await this.send(chatId, UNAUTHORIZED_TEXT);
      return;
    }

    if (dispatch.kind === "unknownCommand") { await this.send(chatId, UNKNOWN_COMMAND_TEXT); return; }
    if (dispatch.kind === "agent") {
      // A bare number while NOT in a chat selects from the last shown list.
      if (!this.chats.has(from.id) && /^\d+$/.test(text.trim())) {
        const rows = this.lastListKind === "resume" ? this.lastResumeRows : this.lastSessionRows;
        const id = parseSelection(text, rows, this.lastListKind);
        if (id) return this.lastListKind === "resume" ? this.selectResume(chatId, from.id, id) : this.enterChat(chatId, from.id, id);
      }
      return this.handleAgentInput(chatId, from.id, text, dispatch.text);
    }

    switch (dispatch.command) {
      case "start": return this.sendStartPaired(chatId);
      case "pair": await this.send(chatId, "你已配对。发送 /sessions 查看会话。"); return;
      case "help": await this.send(chatId, HELP_TEXT); return;
      case "whoami": return this.sendWhoami(chatId, from.id);
      case "machine": return this.sendMachine(chatId);
      case "sessions": return this.sendSessions(chatId, dispatch.args);
      case "resume": return this.sendResume(chatId, dispatch.args);
      case "tasks": return this.sendTasks(chatId, from.id);
      case "status": return this.sendStatus(chatId, from.id);
      case "stop": return this.handleStop(chatId, from.id);
    }
  }

  private async handleCallback(cb: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
    const chatId = cb.message?.chat.id;
    if (chatId === undefined) return;
    if (!this.pairStore.isAuthorized(cb.from.id)) { await this.api?.answerCallbackQuery(cb.id, "未授权"); return; }
    const data = cb.data ?? "";
    if (data.startsWith("akey:")) {
      await this.api?.answerCallbackQuery(cb.id, "已发送");
      const chat = this.chats.get(cb.from.id);
      if (chat) {
        const key = data.slice("akey:".length);
        const input = key === "y" ? "y\r" : key === "n" ? "n\r" : "\r";
        this.deps.inputTerminal(chat.ptyId, input);
        chat.lastActivityAt = this.now();
        this.clearApproval(chat);
      }
      return;
    }
    if (data === "sessions:refresh") { await this.api?.answerCallbackQuery(cb.id); return this.sendSessions(chatId, ""); }
    if (data === "resume:refresh") { await this.api?.answerCallbackQuery(cb.id); return this.sendResume(chatId, ""); }
    if (data.startsWith("task:")) {
      await this.api?.answerCallbackQuery(cb.id);
      const chat = this.chats.get(cb.from.id);
      const index = Number.parseInt(data.slice("task:".length), 10);
      const task = chat?.lastTasks[index];
      if (task) {
        await this.sendFormatted(chatId, task.raw);
      } else {
        await this.send(chatId, "任务列表已过期，请重新 /tasks。");
      }
      return;
    }
    if (data.startsWith("use:")) {
      await this.api?.answerCallbackQuery(cb.id);
      const id = parseSelection(data, this.lastSessionRows, "use");
      if (id) return this.enterChat(chatId, cb.from.id, id);
    }
    if (data.startsWith("resume:")) {
      await this.api?.answerCallbackQuery(cb.id);
      const id = parseSelection(data, this.lastResumeRows, "resume");
      if (id) return this.selectResume(chatId, cb.from.id, id);
    }
    await this.api?.answerCallbackQuery(cb.id);
  }

  // --- commands -------------------------------------------------------------

  private async handlePair(chatId: number, userId: number, displayName: string, args: string): Promise<void> {
    const result = this.pairStore.redeem(args, { telegramUserId: userId, displayName });
    if (!result.ok) {
      await this.send(chatId, "❌ 配对失败：配对码无效或已过期。\n请在 SharkBay 重新生成配对码后再试。");
      return;
    }
    await this.persistUsers();
    this.notify();
    const identity = await this.deps.getMachineIdentity();
    await this.send(chatId, `✅ 配对成功\n你（${displayName}）现在可以控制 ${identity.label}（${identity.machineId}）。\n发送 /sessions 开始。`);
  }

  private async sendStartUnpaired(chatId: number): Promise<void> {
    const id = await this.deps.getMachineIdentity();
    await this.send(chatId, `👋 欢迎使用 SharkBay 远程控制\n\n这台机器：${id.label}（${id.machineId}）\n你还未配对。请在 Settings → Telegram 生成配对码，然后发送：\n/pair <配对码>\n\n需要帮助发送 /help`);
  }

  private async sendStartPaired(chatId: number): Promise<void> {
    const id = await this.deps.getMachineIdentity();
    await this.send(chatId, `👋 已连接到 ${id.label}（${id.machineId}）\n发送 /sessions 查看会话，/help 查看全部命令。`);
  }

  private async sendWhoami(chatId: number, userId: number): Promise<void> {
    const user = this.pairStore.get(userId);
    const id = await this.deps.getMachineIdentity();
    const chat = this.chats.get(userId);
    const lines = [
      `👤 ${user?.displayName ?? userId}（id ${userId}）`,
      `配对时间：${user?.pairedAt ?? "-"}`,
      `绑定机器：${id.label}（${id.machineId}）`,
      `当前聊天态：${chat ? `#会话 ${chat.row.projectName}` : "无"}`,
    ];
    await this.send(chatId, lines.join("\n"));
  }

  private async sendMachine(chatId: number): Promise<void> {
    const id = await this.deps.getMachineIdentity();
    const { total } = await this.deps.listSessions();
    const open = (await this.deps.listOpenSessions()).length;
    await this.send(chatId, `🖥 ${id.label}\nGitHub: u${id.githubUserId ?? "?"}\nMachine: ${id.machineId}\n已打开会话：${open} ｜ 历史会话：${total}\n/sessions 进入已打开 · /resume 恢复历史。`);
  }

  private async sendSessions(chatId: number, args: string): Promise<void> {
    const limit = parsePositiveInt(args) ?? DEFAULT_SESSIONS_LIMIT;
    const open = await this.deps.listOpenSessions();
    const shown = open.slice(0, limit);
    this.lastSessionRows = shown;
    this.lastListKind = "use";
    const { text, buttons } = renderSessionsList(shown, open.length, this.now(), {
      prefix: "use",
      header: `已打开会话（${open.length}）`,
      footer: "点按钮或回数字序号进入；未打开的历史会话用 /resume",
      empty: "当前没有已打开的 agent 会话。用 /resume 恢复历史会话。",
    });
    await this.send(chatId, text, buttons.length ? toReplyMarkup(buttons) : undefined);
  }

  private async sendResume(chatId: number, args: string): Promise<void> {
    const limit = parsePositiveInt(args) ?? DEFAULT_SESSIONS_LIMIT;
    const { rows } = await this.deps.listSessions();
    const notOpen = rows.filter((r) => this.deps.resolveOpenTerminal(r.sessionId) === null);
    const shown = notOpen.slice(0, limit);
    this.lastResumeRows = shown;
    this.lastListKind = "resume";
    const { text, buttons } = renderSessionsList(shown, notOpen.length, this.now(), {
      prefix: "resume",
      refresh: "resume:refresh",
      header: `未打开的历史会话（${notOpen.length}）`,
      footer: "点按钮或回数字序号，在 SharkBay 中恢复并进入",
      empty: "没有可恢复的历史会话。",
    });
    await this.send(chatId, text, buttons.length ? toReplyMarkup(buttons) : undefined);
  }

  private async sendTasks(chatId: number, userId: number): Promise<void> {
    const chat = this.chats.get(userId);
    if (!chat) { await this.send(chatId, "请先进入一个会话（/sessions）再查看其任务。"); return; }
    const tasks = await this.deps.listSessionTasks(chat.projectPath, chat.hookSessionId).catch(() => []);
    if (tasks.length === 0) { await this.send(chatId, "未找到与当前会话关联的任务。"); return; }
    chat.lastTasks = tasks;
    const buttons = tasks.map((task, i) => ({
      text: `${i + 1}. ${task.title || task.taskId}`.slice(0, 60),
      callbackData: `task:${i}`,
    }));
    await this.send(chatId, `本会话关联的任务（${tasks.length}）：`, toReplyMarkup(buttons));
  }

  private async sendStatus(chatId: number, userId: number): Promise<void> {
    const chat = this.chats.get(userId);
    if (!chat) { await this.send(chatId, NOT_IN_CHAT_TEXT); return; }
    const live = this.deps.currentStatus?.(chat.row) ?? null;
    const state = live?.state ?? chat.liveState;
    const action = live?.action ?? chat.lastAction;
    chat.liveState = state;
    chat.lastAction = action;
    const model = chat.row.model ? `/${chat.row.model}` : "";
    await this.send(chatId, `💬 项目：${chat.row.projectName}\n模型：${chat.row.agentId}${model}\n状态：${statusBadge(state)} ${stateWord(state)}\n最近动作：${action || "-"}`);
  }

  private async handleStop(chatId: number, userId: number): Promise<void> {
    const chat = this.chats.get(userId);
    if (!chat) { await this.send(chatId, NOT_IN_CHAT_TEXT); return; }
    this.detach(chat);
    await this.send(chatId, `🧹 已退出会话 ${chat.row.projectName}（SharkBay 中的终端保持打开）。\n发送 /sessions 进入其它会话。`);
  }

  // --- chat bridge ----------------------------------------------------------

  private async enterChat(chatId: number, userId: number, sessionId: string): Promise<void> {
    const row = this.lastSessionRows.find((r) => r.sessionId === sessionId);
    if (!row) { await this.send(chatId, "会话已过期，请重新 /sessions。"); return; }
    const terminalId = row.terminalId ?? this.deps.resolveOpenTerminal(row.sessionId);
    if (!terminalId) {
      await this.send(chatId, "该会话当前未在 SharkBay 打开。用 /resume 恢复后再进入。");
      return;
    }
    return this.attach(chatId, userId, row, terminalId);
  }

  private async selectResume(chatId: number, userId: number, sessionId: string): Promise<void> {
    const row = this.lastResumeRows.find((r) => r.sessionId === sessionId);
    if (!row) { await this.send(chatId, "列表已过期，请重新 /resume。"); return; }
    await this.send(chatId, `♻️ 正在 SharkBay 中恢复 ${row.projectName} 会话…`);
    try {
      await this.deps.restoreSession(row);
    } catch (error) {
      await this.send(chatId, `⚠️ 恢复失败：${errorMessage(error)}`);
      return;
    }
    const terminalId = await this.waitForOpen(row.sessionId, 20_000);
    if (!terminalId) {
      await this.send(chatId, "已请求恢复；待 SharkBay 打开后用 /sessions 进入。");
      return;
    }
    return this.attach(chatId, userId, row, terminalId);
  }

  /** Bind a Telegram chat to an open SharkBay terminal and sync current state. */
  private async attach(chatId: number, userId: number, row: TelegramSessionRow, terminalId: string): Promise<void> {
    const existing = this.chats.get(userId);
    if (existing) this.detach(existing); // switch sessions; leave the old tab open

    const live = this.deps.currentStatus?.(row) ?? null;
    const state: SessionState | null = live?.state ?? row.state;
    const chat: ChatSession = {
      chatId,
      telegramUserId: userId,
      ptyId: terminalId,
      hookSessionId: row.sessionId,
      projectPath: row.projectPath,
      row,
      turn: null,
      progressMessageId: null,
      buffer: "",
      lastEditAt: 0,
      lastActivityAt: this.now(),
      liveState: state,
      lastAction: live?.action ?? "",
      editTimer: null,
      transcriptCursor: null,
      typingTimer: null,
      approvalMessageId: null,
      lastProgressText: "",
      lastTasks: [],
    };
    this.chats.set(userId, chat);
    this.ptyToChat.set(terminalId, userId);

    const model = row.model ? `/${row.model}` : "";
    const header = `💬 ${row.projectName} ｜ ${row.agentId}${model} ｜ ${statusBadge(state)} ${stateWord(state)}`;

    if (state === "approval") {
      await this.send(chatId, `${header}\n（已映射到 SharkBay 终端）`);
      this.beginPassiveTurn(chat);
      if (chat.turn) chat.turn = applyTurnEvent(chat.turn, { type: "status", state: "approval", at: this.now(), hookSessionId: row.sessionId, projectPath: row.projectPath }).turn;
      void this.sendApproval(chat);
      return;
    }

    if (state === "working") {
      await this.send(chatId, `${header}\n（已映射到 SharkBay 终端）`);
      this.beginPassiveTurn(chat);
      this.startTyping(chat);
      return;
    }

    // stopped / unknown → last turn's clean result, then a single combined info line.
    const cursor = this.deps.transcript?.turnStartCursor(row) ?? null;
    const answer = cursor != null ? (this.deps.transcript?.answer(row, cursor) ?? null) : null;
    if (answer) {
      await this.sendFormatted(chatId, answer);
    } else {
      await this.send(chatId, "（暂无最近一轮回复记录）");
    }
    await this.send(chatId, `${header}\n（已映射到 SharkBay 终端）· 直接发消息开始新一轮`);
  }

  private async waitForOpen(hookSessionId: string, timeoutMs: number): Promise<string | null> {
    const deadline = this.now() + timeoutMs;
    while (this.now() < deadline) {
      const terminalId = this.deps.resolveOpenTerminal(hookSessionId);
      if (terminalId) return terminalId;
      await delay(800);
    }
    return null;
  }

  private async handleAgentInput(chatId: number, userId: number, originalText: string, agentText: string): Promise<void> {
    const chat = this.chats.get(userId);
    if (!chat) { await this.send(chatId, NOT_IN_CHAT_TEXT); return; }
    chat.lastActivityAt = this.now();
    // Close any previous unfinished turn first (it stops its own typing).
    if (chat.turn && chat.turn.state !== "done") await this.finalizeChat(chat);
    // Immediately acknowledge: show "typing…" and forward the prompt to SharkBay
    // right away, so the user gets instant feedback instead of waiting for output.
    this.startTyping(chat);
    chat.buffer = "";
    chat.lastProgressText = "";
    chat.transcriptCursor = this.deps.transcript?.cursor(chat.row) ?? null;
    chat.turn = createTurn({
      turnId: `${chat.ptyId}-${this.now()}`,
      hookSessionId: chat.hookSessionId,
      projectPath: chat.projectPath,
      ptyId: chat.ptyId,
      startedAt: this.now(),
    });
    this.deps.inputTerminal(chat.ptyId, `${agentText}\r`);
    const progress = await this.send(chatId, "🫧 working…");
    chat.progressMessageId = progress ?? null;
  }

  /** Fed from core terminalData. */
  feedTerminalData(ptyId: string, data: string): void {
    const userId = this.ptyToChat.get(ptyId);
    if (userId === undefined) return;
    const chat = this.chats.get(userId);
    if (!chat) return;
    chat.lastActivityAt = this.now();
    // Ignore output produced while no turn is active — this drops the resume
    // replay / boot banner the agent prints before the user's prompt is processed.
    if (!chat.turn || chat.turn.state === "done") return;
    chat.buffer += data;
    const res = applyTurnEvent(chat.turn, { type: "ptyData", at: this.now(), ptyId });
    chat.turn = res.turn;
    this.scheduleEdit(chat);
  }

  /** Fed from core terminalExit. */
  feedTerminalExit(ptyId: string): void {
    const userId = this.ptyToChat.get(ptyId);
    if (userId === undefined) return;
    const chat = this.chats.get(userId);
    if (!chat) return;
    if (chat.turn) {
      const res = applyTurnEvent(chat.turn, { type: "ptyExit", ptyId });
      chat.turn = res.turn;
      if (res.action === "finalize") void this.finalizeChat(chat);
    }
    this.detach(chat);
    void this.send(chat.chatId, "会话所在的 SharkBay 终端已关闭，已退出。");
  }

  /** Fed from hookStateManager stateChange. */
  feedStatusChange(input: StatusChangeInput): void {
    const userId = [...this.chats.values()].find((c) => c.hookSessionId === input.sessionId)?.telegramUserId;
    if (userId === undefined) return;
    const chat = this.chats.get(userId);
    if (!chat) return;
    chat.liveState = input.state;
    chat.lastAction = input.action;
    // Keep the typing indicator in sync, and mirror turns started outside Telegram
    // (e.g. the user typing in the SharkBay tab) by opening a passive turn here.
    if (input.state === "working") {
      this.startTyping(chat);
      if (!chat.turn || chat.turn.state === "done") this.beginPassiveTurn(chat);
    } else {
      this.stopTyping(chat);
    }
    if (!chat.turn) return;
    const wasWorking = chat.turn.sawWorking;
    const res = applyTurnEvent(chat.turn, { type: "status", state: input.state, at: input.at, hookSessionId: input.sessionId, projectPath: input.projectPath });
    chat.turn = res.turn;
    // First time the agent actually starts processing THIS turn: clear anything
    // captured so far (resume history replay / echoed prompt) so the final
    // message contains only this turn's answer.
    if (input.state === "working" && !wasWorking) {
      chat.buffer = "";
    }
    if (res.action === "approvalHold") {
      void this.sendApproval(chat);
    } else if (res.action === "approvalRelease") {
      this.clearApproval(chat);
    } else if (res.action === "finalize") {
      void this.finalizeChat(chat);
    }
  }

  private scheduleEdit(chat: ChatSession): void {
    if (chat.editTimer || chat.progressMessageId === null) return;
    const elapsed = this.now() - chat.lastEditAt;
    const wait = Math.max(0, EDIT_THROTTLE_MS - elapsed);
    chat.editTimer = setTimeout(() => {
      chat.editTimer = null;
      this.flushEdit(chat);
    }, wait);
    chat.editTimer.unref?.();
  }

  private flushEdit(chat: ChatSession): void {
    if (chat.progressMessageId === null) return;
    chat.lastEditAt = this.now();
    const text = this.renderProgress(chat);
    void this.api?.editMessageText(chat.chatId, chat.progressMessageId, text || "🫧 working…");
  }

  /** Open a turn that mirrors output for a turn started outside Telegram. */
  private beginPassiveTurn(chat: ChatSession): void {
    chat.transcriptCursor = this.deps.transcript?.turnStartCursor(chat.row) ?? null;
    let turn = createTurn({ turnId: `${chat.ptyId}-${this.now()}`, hookSessionId: chat.hookSessionId, projectPath: chat.projectPath, ptyId: chat.ptyId, startedAt: this.now() });
    turn = applyTurnEvent(turn, { type: "status", state: "working", at: this.now(), hookSessionId: chat.hookSessionId, projectPath: chat.projectPath }).turn;
    chat.turn = turn;
    chat.buffer = "";
    chat.lastProgressText = "";
    void this.send(chat.chatId, "🫧 working…").then((id) => {
      if (chat.turn && chat.turn.state !== "done" && chat.progressMessageId === null) chat.progressMessageId = id ?? null;
    });
  }

  /** Keep the "typing…" indicator alive while the session is working (~5s per ping). */
  private startTyping(chat: ChatSession): void {
    if (chat.typingTimer) return;
    void this.api?.sendChatAction(chat.chatId, "typing");
    chat.typingTimer = setInterval(() => { void this.api?.sendChatAction(chat.chatId, "typing"); }, 4000);
    chat.typingTimer.unref?.();
  }

  private stopTyping(chat: ChatSession): void {
    if (chat.typingTimer) { clearInterval(chat.typingTimer); chat.typingTimer = null; }
  }

  /** Show the approval prompt with inline buttons (once per pending approval). */
  private async sendApproval(chat: ChatSession): Promise<void> {
    if (chat.approvalMessageId !== null) return;
    const id = await this.send(chat.chatId, "🔴 需要审批，请选择：", approvalKeyboard());
    chat.approvalMessageId = id;
  }

  /** Remove the approval prompt once resolved (choice made or released elsewhere). */
  private clearApproval(chat: ChatSession): void {
    if (chat.approvalMessageId !== null) {
      void this.api?.deleteMessage(chat.chatId, chat.approvalMessageId);
      chat.approvalMessageId = null;
    }
  }

  private renderProgress(chat: ChatSession): string {
    const transcript = this.deps.transcript;
    const supported = transcript?.supports?.(chat.row.agentId) ?? false;
    // For agents with a transcript reader, NEVER show the raw PTY (TUI redraw
    // frames). During pure thinking the clean progress is empty → keep the last
    // clean progress, or a thinking placeholder.
    if (supported && chat.transcriptCursor != null) {
      const clean = transcript!.progress(chat.row, chat.transcriptCursor);
      if (clean) {
        const tail = clean.split("\n").slice(-8).join("\n");
        chat.lastProgressText = tail.length > 600 ? `…${tail.slice(-600)}` : tail;
      }
      return chat.lastProgressText || "🫧 思考中…";
    }
    // Fallback (agents without a transcript reader): capped PTY tail.
    const ptyClean = stripAnsi(chat.buffer);
    if (!ptyClean) return "🫧 working…";
    return ptyClean.length > PROGRESS_TAIL_CHARS ? `…${ptyClean.slice(-PROGRESS_TAIL_CHARS)}` : ptyClean;
  }

  private async finalizeChat(chat: ChatSession): Promise<void> {
    if (chat.editTimer) { clearTimeout(chat.editTimer); chat.editTimer = null; }
    this.stopTyping(chat);
    this.clearApproval(chat);
    // Delete the progress message → client plays the particle dissolve animation.
    if (chat.progressMessageId !== null) {
      void this.api?.deleteMessage(chat.chatId, chat.progressMessageId);
      chat.progressMessageId = null;
    }

    // Prefer the clean answer reconstructed from the agent transcript; the PTY
    // stream of a TUI agent is redraw frames and cannot be sent verbatim.
    let final: string | null = null;
    if (chat.transcriptCursor != null) {
      final = this.deps.transcript?.answer(chat.row, chat.transcriptCursor) ?? null;
    }
    if (!final) {
      // Fallback (agents without a transcript reader): capped PTY tail.
      const clean = stripAnsi(chat.buffer).trim();
      final = clean || "（本轮无文本回复）";
      if (final.length > FINAL_MAX_CHARS) {
        final = `…（仅显示最近 ${FINAL_MAX_CHARS} 字符）\n${final.slice(-FINAL_MAX_CHARS)}`;
      }
    }
    await this.sendFormatted(chat.chatId, final);
    chat.buffer = "";
    chat.transcriptCursor = null;
    chat.turn = null;
  }

  /** Unbind a Telegram chat from its terminal. Never closes the SharkBay tab. */
  private detach(chat: ChatSession): void {
    if (chat.editTimer) { clearTimeout(chat.editTimer); chat.editTimer = null; }
    this.stopTyping(chat);
    this.clearApproval(chat);
    this.chats.delete(chat.telegramUserId);
    this.ptyToChat.delete(chat.ptyId);
  }

  private sweepIdle(): void {
    const cutoff = this.now() - this.idleTimeoutMs;
    for (const chat of [...this.chats.values()]) {
      if (chat.lastActivityAt < cutoff) {
        this.detach(chat);
        void this.send(chat.chatId, "⌛ 空闲超时，已退出会话（SharkBay 终端保留）。");
      }
    }
  }

  // --- helpers --------------------------------------------------------------

  private async send(chatId: number, text: string, replyMarkup?: ReplyMarkup): Promise<number | null> {
    try {
      const msg = await this.api?.sendMessage({ chatId, text, replyMarkup });
      return msg?.message_id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Send Markdown content rendered as Telegram MarkdownV2 (bold, code blocks,
   * links…). Chunks by raw lines first, formats each chunk independently, and
   * falls back to plain text per chunk if formatting/sending fails.
   */
  private async sendFormatted(chatId: number, text: string): Promise<void> {
    for (const piece of chunkMessage(text)) {
      const formatted = formatForTelegram(piece);
      if (formatted) {
        try {
          await this.api?.sendMessage({ chatId, text: formatted, parseMode: "MarkdownV2" });
          continue;
        } catch {
          // fall back to plain text below
        }
      }
      await this.send(chatId, piece);
    }
  }

  private async persistUsers(): Promise<void> {
    await this.deps.saveConfig({ pairedUsers: this.pairStore.list() });
  }

  private notify(): void {
    this.deps.onStatusChanged?.();
  }
}

function toReplyMarkup(buttons: { text: string; callbackData: string }[]): ReplyMarkup {
  return { inline_keyboard: buttons.map((b) => [{ text: b.text, callback_data: b.callbackData }]) };
}

function stateWord(state: SessionState | null): string {
  switch (state) {
    case "working": return "working";
    case "stopped": return "stopped";
    case "approval": return "approval";
    default: return "unknown";
  }
}

function approvalKeyboard(): ReplyMarkup {
  return {
    inline_keyboard: [[
      { text: "✅ 同意 (y)", callback_data: "akey:y" },
      { text: "❌ 拒绝 (n)", callback_data: "akey:n" },
      { text: "↵ 回车", callback_data: "akey:enter" },
    ]],
  };
}

function parsePositiveInt(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
