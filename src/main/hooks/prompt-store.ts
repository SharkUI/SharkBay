/**
 * SessionPromptStore — records the latest user prompt per agent session,
 * keyed by the agent (hook) session id.
 *
 * SharkBay owns the prompt input bar, so it can capture every prompt the user
 * submits regardless of agent type. This is the authoritative source for the
 * island's "last prompt" line, including restored sessions: a restored agent
 * reuses the same session id, so its previously recorded prompt is still
 * available here even though the agent never re-emits it over hooks.
 *
 * Persisted to userData so prompts survive app restarts.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const MAX_PROMPT_LENGTH = 200;
const MAX_ENTRIES = 500;

type StoredPrompt = { text: string; updatedAt: number };

export class SessionPromptStore {
  private prompts = new Map<string, StoredPrompt>();
  private filePath: string;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "session-prompts.json");
    this.load();
  }

  /** Record the latest prompt for an agent session id. */
  record(sessionId: string, text: string): void {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!sessionId || !trimmed) return;
    this.prompts.set(sessionId, { text: trimmed.slice(0, MAX_PROMPT_LENGTH), updatedAt: Date.now() });
    this.evictIfNeeded();
    this.scheduleWrite();
  }

  /** Get the latest recorded prompt for an agent session id. */
  get(sessionId: string | null | undefined): string | null {
    if (!sessionId) return null;
    return this.prompts.get(sessionId)?.text ?? null;
  }

  private evictIfNeeded(): void {
    if (this.prompts.size <= MAX_ENTRIES) return;
    const sorted = [...this.prompts.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const removeCount = this.prompts.size - MAX_ENTRIES;
    for (let i = 0; i < removeCount; i++) {
      const entry = sorted[i];
      if (entry) this.prompts.delete(entry[0]);
    }
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, StoredPrompt>;
      for (const [sessionId, value] of Object.entries(parsed)) {
        if (value && typeof value.text === "string" && typeof value.updatedAt === "number") {
          this.prompts.set(sessionId, value);
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

  private flush(): void {
    try {
      const obj: Record<string, StoredPrompt> = {};
      for (const [sessionId, value] of this.prompts) obj[sessionId] = value;
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(obj), "utf8");
    } catch {
      // Prompt persistence is best-effort; never throw into the event loop.
    }
  }
}
