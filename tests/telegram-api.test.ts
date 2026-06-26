import { describe, expect, it, vi } from "vitest";

import { BotApi, TelegramApiError, type FetchLike } from "../src/main/telegram/api.js";

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as unknown as Response;
}

describe("BotApi", () => {
  it("getMe returns the result on ok", async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () =>
      jsonResponse({ ok: true, result: { id: 1, is_bot: true, first_name: "Bot", username: "my_bot" } }),
    );
    const api = new BotApi({ token: "t", fetch: fetchImpl });
    await expect(api.getMe()).resolves.toMatchObject({ username: "my_bot" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]![0]).toContain("/bott/getMe");
  });

  it("throws TelegramApiError on ok:false", async () => {
    const api = new BotApi({
      token: "t",
      maxRetries: 0,
      fetch: async () => jsonResponse({ ok: false, description: "Unauthorized", error_code: 401 }),
    });
    await expect(api.getMe()).rejects.toBeInstanceOf(TelegramApiError);
  });

  it("retries on 429 honoring retry_after, then succeeds", async () => {
    let calls = 0;
    const api = new BotApi({
      token: "t",
      fetch: async () => {
        calls += 1;
        if (calls === 1) return jsonResponse({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 0 } });
        return jsonResponse({ ok: true, result: { message_id: 5, chat: { id: 9 } } });
      },
    });
    const msg = await api.sendMessage({ chatId: 9, text: "hi" });
    expect(msg.message_id).toBe(5);
    expect(calls).toBe(2);
  });

  it("omits undefined params from the request body", async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () =>
      jsonResponse({ ok: true, result: { message_id: 1, chat: { id: 2 } } }),
    );
    const api = new BotApi({ token: "t", fetch: fetchImpl });
    await api.sendMessage({ chatId: 2, text: "x" });
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ chat_id: 2, text: "x" });
    expect("reply_markup" in body).toBe(false);
  });

  it("stops retrying after maxRetries on non-429 transient error", async () => {
    let calls = 0;
    const api = new BotApi({
      token: "t",
      maxRetries: 2,
      fetch: async () => {
        calls += 1;
        throw new Error("network down");
      },
    });
    await expect(api.getMe()).rejects.toThrow("network down");
    expect(calls).toBe(3); // initial + 2 retries
  });
});
