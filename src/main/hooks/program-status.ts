import type { AgentExecutionState, AgentOutcome } from "../../shared/agent-status.js";

export type ProgramStatus = {
  state: AgentExecutionState;
  outcome?: AgentOutcome;
  sessionBoundary?: boolean;
  workingSince?: number;
  leadState?: AgentExecutionState;
  app?: string;
  workingMode?: "monitoring";
};
// Stateful per PTY: sequences can cross chunks; display prose is never status evidence.
export class ProgramStatusReader {
  private pending = "";
  private queryRequested = false;
  private records = new Map<string, { state: string; kind?: string; app?: string }>();
  private lastRoot?: ProgramStatus;
  private invocationEnded = false;
  private reportedSinceEnd = false;
  private workingSince?: number;
  private working = false;
  takeQueryReply(): string | null {
    if (!this.queryRequested) return null;
    this.queryRequested = false;
    return "\x1b]7501;?:states=idle,working,done,blocked,error:kinds=permission,question,auth\x1b\\";
  }
  feed(data: string, now = Date.now()): ProgramStatus[] {
    this.pending += data;
    const result: ProgramStatus[] = [];
    while (this.pending) {
      const start = /\x1b(?:\]|c)/.exec(this.pending)?.index ?? -1;
      if (start < 0) { this.pending = this.pending.endsWith("\x1b") ? "\x1b" : ""; break; }
      this.pending = this.pending.slice(start);
      if (this.pending.startsWith("\x1bc")) {
        const hadRecords = this.records.size > 0;
        this.pending = this.pending.slice(2); this.records.clear(); this.lastRoot = undefined; this.invocationEnded = false; this.reportedSinceEnd = false;
        if (hadRecords) result.push(this.observe(this.project(), now));
        continue;
      }
      const end = /\x07|\x1b\\/.exec(this.pending);
      if (!end) { if (this.pending.length > 8192) this.pending = ""; break; }
      const body = this.pending.slice(2, end.index);
      this.pending = this.pending.slice(end.index + end[0].length);
      if (body === "133;A" || body.startsWith("133;A;")) {
        if (!this.reportedSinceEnd) continue;
        const size = this.records.size;
        for (const [id, record] of this.records) if (record.state !== "done" && record.state !== "error") this.records.delete(id);
        if (this.records.size !== size) result.push(this.observe(this.project(), now));
        this.reportedSinceEnd = false; this.invocationEnded = true; continue;
      }
      if (body.startsWith("9999;")) {
        try {
          const value = JSON.parse(body.slice(5));
          if (["working", "waiting", "blocked", "done"].includes(value.state)) {
            const main = value.mainAgent;
            const leadState = ["working", "waiting", "blocked", "done"].includes(main?.state) && Number.isFinite(main?.stateStartedAt) ? main.state : undefined;
            const outcome = leadState === "done" && ["success", "failure", "cancellation"].includes(main?.outcome) ? main.outcome
              : value.state === "done" && value.interrupted === true ? "cancellation" : undefined;
            result.push(this.observe({ state: value.state, leadState, outcome, app: typeof value.agentType === "string" ? value.agentType : undefined,
              workingMode: value.state === "working" && value.workingMode === "monitoring" ? "monitoring" : undefined,
              sessionBoundary: value.state === "done" && value.sessionBoundary === true }, now));
          }
        } catch { /* Ignore malformed program reports. */ }
      }
      if (!body.startsWith("7501;") || body.length > 4096) continue;
      if (body.slice(5).trim() === "?") { this.queryRequested = true; continue; }
      const fields = Object.fromEntries(body.slice(5).split(":").map((pair) => {
        const at = pair.indexOf("="); return [pair.slice(0, at), pair.slice(at + 1)];
      }));
      const state = fields.state ?? "";
      if (!["working", "blocked", "idle", "done", "error", "clear"].includes(state)) continue;
      const id = fields.id ?? "";
      if (id.length > 256) continue;
      if (state === "clear") {
        for (const key of this.records.keys()) if (id === "" || key === id || key.startsWith(id + "/")) this.records.delete(key);
      }
      else {
        if (this.records.size >= 128 && !this.records.has(id)) continue;
        this.records.set(id, { state, kind: fields.kind, app: fields.app });
      }
      this.reportedSinceEnd = true;
      if (this.invocationEnded) { this.lastRoot = undefined; this.invocationEnded = false; }
      result.push(this.observe(this.project(), now));
    }
    return result;
  }
  private project(): ProgramStatus {
    const root = this.records.get("");
    const children = [...this.records.entries()].filter(([key]) => key !== "").map(([, value]) => value);
    let lead: ProgramStatus;
    if (!root) lead = { state: "done", sessionBoundary: true };
    else if (root.state === "idle") lead = this.lastRoot?.state === "done" ? this.lastRoot
      : { state: "done", sessionBoundary: root.app !== "opencode" || !this.lastRoot };
    else if (root.state === "blocked") lead = { state: root.kind === "permission" || root.kind === "question" ? "waiting" : "blocked" };
    else if (root.state === "working") lead = { state: "working" };
    else lead = { state: "done", outcome: root.state === "error" ? "failure" : "success" };
    this.lastRoot = lead;
    const next = { ...lead, leadState: lead.state, app: root?.app };
    // Only a completed turn can be held by the program's child roster; boundaries hold nothing.
    if (lead.state === "done" && !lead.sessionBoundary && root?.app !== "opencode") {
      if (children.some(child => child.state === "blocked" && (child.kind === "permission" || child.kind === "question"))) next.state = "waiting";
      else if (children.some(child => child.state === "working")) next.state = "working";
    }
    return next;
  }
  private observe(next: ProgramStatus, now: number): ProgramStatus {
    if (next.state === "working" && !this.working) this.workingSince = now;
    this.working = next.state === "working";
    return { ...next, workingSince: this.workingSince };
  }
}
