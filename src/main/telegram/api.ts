/**
 * Telegram Bot API client (spec tasks #2 / api.ts).
 *
 * Thin outbound `fetch` wrapper. Long polling and all sends go through here.
 * Handles request timeouts and 429 rate-limit backoff (honoring `retry_after`).
 * Pure of Electron/core; `fetch` is injectable for tests.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type BotApiOptions = {
  token: string;
  fetch?: FetchLike;
  /** Per-request timeout (ms) for non-polling calls. */
  timeoutMs?: number;
  /** Max retries on 429 / transient network error. */
  maxRetries?: number;
  baseUrl?: string;
};

export type TelegramUser = { id: number; is_bot: boolean; first_name: string; username?: string };

export type InlineKeyboardButton = { text: string; callback_data: string };
export type ReplyMarkup = { inline_keyboard: InlineKeyboardButton[][] };

export type BotCommandSpec = { command: string; description: string };

export type SendMessageParams = {
  chatId: number;
  text: string;
  replyMarkup?: ReplyMarkup;
  disableNotification?: boolean;
};

export type TelegramMessage = { message_id: number; chat: { id: number } };

export class TelegramApiError extends Error {
  constructor(message: string, readonly errorCode?: number, readonly retryAfter?: number) {
    super(message);
    this.name = "TelegramApiError";
  }
}

export class BotApi {
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  constructor(options: BotApiOptions) {
    this.token = options.token;
    this.fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseUrl = options.baseUrl ?? "https://api.telegram.org";
  }

  getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>("getMe", {});
  }

  setMyCommands(commands: BotCommandSpec[]): Promise<boolean> {
    return this.call<boolean>("setMyCommands", { commands });
  }

  /** Long polling. Uses a longer timeout than normal calls (timeout + slack). */
  getUpdates(offset: number, timeoutSec = 30): Promise<unknown[]> {
    return this.call<unknown[]>(
      "getUpdates",
      { offset, timeout: timeoutSec, allowed_updates: ["message", "callback_query"] },
      { timeoutMs: (timeoutSec + 10) * 1000, retries: 0 },
    );
  }

  async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    return this.call<TelegramMessage>("sendMessage", {
      chat_id: params.chatId,
      text: params.text,
      reply_markup: params.replyMarkup,
      disable_notification: params.disableNotification,
    });
  }

  editMessageText(chatId: number, messageId: number, text: string, replyMarkup?: ReplyMarkup): Promise<TelegramMessage | boolean> {
    return this.call<TelegramMessage | boolean>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup,
    });
  }

  deleteMessage(chatId: number, messageId: number): Promise<boolean> {
    return this.call<boolean>("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.call<boolean>("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  }

  /** Show the "typing…" indicator (~5s). Best-effort: no retries. */
  sendChatAction(chatId: number, action = "typing"): Promise<boolean> {
    return this.call<boolean>("sendChatAction", { chat_id: chatId, action }, { retries: 0 });
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    opts: { timeoutMs?: number; retries?: number } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/bot${this.token}/${method}`;
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const maxRetries = opts.retries ?? this.maxRetries;

    let attempt = 0;
    for (;;) {
      try {
        const result = await this.once<T>(url, body, timeoutMs);
        return result;
      } catch (error) {
        const retryAfter = error instanceof TelegramApiError ? error.retryAfter : undefined;
        const retriable = retryAfter !== undefined || isTransient(error);
        if (!retriable || attempt >= maxRetries) throw error;
        await delay(retryAfter !== undefined ? retryAfter * 1000 : backoffMs(attempt));
        attempt += 1;
      }
    }
  }

  private async once<T>(url: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prune(body)),
        signal: controller.signal,
      });
      const payload = (await response.json()) as { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };
      if (!payload.ok) {
        throw new TelegramApiError(payload.description ?? "Telegram API error", payload.error_code, payload.parameters?.retry_after);
      }
      return payload.result as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

function prune(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) out[k] = v;
  return out;
}

function isTransient(error: unknown): boolean {
  if (error instanceof TelegramApiError) return error.errorCode === 429 || (error.errorCode ?? 0) >= 500;
  return true; // network/abort errors are transient
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
