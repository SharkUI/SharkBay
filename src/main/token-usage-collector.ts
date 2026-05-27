import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenUsageDb, type TokenEvent } from "./token-usage-db.js";

export type CollectorSessionState = {
  agentId: string;
  sessionId: string | null;
  projectPath: string | null;
};

export class TokenUsageCollector {
  private db: TokenUsageDb;
  private batch: TokenEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private codexTotalUsageBySource = new Map<string, string>();
  private readonly batchSize = 50;
  private readonly flushIntervalMs = 5000;

  constructor(db: TokenUsageDb) {
    this.db = db;
  }

  processLine(
    line: string,
    sourceFile: string,
    lineByteOffset: number,
    session: CollectorSessionState
  ): void {
    const event = this.extractUsage(line, sourceFile, lineByteOffset, session);
    if (!event) return;

    this.batch.push(event);
    if (this.batch.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
      this.flushTimer.unref?.();
    }
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.batch.length === 0) return;
    const items = this.batch;
    this.batch = [];
    this.db.insertBatch(items);
  }

  private extractUsage(
    line: string,
    sourceFile: string,
    lineByteOffset: number,
    session: CollectorSessionState
  ): TokenEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;

    if (session.agentId === "claude") {
      return this.extractClaudeUsage(record, sourceFile, lineByteOffset, session);
    }
    if (session.agentId === "codex") {
      return this.extractCodexUsage(record, sourceFile, lineByteOffset, session);
    }
    if (session.agentId === "kiro") {
      return this.extractKiroUsage(record, sourceFile, lineByteOffset, session);
    }
    return null;
  }

  private extractClaudeUsage(
    record: Record<string, unknown>,
    sourceFile: string,
    lineByteOffset: number,
    session: CollectorSessionState
  ): TokenEvent | null {
    if (record.type !== "assistant") return null;

    const message = record.message as Record<string, unknown> | undefined;
    if (!message) return null;

    const usage = message.usage as Record<string, unknown> | undefined;
    if (!usage) return null;

    const inputTokens = toInt(usage.input_tokens);
    const outputTokens = toInt(usage.output_tokens);
    if (inputTokens === 0 && outputTokens === 0) return null;

    const model = typeof message.model === "string" ? message.model : null;
    const cacheCreationTokens = toInt(usage.cache_creation_input_tokens);
    const cacheReadTokens = toInt(usage.cache_read_input_tokens);

    const timestamp = typeof record.timestamp === "string"
      ? record.timestamp
      : new Date().toISOString();

    return {
      agentId: session.agentId,
      sessionId: session.sessionId,
      projectPath: session.projectPath,
      model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      costUsd: null,
      recordedAt: timestamp,
      sourceFile,
      sourceOffset: lineByteOffset,
    };
  }

  private extractCodexUsage(
    record: Record<string, unknown>,
    sourceFile: string,
    lineByteOffset: number,
    session: CollectorSessionState
  ): TokenEvent | null {
    if (record.type !== "event_msg") return null;

    const payload = record.payload as Record<string, unknown> | undefined;
    if (!payload || payload.type !== "token_count") return null;

    const info = payload.info as Record<string, unknown> | undefined;
    if (!info) return null;

    const lastUsage = info.last_token_usage as Record<string, unknown> | undefined;
    if (!lastUsage) return null;

    const inputTokens = toInt(lastUsage.input_tokens);
    const outputTokens = toInt(lastUsage.output_tokens);
    if (inputTokens === 0 && outputTokens === 0) return null;

    const totalUsageKey = codexTotalUsageKey(info.total_token_usage);
    if (totalUsageKey) {
      const previousTotalUsageKey = this.codexTotalUsageBySource.get(sourceFile);
      if (previousTotalUsageKey === totalUsageKey) return null;
      this.codexTotalUsageBySource.set(sourceFile, totalUsageKey);
    }

    const timestamp = typeof record.timestamp === "string"
      ? record.timestamp
      : new Date().toISOString();

    return {
      agentId: session.agentId,
      sessionId: session.sessionId,
      projectPath: session.projectPath,
      model: null,
      inputTokens,
      outputTokens,
      cacheCreationTokens: 0,
      cacheReadTokens: toInt(lastUsage.cached_input_tokens),
      costUsd: null,
      recordedAt: timestamp,
      sourceFile,
      sourceOffset: lineByteOffset,
    };
  }

  // Kiro uses JSON session files, not JSONL. This is a no-op for line processing.
  private extractKiroUsage(
    _record: Record<string, unknown>,
    _sourceFile: string,
    _lineByteOffset: number,
    _session: CollectorSessionState
  ): TokenEvent | null {
    return null;
  }

  async backfill(): Promise<void> {
    const claudeRoot = path.join(os.homedir(), ".claude", "projects");
    const codexRoot = path.join(os.homedir(), ".codex", "sessions");
    const kiroRoot = path.join(os.homedir(), ".kiro", "sessions", "cli");

    const claudeFiles = await discoverJsonlFiles(claudeRoot, true);
    const codexFiles = await discoverCodexFiles(codexRoot);

    for (const filePath of claudeFiles) {
      await this.backfillFile(filePath, "claude");
    }
    for (const filePath of codexFiles) {
      await this.backfillFile(filePath, "codex");
    }
    await this.backfillKiroSessions(kiroRoot);
    this.flush();
  }

  private async backfillFile(filePath: string, agentId: string): Promise<void> {
    const lastOffset = this.db.getLastOffset(filePath);

    let content: string;
    try {
      const buf = await fs.readFile(filePath);
      if (buf.length <= lastOffset) return;
      content = buf.slice(lastOffset).toString("utf8");
    } catch {
      return;
    }

    const session: CollectorSessionState = { agentId, sessionId: null, projectPath: null };
    let byteOffset = lastOffset;

    // If resuming mid-file, we need session context from earlier lines
    if (lastOffset > 0 && agentId === "claude") {
      try {
        const headBuf = await fs.readFile(filePath);
        const head = headBuf.slice(0, lastOffset).toString("utf8");
        for (const line of head.split("\n")) {
          this.updateSessionContext(line, session, agentId);
        }
      } catch { /* best effort */ }
    }

    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) {
        byteOffset += Buffer.byteLength(line, "utf8") + 1;
        continue;
      }

      this.updateSessionContext(line, session, agentId);
      this.processLine(line, filePath, byteOffset, session);
      byteOffset += Buffer.byteLength(line, "utf8") + 1;
    }
  }

  private async backfillKiroSessions(root: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = path.join(root, entry.name);
      if (this.db.hasEvent(filePath, 0)) continue;

      let content: string;
      try {
        content = await fs.readFile(filePath, "utf8");
      } catch {
        continue;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(content);
      } catch {
        continue;
      }

      const cwd = typeof data.cwd === "string" ? data.cwd : null;
      const sessionId = typeof data.session_id === "string" ? data.session_id : null;
      const state = data.session_state as Record<string, unknown> | undefined;
      const conv = state?.conversation_metadata as Record<string, unknown> | undefined;
      const turns = conv?.user_turn_metadatas as Record<string, unknown>[] | undefined;
      if (!turns || turns.length === 0) continue;

      let turnOffset = 0;
      for (const turn of turns) {
        const metering = turn.metering_usage as { value?: number; unit?: string }[] | undefined;
        if (!metering || metering.length === 0) { turnOffset++; continue; }

        const credits = metering.reduce((sum, m) => sum + (typeof m.value === "number" ? m.value : 0), 0);
        if (credits <= 0) { turnOffset++; continue; }

        const endTs = typeof turn.end_timestamp === "string" ? turn.end_timestamp : null;
        const recordedAt = endTs ?? new Date().toISOString();

        this.batch.push({
          agentId: "kiro",
          sessionId,
          projectPath: cwd,
          model: null,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUsd: credits,
          recordedAt,
          sourceFile: filePath,
          sourceOffset: turnOffset,
        });
        turnOffset++;
      }

      if (this.batch.length >= this.batchSize) this.flush();
    }
  }

  private updateSessionContext(line: string, session: CollectorSessionState, agentId: string): void {
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line.trim());
    } catch {
      return;
    }
    if (!record || typeof record !== "object") return;

    if (agentId === "claude") {
      const cwd = typeof record.cwd === "string" ? record.cwd : null;
      if (cwd && record.entrypoint === "cli") {
        session.projectPath = cwd;
        session.sessionId = typeof record.sessionId === "string" ? record.sessionId : null;
      }
    } else if (agentId === "codex") {
      if (record.type === "session_meta") {
        const payload = record.payload as Record<string, unknown> | undefined;
        if (payload?.originator === "codex-tui" && typeof payload.cwd === "string") {
          session.projectPath = payload.cwd;
          session.sessionId = typeof payload.id === "string" ? payload.id : null;
        }
      }
    }
  }
}

function toInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

export function codexTotalUsageKey(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = value as Record<string, unknown>;
  const inputTokens = toInt(usage.input_tokens);
  const outputTokens = toInt(usage.output_tokens);
  const cachedInputTokens = toInt(usage.cached_input_tokens);
  const reasoningOutputTokens = toInt(usage.reasoning_output_tokens);
  if (inputTokens === 0 && outputTokens === 0 && cachedInputTokens === 0 && reasoningOutputTokens === 0) {
    return null;
  }
  return `${inputTokens}:${outputTokens}:${cachedInputTokens}:${reasoningOutputTokens}`;
}

async function discoverJsonlFiles(root: string, nested: boolean): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  if (!nested) {
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
      .map((e) => path.join(root, e.name));
  }

  const results: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subFiles = await discoverJsonlFiles(path.join(root, entry.name), false);
      results.push(...subFiles);
    }
  }
  return results;
}

async function discoverCodexFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  let years;
  try {
    years = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const year of years.filter((e) => e.isDirectory())) {
    let months;
    try {
      months = await fs.readdir(path.join(root, year.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const month of months.filter((e) => e.isDirectory())) {
      let days;
      try {
        days = await fs.readdir(path.join(root, year.name, month.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const day of days.filter((e) => e.isDirectory())) {
        const dayPath = path.join(root, year.name, month.name, day.name);
        let files;
        try {
          files = await fs.readdir(dayPath, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const file of files) {
          if (file.isFile() && /^rollout-.+\.jsonl$/.test(file.name)) {
            results.push(path.join(dayPath, file.name));
          }
        }
      }
    }
  }
  return results;
}
