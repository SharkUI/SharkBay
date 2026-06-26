/**
 * Message dispatch for the Telegram connector (spec §5.1).
 *
 * Single-slash is always a bot command; `//` is an explicit passthrough to the
 * agent; an unknown single-slash command is rejected (never silently forwarded);
 * plain text is forwarded to the agent as a prompt.
 *
 * Only the very beginning of the message matters — a mid-message `//` (e.g. a URL)
 * never triggers passthrough. No special-casing for paths like `/Users/...`.
 */

import { isBotCommand, type BotCommandName } from "./types.js";

export type Dispatch =
  | { kind: "bot"; command: BotCommandName; args: string }
  | { kind: "agent"; text: string }
  | { kind: "unknownCommand"; raw: string };

/**
 * Classify a raw incoming message. Pure: the caller layers chat-state on top
 * (e.g. an "agent" dispatch with no active chat session becomes a guidance reply).
 */
export function dispatchMessage(raw: string): Dispatch {
  const message = raw.replace(/^\s+/, "");

  // `//rest` → agent receives `/rest` (drop exactly one leading slash).
  if (message.startsWith("//")) {
    return { kind: "agent", text: message.slice(1) };
  }

  // Single leading slash → bot command namespace.
  if (message.startsWith("/")) {
    const firstToken = message.slice(1).split(/\s+/, 1)[0] ?? "";
    // Strip a Telegram group mention suffix: `/sessions@my_bot`.
    const name = firstToken.split("@", 1)[0]!.toLowerCase();
    if (name && isBotCommand(name)) {
      const args = message.slice(1 + firstToken.length).trim();
      return { kind: "bot", command: name, args };
    }
    return { kind: "unknownCommand", raw: message };
  }

  // Plain text → agent prompt.
  return { kind: "agent", text: message };
}
