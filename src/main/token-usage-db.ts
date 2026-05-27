import { createRequire } from "node:module";
import path from "node:path";
import type Database from "better-sqlite3";

const requireFromHere = createRequire(import.meta.url);
const BetterSqlite3 = requireFromHere("better-sqlite3") as typeof import("better-sqlite3");

export type TokenEvent = {
  agentId: string;
  sessionId: string | null;
  projectPath: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number | null;
  recordedAt: string;
  sourceFile: string;
  sourceOffset: number;
};

export type UsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number | null;
  periodLabel: string;
};

export type UsageReportFilter = {
  projectPath?: string;
  agentId?: string;
  startDate?: string;
  endDate?: string;
};

export type UsageGroupRow = {
  key: string;
  /** Fresh, non-cache-read input tokens. Codex raw input includes cache reads, so reports subtract them. */
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalInputTokens: number;
  costUsd: number | null;
};

export type UsageReportResult = {
  byProject: UsageGroupRow[];
  byAgent: UsageGroupRow[];
  byDay: UsageGroupRow[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalInputTokens: number;
    costUsd: number | null;
  };
};

export type UsageGroupSqlRow = {
  key: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  total_input_tokens: number | null;
  cost_usd: number | null;
};

export function usageFreshInputTokens(input: {
  agentId: string;
  inputTokens: number;
  cacheReadTokens: number;
}): number {
  if (input.agentId === "codex") {
    return Math.max(input.inputTokens - input.cacheReadTokens, 0);
  }
  return input.inputTokens;
}

export function usageTotalInputTokens(input: {
  agentId: string;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}): number {
  if (input.agentId === "codex") {
    return input.inputTokens + input.cacheCreationTokens;
  }
  return input.inputTokens + input.cacheCreationTokens + input.cacheReadTokens;
}

const freshInputTokensSql = `
  CASE
    WHEN agent_id = 'codex' AND input_tokens > cache_read_tokens THEN input_tokens - cache_read_tokens
    WHEN agent_id = 'codex' THEN 0
    ELSE input_tokens
  END
`;

const totalInputTokensSql = `
  CASE
    WHEN agent_id = 'codex' THEN input_tokens + cache_creation_tokens
    ELSE input_tokens + cache_creation_tokens + cache_read_tokens
  END
`;

export class TokenUsageDb {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private dedupStmt: Database.Statement;

  constructor(userDataPath: string) {
    const dbPath = path.join(userDataPath, "token-usage.db");
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 3000");
    this.migrate();
    this.insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO token_events
        (agent_id, session_id, project_path, model, input_tokens, output_tokens,
         cache_creation_tokens, cache_read_tokens, cost_usd, recorded_at, source_file, source_offset)
      VALUES
        (@agentId, @sessionId, @projectPath, @model, @inputTokens, @outputTokens,
         @cacheCreationTokens, @cacheReadTokens, @costUsd, @recordedAt, @sourceFile, @sourceOffset)
    `);
    this.dedupStmt = this.db.prepare(
      "SELECT 1 FROM token_events WHERE source_file = ? AND source_offset = ? LIMIT 1"
    );
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        project_path TEXT,
        model TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        recorded_at TEXT NOT NULL,
        source_file TEXT NOT NULL,
        source_offset INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup ON token_events(source_file, source_offset);
      CREATE INDEX IF NOT EXISTS idx_project_time ON token_events(project_path, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_agent_time ON token_events(agent_id, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_time ON token_events(recorded_at);
    `);
  }

  hasEvent(sourceFile: string, sourceOffset: number): boolean {
    return this.dedupStmt.get(sourceFile, sourceOffset) != null;
  }

  insert(event: TokenEvent): void {
    this.insertStmt.run({
      agentId: event.agentId,
      sessionId: event.sessionId,
      projectPath: event.projectPath,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheCreationTokens: event.cacheCreationTokens,
      cacheReadTokens: event.cacheReadTokens,
      costUsd: event.costUsd,
      recordedAt: event.recordedAt,
      sourceFile: event.sourceFile,
      sourceOffset: event.sourceOffset,
    });
  }

  insertBatch(events: TokenEvent[]): void {
    const tx = this.db.transaction((items: TokenEvent[]) => {
      for (const event of items) this.insert(event);
    });
    tx(events);
  }

  getSummary(periodDays = 1, allowedProjects?: string[]): UsageSummary {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
    const conditions = ["recorded_at >= ?"];
    const params: unknown[] = [since];

    if (allowedProjects && allowedProjects.length > 0) {
      conditions.push(`project_path IN (${allowedProjects.map(() => "?").join(",")})`);
      params.push(...allowedProjects);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(${totalInputTokensSql}), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens
      FROM token_events
      ${where}
    `).get(...params) as { input_tokens: number; output_tokens: number };

    const periodLabel = periodDays === 1 ? "Today" : `${periodDays}d`;
    return {
      totalInputTokens: row.input_tokens,
      totalOutputTokens: row.output_tokens,
      totalCostUsd: null,
      periodLabel,
    };
  }

  getReport(filter: UsageReportFilter, allowedProjects?: string[]): UsageReportResult {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (allowedProjects && allowedProjects.length > 0) {
      conditions.push(`project_path IN (${allowedProjects.map(() => "?").join(",")})`);
      params.push(...allowedProjects);
    }

    if (filter.projectPath) {
      conditions.push("project_path = ?");
      params.push(filter.projectPath);
    }
    if (filter.agentId) {
      conditions.push("agent_id = ?");
      params.push(filter.agentId);
    }
    if (filter.startDate) {
      conditions.push("recorded_at >= ?");
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      conditions.push("recorded_at < ?");
      params.push(filter.endDate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const byProject = this.db.prepare(`
      SELECT project_path AS key,
        SUM(${freshInputTokensSql}) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_creation_tokens) AS cache_creation_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(${totalInputTokensSql}) AS total_input_tokens,
        SUM(cost_usd) AS cost_usd
      FROM token_events ${where}
      GROUP BY project_path ORDER BY total_input_tokens DESC
    `).all(...params) as UsageGroupSqlRow[];

    const byAgent = this.db.prepare(`
      SELECT agent_id AS key,
        SUM(${freshInputTokensSql}) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_creation_tokens) AS cache_creation_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(${totalInputTokensSql}) AS total_input_tokens,
        SUM(cost_usd) AS cost_usd
      FROM token_events ${where}
      GROUP BY agent_id ORDER BY total_input_tokens DESC
    `).all(...params) as UsageGroupSqlRow[];

    const byDay = this.db.prepare(`
      SELECT DATE(recorded_at) AS key,
        SUM(${freshInputTokensSql}) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_creation_tokens) AS cache_creation_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(${totalInputTokensSql}) AS total_input_tokens,
        SUM(cost_usd) AS cost_usd
      FROM token_events ${where}
      GROUP BY DATE(recorded_at) ORDER BY key DESC
    `).all(...params) as UsageGroupSqlRow[];

    const totals = this.db.prepare(`
      SELECT
        COALESCE(SUM(${freshInputTokensSql}), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
        COALESCE(SUM(${totalInputTokensSql}), 0) AS total_input_tokens,
        SUM(cost_usd) AS cost_usd
      FROM token_events ${where}
    `).get(...params) as {
      input_tokens: number;
      output_tokens: number;
      cache_creation_tokens: number;
      cache_read_tokens: number;
      total_input_tokens: number;
      cost_usd: number | null;
    };

    return {
      byProject: byProject.map(toUsageGroupRow),
      byAgent: byAgent.map(toUsageGroupRow),
      byDay: byDay.map(toUsageGroupRow),
      totals: {
        inputTokens: totals.input_tokens,
        outputTokens: totals.output_tokens,
        cacheCreationTokens: totals.cache_creation_tokens,
        cacheReadTokens: totals.cache_read_tokens,
        totalInputTokens: totals.total_input_tokens,
        costUsd: totals.cost_usd,
      },
    };
  }

  getLastOffset(sourceFile: string): number {
    const row = this.db.prepare(
      "SELECT MAX(source_offset) AS max_offset FROM token_events WHERE source_file = ?"
    ).get(sourceFile) as { max_offset: number | null } | undefined;
    return row?.max_offset ?? 0;
  }

  close(): void {
    this.db.close();
  }
}

export function toUsageGroupRow(row: UsageGroupSqlRow): UsageGroupRow {
  return {
    key: row.key ?? "Unknown",
    inputTokens: row.input_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    cacheCreationTokens: row.cache_creation_tokens ?? 0,
    cacheReadTokens: row.cache_read_tokens ?? 0,
    totalInputTokens: row.total_input_tokens ?? row.input_tokens ?? 0,
    costUsd: row.cost_usd ?? null,
  };
}
