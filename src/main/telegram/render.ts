/**
 * Pure rendering helpers for Telegram messages (spec §6).
 *
 * No Telegram/Electron imports — these turn domain data into message text,
 * inline-keyboard button descriptors, and parse the user's numeric session pick.
 */

import type { SessionState, TelegramSessionRow } from "./types.js";

export const TELEGRAM_MAX_MESSAGE = 4096;

export type InlineButton = { text: string; callbackData: string };

export function statusBadge(state: SessionState | null): string {
  switch (state) {
    case "working":
      return "🟢";
    case "stopped":
      return "🟡";
    case "approval":
      return "🔴";
    default:
      return "⚪";
  }
}

export function relativeTime(fromIso: string, now: number = Date.now()): string {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.round(hr / 24);
  return `${day} 天前`;
}

const BUTTON_LABEL_MAX = 50;

/** Rich single-line button label: index · badge · project · agent/model · title. */
export function sessionButtonLabel(index: number, row: TelegramSessionRow): string {
  const model = row.model ? `/${row.model}` : "";
  const desc = (row.subtitle ?? row.title ?? "").replace(/\s+/g, " ").trim();
  const base = `${index}. ${statusBadge(row.state)} ${row.projectName} · ${row.agentId}${model}${desc ? ` · ${desc}` : ""}`;
  return base.length > BUTTON_LABEL_MAX ? `${base.slice(0, BUTTON_LABEL_MAX - 1)}…` : base;
}

export function sessionButtons(rows: TelegramSessionRow[], opts: { prefix?: string; refresh?: string } = {}): InlineButton[] {
  const prefix = opts.prefix ?? "use";
  const buttons = rows.map((row, i) => ({
    text: sessionButtonLabel(i + 1, row),
    callbackData: `${prefix}:${row.sessionId}`,
  }));
  buttons.push({ text: "⟳ 刷新", callbackData: opts.refresh ?? "sessions:refresh" });
  return buttons;
}

export function renderSessionsList(
  rows: TelegramSessionRow[],
  total: number,
  _now?: number,
  opts: { prefix?: string; refresh?: string; header?: string; footer?: string; empty?: string } = {},
): { text: string; buttons: InlineButton[] } {
  if (rows.length === 0) {
    return { text: opts.empty ?? "这台机器暂无 agent 会话记录。", buttons: [] };
  }
  // All per-session info lives on the buttons themselves — the body is just a
  // short header + hint so the message isn't redundant.
  const header = opts.header ?? `最近会话（共 ${total}，显示 ${rows.length}）`;
  const footer = opts.footer ?? "点按钮进入，或直接回复数字序号（如 2）";
  return { text: `${header}\n${footer}`, buttons: sessionButtons(rows, opts) };
}

/**
 * Parse a session pick: a button callback (`use:<id>`) or a bare numeric reply.
 * Returns the chosen sessionId or null.
 */
export function parseSelection(input: string, rows: TelegramSessionRow[], prefix: string = "use"): string | null {
  const trimmed = input.trim();
  const tag = `${prefix}:`;
  if (trimmed.startsWith(tag)) {
    const id = trimmed.slice(tag.length);
    return rows.some((r) => r.sessionId === id) ? id : null;
  }
  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10) - 1;
    return rows[index]?.sessionId ?? null;
  }
  return null;
}

/** Split long text into Telegram-sized chunks, preferring line boundaries. */
export function chunkMessage(text: string, max: number = TELEGRAM_MAX_MESSAGE): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const piece = current ? `${current}\n${line}` : line;
    if (piece.length <= max) {
      current = piece;
      continue;
    }
    if (current) chunks.push(current);
    if (line.length <= max) {
      current = line;
    } else {
      // Hard-split an over-long single line.
      for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export const HELP_TEXT = [
  "SharkBay 远程控制命令",
  "",
  "🔐 配对",
  "/pair <配对码> — 绑定当前账号",
  "/whoami — 查看我的配对信息",
  "",
  "🖥 机器与会话",
  "/machine — 本机信息",
  "/sessions — 已打开的会话（点按钮或回数字序号进入）",
  "/resume — 恢复未打开的历史会话（在 SharkBay 中打开并进入）",
  "/tasks — 本会话关联的任务（点开看全文）",
  "",
  "💬 聊天态",
  "直接发消息 — 作为 prompt 发给当前会话",
  "//xxx — 把斜杠命令发给 agent（如 //compact、//model）",
  "/status — 当前会话状态",
  "/stop — 结束当前会话聊天",
  "",
  "提示：单斜杠是 bot 命令，双斜杠 // 才发给 agent；终端全屏界面无法在 Telegram 显示；消息经 Telegram 中转，非端到端加密。",
].join("\n");

export const UNKNOWN_COMMAND_TEXT = "未知 bot 命令。要发给 agent 请用 //；查看命令发送 /help。";
export const NOT_IN_CHAT_TEXT = "还没有进入会话。先发送 /sessions 选择一个会话。";
export const UNAUTHORIZED_TEXT = "🔒 未授权。请先用 /pair <配对码> 完成配对。";
