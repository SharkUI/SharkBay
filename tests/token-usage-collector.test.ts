import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { codexTotalUsageKey, isTranscriptFileUnchanged, TokenUsageCollector, type CollectorSessionState } from "../src/main/token-usage-collector.js";
import type { TokenEvent, TokenUsageDb } from "../src/main/token-usage-db.js";

describe("token usage collector", () => {
  it.each(["codex", "claude"])("streams %s history and resumes a partial tail with the correct project", async (agentId) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-usage-stream-"));
    const home = vi.spyOn(os, "homedir").mockReturnValue(root);
    const events = new Map<number, TokenEvent>(); let index: { size: number; mtimeMs: number } | null = null;
    const setFileIndex = vi.fn((_file: string, mtimeMs: number, size: number) => { index = { mtimeMs, size }; });
    const db = {
      insertBatch: (items: TokenEvent[]) => { for (const event of items) events.set(event.sourceOffset, event); },
      getFileIndex: () => index, getLastOffset: () => Math.max(0, ...events.keys()), setFileIndex,
    } as unknown as TokenUsageDb;
    try {
      const logs = agentId === "codex" ? path.join(root, ".codex/sessions/2026/11/17") : path.join(root, ".claude/projects/fixture");
      await fs.mkdir(logs, { recursive: true }); const file = path.join(logs, "rollout-fixture.jsonl");
      const meta = agentId === "codex"
        ? { type: "session_meta", payload: { id: "session", originator: "codex-tui", cwd: "/fixture/中文" } }
        : { entrypoint: "cli", sessionId: "session", cwd: "/fixture/中文" };
      const line = agentId === "codex" ? codexTokenCountLine(5, 2, 0, 5, 2, 0) : JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 5, output_tokens: 2 } } });
      const second = agentId === "codex" ? codexTokenCountLine(7, 3, 0, 12, 5, 0) : line;
      const prefix = JSON.stringify(meta) + "\r\n" + line + "\r\n";
      await fs.writeFile(file, prefix + second.slice(0, 15));
      let collector = new TokenUsageCollector(db); await collector.backfill(); collector.flush();
      expect(events.size).toBe(1); expect(setFileIndex).not.toHaveBeenCalled();
      await fs.appendFile(file, second.slice(15) + "\n");
      collector = new TokenUsageCollector(db); await collector.backfill(); collector.flush();
      expect(events.size).toBe(2); expect(events.get(Buffer.byteLength(prefix))).toMatchObject({ projectPath: "/fixture/中文", sessionId: "session" });
      expect(setFileIndex).toHaveBeenCalledTimes(1);
      await new TokenUsageCollector(db).backfill(); expect(events.size).toBe(2); expect(setFileIndex).toHaveBeenCalledTimes(1);
    } finally { home.mockRestore(); await fs.rm(root, { recursive: true, force: true }); }
  });

  it("reports oversized Kiro JSON without reading it or marking it indexed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-usage-kiro-limit-"));
    const home = vi.spyOn(os, "homedir").mockReturnValue(root); const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setFileIndex = vi.fn();
    try {
      const directory = path.join(root, ".kiro/sessions/cli"); await fs.mkdir(directory, { recursive: true });
      const file = await fs.open(path.join(directory, "large.json"), "w"); await file.truncate(128 * 1024 * 1024); await file.close();
      const collector = new TokenUsageCollector({ getFileIndex: () => null, setFileIndex } as unknown as TokenUsageDb);
      await collector.backfill(); expect(setFileIndex).not.toHaveBeenCalled(); expect(warning).toHaveBeenCalledWith(expect.stringContaining("16 MiB"));
    } finally { home.mockRestore(); warning.mockRestore(); await fs.rm(root, { recursive: true, force: true }); }
  });

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
