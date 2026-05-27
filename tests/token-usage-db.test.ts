import { describe, expect, it } from "vitest";
import { toUsageGroupRow, usageFreshInputTokens, usageTotalInputTokens } from "../src/main/token-usage-db.js";

describe("token usage db", () => {
  it("maps SQL usage report rows to renderer-facing camelCase fields", () => {
    const row = toUsageGroupRow({
      key: "/tmp/example-project",
      input_tokens: 1200,
      output_tokens: 340,
      cache_creation_tokens: 12,
      cache_read_tokens: 56,
      total_input_tokens: 1268,
      cost_usd: null,
    });

    expect(row).toEqual({
      key: "/tmp/example-project",
      inputTokens: 1200,
      outputTokens: 340,
      cacheCreationTokens: 12,
      cacheReadTokens: 56,
      totalInputTokens: 1268,
      costUsd: null,
    });
    expect(row).not.toHaveProperty("input_tokens");
  });

  it("normalizes fresh and total input consistently for Codex and Claude cache fields", () => {
    expect(
      usageFreshInputTokens({
        agentId: "codex",
        inputTokens: 1000,
        cacheReadTokens: 900,
      })
    ).toBe(100);
    expect(
      usageTotalInputTokens({
        agentId: "codex",
        inputTokens: 1000,
        cacheCreationTokens: 0,
        cacheReadTokens: 900,
      })
    ).toBe(1000);

    expect(
      usageFreshInputTokens({
        agentId: "claude",
        inputTokens: 100,
        cacheReadTokens: 800,
      })
    ).toBe(100);
    expect(
      usageTotalInputTokens({
        agentId: "claude",
        inputTokens: 100,
        cacheCreationTokens: 20,
        cacheReadTokens: 800,
      })
    ).toBe(920);
  });
});
