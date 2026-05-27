import { describe, expect, it } from "vitest";
import { codexTotalUsageKey, TokenUsageCollector, type CollectorSessionState } from "../src/main/token-usage-collector.js";
import type { TokenEvent, TokenUsageDb } from "../src/main/token-usage-db.js";

describe("token usage collector", () => {
  it("deduplicates Codex token counts when total usage does not advance", () => {
    const events: TokenEvent[] = [];
    const collector = new TokenUsageCollector({
      insertBatch: (items: TokenEvent[]) => events.push(...items),
    } as unknown as TokenUsageDb);
    const session: CollectorSessionState = {
      agentId: "codex",
      sessionId: "session",
      projectPath: "/workspace/project",
    };

    collector.processLine(codexTokenCountLine(1000, 40, 900, 1000, 40, 900), "/tmp/codex.jsonl", 0, session);
    collector.processLine(codexTokenCountLine(1000, 40, 900, 1000, 40, 900), "/tmp/codex.jsonl", 100, session);
    collector.processLine(codexTokenCountLine(1100, 60, 900, 2100, 100, 1800), "/tmp/codex.jsonl", 200, session);
    collector.flush();

    expect(events.map((event) => event.inputTokens)).toEqual([1000, 1100]);
    expect(events.map((event) => event.outputTokens)).toEqual([40, 60]);
  });

  it("builds stable Codex total usage keys from known token fields", () => {
    expect(codexTotalUsageKey({
      input_tokens: 2100,
      output_tokens: 100,
      cached_input_tokens: 1800,
      reasoning_output_tokens: 12,
    })).toBe("2100:100:1800:12");
  });
});

function codexTokenCountLine(
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number,
  totalInputTokens: number,
  totalOutputTokens: number,
  totalCachedInputTokens: number,
): string {
  return JSON.stringify({
    timestamp: "2026-05-26T00:00:00.000Z",
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cached_input_tokens: cachedInputTokens,
        },
        total_token_usage: {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          cached_input_tokens: totalCachedInputTokens,
        },
      },
    },
  });
}
