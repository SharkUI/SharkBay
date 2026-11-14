import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { codexTotalUsageKey, isTranscriptFileUnchanged, TokenUsageCollector, type CollectorSessionState } from "../src/main/token-usage-collector.js";
import type { TokenEvent, TokenUsageDb } from "../src/main/token-usage-db.js";

describe("token usage collector", () => {
  it("cancels historical backfill between files while retaining collected events", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-usage-stop-"));
    const home = vi.spyOn(os, "homedir").mockReturnValue(root);
    const cancellation = new AbortController();
    const events: TokenEvent[] = [], indexed: string[] = [];
    try {
      const logs = path.join(root, ".claude", "projects", "fixture"); await fs.mkdir(logs, { recursive: true });
      const line = JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 5, output_tokens: 2 } } }) + "\n";
      await fs.writeFile(path.join(logs, "one.jsonl"), line); await fs.writeFile(path.join(logs, "two.jsonl"), line);
      const collector = new TokenUsageCollector({
        insertBatch: (items: TokenEvent[]) => events.push(...items), getFileIndex: () => null, getLastOffset: () => 0,
        setFileIndex: (file: string) => { indexed.push(file); cancellation.abort(); },
      } as unknown as TokenUsageDb);
      await collector.backfill(cancellation.signal); collector.flush();
      expect(indexed).toHaveLength(1); expect(events).toHaveLength(1);
      expect(events[0]?.inputTokens).toBe(5);
    } finally { home.mockRestore(); await fs.rm(root, { recursive: true, force: true }); }
  });
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

  it("treats a transcript as unchanged only when size and mtime both match", () => {
    // Never scanned -> must be processed.
    expect(isTranscriptFileUnchanged(null, { mtimeMs: 1000, size: 10 })).toBe(false);
    // Identical size + mtime -> skip.
    expect(isTranscriptFileUnchanged({ mtimeMs: 1000, size: 10 }, { mtimeMs: 1000, size: 10 })).toBe(true);
    // Grew (size changed) -> process.
    expect(isTranscriptFileUnchanged({ mtimeMs: 1000, size: 10 }, { mtimeMs: 1000, size: 20 })).toBe(false);
    // Rewritten (mtime changed) -> process.
    expect(isTranscriptFileUnchanged({ mtimeMs: 1000, size: 10 }, { mtimeMs: 2000, size: 10 })).toBe(false);
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
