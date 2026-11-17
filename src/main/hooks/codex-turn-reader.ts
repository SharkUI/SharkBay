import * as fs from "node:fs";
import type { AgentOutcome } from "../../shared/agent-status.js";

// Only explicit lifecycle records for the current turn can supply a missing end hook.
export class CodexTurnReader {
  private offset = 0;
  private pending = "";
  private outcomes = new Map<string, AgentOutcome>();
  constructor(private readonly file: string) {}
  read(turnId: string): AgentOutcome | undefined {
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(this.file, "r");
      const size = fs.fstatSync(descriptor).size;
      if (size < this.offset) { this.offset = 0; this.pending = ""; this.outcomes.clear(); }
      const start = Math.max(this.offset, size - 256 * 1024);
      const skipped = start !== this.offset;
      const buffer = Buffer.alloc(size - start);
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, start);
      this.offset = start + count;
      const lines = ((skipped ? "" : this.pending) + buffer.subarray(0, count).toString("utf8")).split("\n");
      if (skipped) lines.shift();
      this.pending = lines.pop() ?? "";
      if (this.pending.length > 1024 * 1024) this.pending = "";
      for (const line of lines) {
        if (!/"(?:task_complete|turn_complete|turn_aborted)"/.test(line)) continue;
        try {
          const record = JSON.parse(line);
          const payload = record.type === "event_msg" ? record.payload : undefined;
          if (typeof payload?.turn_id !== "string") continue;
          let outcome: AgentOutcome;
          if (payload.type === "turn_aborted") outcome = payload.reason === "interrupted" ? "cancellation" : "failure";
          else if (payload.type === "task_complete" || payload.type === "turn_complete") outcome = "success";
          else continue;
          this.outcomes.delete(payload.turn_id); this.outcomes.set(payload.turn_id, outcome);
          if (this.outcomes.size > 128) this.outcomes.delete(this.outcomes.keys().next().value!);
        } catch { /* Partial or unrelated records carry no lifecycle evidence. */ }
      }
      return this.outcomes.get(turnId);
    } catch { return undefined; }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
}
