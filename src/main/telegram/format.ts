/**
 * Convert agent/task Markdown into Telegram MarkdownV2 via telegramify-markdown
 * (handles all the fragile MarkdownV2 escaping). Returns null on failure so the
 * caller can fall back to sending plain text — formatting must never drop a message.
 */

import telegramifyMarkdown from "telegramify-markdown";

export function formatForTelegram(text: string): string | null {
  try {
    const out = telegramifyMarkdown(text, "escape");
    return typeof out === "string" && out.trim() ? out : null;
  } catch {
    return null;
  }
}
