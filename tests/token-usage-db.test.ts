import { afterEach, describe, expect, it } from "vitest";
import { TokenUsageDb, type TokenEvent, toUsageGroupRow, usageFreshInputTokens, usageTotalInputTokens } from "../src/main/token-usage-db.js";

import { makeTempRoot } from "./helpers.js";

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


describe("temporary real SQLite usage storage", () => {
  const databases: TokenUsageDb[] = [];
  afterEach(() => { for (const db of databases.splice(0)) db.close(); });
  const open = (root: string) => { const db = new TokenUsageDb(root); databases.push(db); return db; };
  const event = (offset: number, overrides: Partial<TokenEvent> = {}): TokenEvent => ({
    agentId: "codex", sessionId: "session", projectPath: "/fixture/project", model: "fixture",
    inputTokens: 100, outputTokens: 20, cacheCreationTokens: 0, cacheReadTokens: 40, costUsd: null,
    recordedAt: "2026-11-17T00:00:00Z", sourceFile: "/fixture/session.jsonl", sourceOffset: offset, ...overrides,
  });
  it("persists migration, unique event offsets and completed file metadata across reopen", async () => {
    const root = await makeTempRoot("sqlite-usage"); let db = open(root);
    db.insert(event(10)); db.insert(event(10)); db.setFileIndex("/fixture/session.jsonl", 123, 456);
    databases.splice(databases.indexOf(db), 1); db.close(); db = open(root);
    expect(db.hasEvent("/fixture/session.jsonl", 10)).toBe(true); expect(db.getLastOffset("/fixture/session.jsonl")).toBe(10);
    expect(db.getFileIndex("/fixture/session.jsonl")).toEqual({ mtimeMs: 123, size: 456 });
    expect(db.getReport({}).totals.totalInputTokens).toBe(100);
    db.setFileIndex("/fixture/session.jsonl", 999, 1000); expect(db.getFileIndex("/fixture/session.jsonl")).toEqual({ mtimeMs: 999, size: 1000 });
  });
  it("rolls back the entire batch when a later SQL binding fails", async () => {
    const db = open(await makeTempRoot("sqlite-rollback"));
    expect(() => db.insertBatch([event(10), event(20, { inputTokens: Symbol("invalid") as unknown as number })])).toThrow();
    expect(db.hasEvent("/fixture/session.jsonl", 10)).toBe(false); expect(db.getReport({}).totals.totalInputTokens).toBe(0);
    db.insert(event(10)); expect(db.getReport({}).totals.totalInputTokens).toBe(100);
  });
  it("keeps SQL aggregation consistent with provider formulas and project/date filters", async () => {
    const db = open(await makeTempRoot("sqlite-report"));
    const codex = event(10); const claude = event(20, { agentId: "claude", inputTokens: 50, cacheCreationTokens: 10, cacheReadTokens: 70, costUsd: 0.5 });
    db.insertBatch([codex, claude, event(30, { projectPath: "/fixture/other", inputTokens: 999 }), event(40, { recordedAt: "2026-10-01T00:00:00Z" })]);
    const report = db.getReport({ startDate: "2026-11-17", endDate: "2026-11-18" }, ["/fixture/project"]);
    expect(report.totals.inputTokens).toBe(usageFreshInputTokens(codex) + usageFreshInputTokens(claude));
    expect(report.totals.totalInputTokens).toBe(usageTotalInputTokens(codex) + usageTotalInputTokens(claude));
    expect(report.totals.outputTokens).toBe(40); expect(report.totals.costUsd).toBe(0.5); expect(report.byAgent.map(row => row.key).sort()).toEqual(["claude", "codex"]);
  });
});
