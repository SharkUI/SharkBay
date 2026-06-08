/**
 * SessionPromptStore — records prompt history per agent session,
 * keyed by the agent (hook) session id.
 *
 * Stores a full ordered list of prompts per session so the renderer can
 * offer arrow-key history navigation that persists across app restarts.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const MAX_PROMPT_LENGTH = 200;
const MAX_ENTRIES = 500;
const MAX_HISTORY_PER_SESSION = 200;

type StoredSession = { history: string[]; updatedAt: number };

export class SessionPromptStore {
  private sessions = new Map<string, StoredSession>();
  private filePath: string;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "session-prompts.json");
    this.load();
  }

  /** Append a prompt to the history for an agent session id. */
  record(sessionId: string, text: string): void {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!sessionId || !trimmed) return;
    const entry = this.sessions.get(sessionId) ?? { history: [], updatedAt: 0 };
    entry.history.push(trimmed.slice(0, MAX_PROMPT_LENGTH));
    if (entry.history.length > MAX_HISTORY_PER_SESSION) {
      entry.history = entry.history.slice(-MAX_HISTORY_PER_SESSION);
    }
    entry.updatedAt = Date.now();
    this.sessions.set(sessionId, entry);
    this.evictIfNeeded();
    this.scheduleWrite();
  }

  /** Get the latest recorded prompt for an agent session id. */
  get(sessionId: string | null | undefined): string | null {
    if (!sessionId) return null;
    const entry = this.sessions.get(sessionId);
    return entry?.history.length ? entry.history[entry.history.length - 1]! : null;
  }

  /** Get the full prompt history for an agent session id. */
  getHistory(sessionId: string | null | undefined): string[] {
    if (!sessionId) return [];
    return this.sessions.get(sessionId)?.history ?? [];
  }

  private evictIfNeeded(): void {
    if (this.sessions.size <= MAX_ENTRIES) return;
    const sorted = [...this.sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const removeCount = this.sessions.size - MAX_ENTRIES;
    for (let i = 0; i < removeCount; i++) {
      const entry = sorted[i];
      if (entry) this.sessions.delete(entry[0]);
    }
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [sessionId, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object") continue;
        const v = value as Record<string, unknown>;
        // Support new format: { history: string[], updatedAt: number }
        if (Array.isArray(v.history) && typeof v.updatedAt === "number") {
          this.sessions.set(sessionId, { history: v.history.filter((s): s is string => typeof s === "string"), updatedAt: v.updatedAt });
        }
        // Migrate old format: { text: string, updatedAt: number }
        else if (typeof v.text === "string" && typeof v.updatedAt === "number") {
          this.sessions.set(sessionId, { history: [v.text], updatedAt: v.updatedAt });
        }
      }
    } catch {
      // No store yet, or unreadable — start empty.
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 500);
    this.writeTimer.unref?.();
  }

  /** Flush immediately. Call on app quit to avoid data loss. */
  flushSync(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.flush();
  }

  private flush(): void {
    try {
      const obj: Record<string, StoredSession> = {};
      for (const [sessionId, value] of this.sessions) obj[sessionId] = value;
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(obj), "utf8");
    } catch {
      // Prompt persistence is best-effort; never throw into the event loop.
    }
  }
}
