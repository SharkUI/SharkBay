/**
 * Shared types for the Telegram remote-control connector.
 *
 * See `.sharkbay/specs/telegram-remote-control/` for the design. The pure-logic
 * modules (dispatch/ansi/turn/pairing/render) avoid Electron/core imports so they
 * can be unit tested in isolation.
 */

/** Fixed, deliberately small set of bot commands. Agent slash commands never collide
 * because single-slash is always the bot and `//` is the agent passthrough. */
export const BOT_COMMANDS = [
  "start",
  "pair",
  "help",
  "whoami",
  "machine",
  "sessions",
  "resume",
  "new",
  "tasks",
  "status",
  "stop",
] as const;

export type BotCommandName = (typeof BOT_COMMANDS)[number];

export function isBotCommand(name: string): name is BotCommandName {
  return (BOT_COMMANDS as readonly string[]).includes(name);
}

/** Three-state badge reused from the hook state manager. */
export type SessionState = "working" | "stopped" | "approval";

export type PairedUser = {
  telegramUserId: number;
  displayName: string;
  githubUserId?: string;
  pairedAt: string;
};

/** A session row aggregated across configured projects for `/sessions`. */
export type TelegramSessionRow = {
  sessionId: string;
  /** Terminal id of the open SharkBay tab, when this session is currently open. */
  terminalId?: string;
  projectPath: string;
  cwdUri: string;
  projectName: string;
  agentId: string;
  model: string | null;
  title: string | null;
  /** Title or most recent action line. */
  subtitle: string | null;
  lastEventAt: string;
  /** Live state if known, otherwise null (rendered as ⚪ history-only). */
  state: SessionState | null;
};
