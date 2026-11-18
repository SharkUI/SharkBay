import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenUsageDb, type TokenEvent } from "./token-usage-db.js";
import { JsonlReader } from "./jsonl-reader.js";

export type CollectorSessionState = {
  agentId: string;
  sessionId: string | null;
  projectPath: string | null;
};

export class TokenUsageCollector {
  private db: TokenUsageDb;
  private batch: TokenEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
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
    if (this.batch.length >= this.batchSize) this.flush();
    const event = this.extractUsage(line, sourceFile, lineByteOffset, session);
    if (!event) return;

    this.batch.push(event);
    if (this.batch.length >= this.batchSize) {
      this.flush();
    } else this.scheduleFlush();
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.batch.length === 0) return;
    try {
      this.db.insertBatch(this.batch);
    } catch (error) {
      this.scheduleFlush();
      throw error;
    }
    this.batch = [];
  }

  dispose(): void {
    this.disposed = true;
    this.flush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.disposed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      try { this.flush(); }
      catch { console.warn("Usage batch write failed; retaining events for retry"); }
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
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

  async backfill(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    const claudeRoot = path.join(os.homedir(), ".claude", "projects");
    const codexRoot = path.join(os.homedir(), ".codex", "sessions");
    const kiroRoot = path.join(os.homedir(), ".kiro", "sessions", "cli");

    const claudeFiles = await discoverJsonlFiles(claudeRoot, true);
    const codexFiles = await discoverCodexFiles(codexRoot);

    for (const filePath of claudeFiles) {
      if (signal?.aborted) return;
      await this.backfillFile(filePath, "claude", signal);
    }
    for (const filePath of codexFiles) {
      if (signal?.aborted) return;
      await this.backfillFile(filePath, "codex", signal);
    }
    await this.backfillKiroSessions(kiroRoot, signal);
    this.flush();
  }

  private async backfillFile(filePath: string, agentId: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    // Unchanged history needs no I/O; changed files are streamed once to recover
    // session context without retaining or parsing their entire contents at once.
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return;
    }
    const indexed = this.db.getFileIndex(filePath);
    if (isTranscriptFileUnchanged(indexed, stat)) return;

    const lastOffset = indexed && stat.size < indexed.size ? 0 : this.db.getLastOffset(filePath);
    const session: CollectorSessionState = { agentId, sessionId: null, projectPath: null };
    const reader = new JsonlReader(filePath);
    try {
      for await (const { line, offset } of reader.read(stat.size, signal)) {
        if (line === null) { console.warn(`Usage backfill: oversized JSONL record skipped in ${filePath} at ${offset}`); continue; }
        if (!line.trim()) continue;
        this.updateSessionContext(line, session, agentId);
        if (offset >= lastOffset) this.processLine(line, filePath, offset, session);
      }
      // A partial tail or cancelled scan must be retried after the next append/start.
      if (!signal?.aborted && reader.lineOffset === stat.size) {
        this.flush();
        this.db.setFileIndex(filePath, stat.mtimeMs, stat.size);
      }
    } catch (error) {
      if (!signal?.aborted && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async backfillKiroSessions(root: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (signal?.aborted) return;
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = path.join(root, entry.name);

      // Skip unchanged session files via size+mtime (issue #15). Re-reading a
      // grown file is safe and idempotent (INSERT OR IGNORE on source_file +
      // turn offset) and lets new turns in an existing session get indexed.
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        continue;
      }
      const indexed = this.db.getFileIndex(filePath);
      if (isTranscriptFileUnchanged(indexed, stat)) continue;

      let content: string;
      try {
        content = await readKiroSession(filePath, signal);
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
      if (!turns || turns.length === 0) { this.db.setFileIndex(filePath, stat.mtimeMs, stat.size); continue; }

      let turnOffset = 0;
      for (const turn of turns) {
        const metering = turn.metering_usage as { value?: number; unit?: string }[] | undefined;
        if (!metering || metering.length === 0) { turnOffset++; continue; }

        const credits = metering.reduce((sum, m) => sum + (typeof m.value === "number" ? m.value : 0), 0);
        if (credits <= 0) { turnOffset++; continue; }

        const endTs = typeof turn.end_timestamp === "string" ? turn.end_timestamp : null;
        const recordedAt = endTs ?? new Date().toISOString();

        if (this.batch.length >= this.batchSize) this.flush();
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
        if (this.batch.length >= this.batchSize) this.flush();
      }

      this.flush();
      this.db.setFileIndex(filePath, stat.mtimeMs, stat.size);
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

// Kiro stores one JSON document, rather than JSONL. Bound it before parsing;
// oversized documents remain unindexed and are reported instead of exhausting RAM.
async function readKiroSession(filePath: string, signal?: AbortSignal): Promise<string> {
  const handle = await fs.open(filePath, "r");
  try {
    const { size } = await handle.stat();
    if (size > 16 * 1024 * 1024) {
      console.warn(`Usage backfill: Kiro session exceeds 16 MiB: ${filePath}`);
      throw new Error("Kiro session is too large to parse safely");
    }
    const buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, offset, Math.min(64 * 1024, size - offset), offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    return buffer.subarray(0, offset).toString("utf8");
  } finally { await handle.close(); }
}

function toInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

/**
 * True when a transcript file's current size and mtime match what was recorded
 * at the last scan, meaning there is no new content to index. Pure so it can be
 * unit-tested without the native DB or filesystem.
 */
export function isTranscriptFileUnchanged(
  indexed: { mtimeMs: number; size: number } | null,
  stat: { mtimeMs: number; size: number },
): boolean {
  return indexed !== null && indexed.size === stat.size && indexed.mtimeMs === stat.mtimeMs;
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
