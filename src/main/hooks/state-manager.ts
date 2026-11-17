import { randomUUID } from "node:crypto";
import { CodexTurnReader } from "./codex-turn-reader.js";
import type { ProgramStatus } from "./program-status.js";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { AGENT_STATUS_STALE_MS, agentDisplayState, type AgentExecutionState, type AgentStatusEvidence } from "../../shared/agent-status.js";
import type { AgentConnector, AgentHookState, HookBridgeMessage, UnifiedHookEvent } from "./types.js";

export type HookStateEvent = {
  projectPath: string; sessionId: string; state: AgentHookState; action: string; agent: string;
  timestamp: string; pid?: number; terminalSessionId?: string; lastPrompt?: string;
  evidence: AgentStatusEvidence;
};
export type StateManagerEvents = { stateChange: [HookStateEvent] };
const MAX_LOG_STRING_LENGTH = 2000;
const MAX_LOG_ARRAY_ITEMS = 25;
const MAX_LOG_OBJECT_KEYS = 50;
const STATUS_UPDATE_INTERVAL_MS = 200;
type Entry = {
  event: UnifiedHookEvent;
  lead: AgentExecutionState;
  state: AgentHookState;
  action: string;
  evidence: AgentStatusEvidence;
  waitingToolUseId?: string;
  providerTurnDone?: boolean; // OSC can describe newer work before its prompt hook names the turn.
  programOwnsTurn?: boolean;
  providerBound?: boolean;
  elicitation?: { requests: Set<string>; startedAt: number; observedAt: number; stale: boolean; timer?: ReturnType<typeof setTimeout> };
  questions: Map<string, Set<number>>;
  children: Map<string, AgentExecutionState>;
  transcript?: { reader: CodexTurnReader; path: string };
  transcriptTimer?: ReturnType<typeof setTimeout>;
  fallbackTimer?: ReturnType<typeof setTimeout>;
  timer?: ReturnType<typeof setTimeout>;
  publishTimer?: ReturnType<typeof setTimeout>;
  publication?: { status: HookStateEvent; at: number };
};

export class AgentHookStateManager extends EventEmitter<StateManagerEvents> {
  private states = new Map<string, Entry>();
  private connectors = new Map<string, AgentConnector>();
  private revision = 0;
  private readonly authorityId = randomUUID();

  registerConnector(connector: AgentConnector): void { this.connectors.set(connector.id, connector); }
  injectEvent(event: UnifiedHookEvent): void { if (event.cwd) this.applyEvent(event); }
  handleMessage(msg: HookBridgeMessage): void {
    const event = this.connectors.get(msg.source)?.normalize(msg.payload);
    if (!event?.cwd) return;
    if (msg.pid != null) event.pid = msg.pid;
    event.terminalSessionId = msg.terminalSessionId;
    event.launchToken = msg.launchToken;
    writeHookLog(event.cwd, { timestamp: new Date().toISOString(), source: msg.source, normalized: summarizeUnifiedEvent(event) });
    this.applyEvent(event);
  }
  getAllStatuses(): HookStateEvent[] { return [...this.states.values()].map((entry) => this.snapshot(entry)); }
  getStatus(projectPath: string | null, sessionId?: string): HookStateEvent | null {
    const matches = [...this.states.values()].filter(entry => (!projectPath || entry.event.cwd === projectPath) && (!sessionId || entry.event.sessionId === sessionId));
    return matches.length === 1 ? this.snapshot(matches[0]!) : null;
  }
  getStatusForTerminal(terminalId: string): HookStateEvent | null {
    const entry = this.states.get(terminalId);
    return entry ? this.snapshot(entry) : null;
  }
  dispose(): void {
    for (const entry of this.states.values()) { clearTimeout(entry.timer); clearTimeout(entry.fallbackTimer); clearInterval(entry.transcriptTimer); clearTimeout(entry.elicitation?.timer); clearTimeout(entry.publishTimer); }
    this.states.clear();
  }
  ingestProgramStatus(event: UnifiedHookEvent, report: ProgramStatus): void {
    const previous = this.states.get(event.terminalSessionId!);
    const dialogCleared = Boolean(previous?.elicitation && report.sessionBoundary);
    if (dialogCleared && previous) {
      clearTimeout(previous.elicitation?.timer); previous.elicitation = undefined;
      previous.evidence = { ...previous.evidence, revision: ++this.revision };
    }
    this.arbitrateProgramStatus(event, report, dialogCleared);
  }
  private arbitrateProgramStatus(event: UnifiedHookEvent, report: ProgramStatus, dialogCleared = false): void {
    const key = event.terminalSessionId!;
    const previous = this.states.get(key);
    const now = Date.now();
    // Dialog lifetime follows the boundary even when execution arbitration retains the old verdict.
    const keepPrevious = () => { if (dialogCleared && previous) this.publish(previous); };
    if (previous?.programOwnsTurn && ["done", "failed", "interrupted", "idle"].includes(previous.state)
      && (report.state === "working" || report.state === "waiting") && (report.workingSince ?? 0) <= previous.evidence.observedAt) return keepPrevious();
    if (previous?.evidence.origin === "hook") {
      clearTimeout(previous.fallbackTimer); previous.fallbackTimer = undefined;
      // OpenCode broadcasts live status across its folder's tabs; only all-idle can settle this pane.
      if (previous.event.agent === "opencode" && report.app === "opencode" && report.state !== "done") return keepPrevious();
      const hookState = ["working", "waiting", "blocked"].includes(previous.state) ? previous.state
        : previous.state === "monitoring" ? "working" : previous.lead;
      const heldByHookChildren = previous.lead === "done" && hookState !== "done";
      if (hookState === report.state) return keepPrevious();
      if (hookState === "done" && report.leadState === "done" && report.state !== "done") return keepPrevious();
      if (heldByHookChildren && report.state === "done" && !report.sessionBoundary) return keepPrevious();
      const newWorkAfterDone = hookState === "done" && (report.state === "working" || report.state === "waiting");
      if (newWorkAfterDone && (report.workingSince ?? 0) <= previous.evidence.observedAt) return keepPrevious();
      if ((hookState === "waiting" || hookState === "blocked") && report.state === "working" && (report.workingSince ?? 0) <= previous.evidence.observedAt) return keepPrevious();
      const delay = newWorkAfterDone && report.state === "waiting" ? 0 : previous.evidence.observedAt + 120_000 - now;
      if (delay > 0) {
        if (!previous.fallbackTimer) previous.fallbackTimer = setTimeout(() => {
          previous.fallbackTimer = undefined;
          // Retry execution arbitration without replaying the boundary's dialog cleanup.
          if (this.states.get(key) === previous) this.arbitrateProgramStatus(event, report);
        }, delay + 1);
        previous.fallbackTimer?.unref?.();
        return keepPrevious();
      }
    }
    if (previous) { clearTimeout(previous.timer); clearTimeout(previous.fallbackTimer); }
    const state = report.state === "working" && report.workingMode === "monitoring" ? "monitoring" : agentDisplayState(report.state, report.outcome, report.sessionBoundary);
    const evidence: AgentStatusEvidence = { authorityId: this.authorityId, turnRevision: previous?.evidence.turnRevision ?? this.revision + 1, origin: "osc", observedAt: now, revision: ++this.revision,
      stateStartedAt: previous?.state === state ? previous.evidence.stateStartedAt : now,
      turnStartedAt: report.workingSince ?? previous?.evidence.turnStartedAt ?? now, sessionBoundary: report.sessionBoundary };
    const entry: Entry = previous ?? { event, state, lead: report.state, evidence, action: "", providerBound: false, questions: new Map(), children: new Map() };
    entry.event = { ...entry.event, ...event, sessionId: entry.event.sessionId, turnId: entry.event.turnId ?? event.turnId,
      transcriptPath: entry.event.transcriptPath ?? event.transcriptPath, outcome: report.outcome, sessionBoundary: report.sessionBoundary };
    entry.state = state; entry.lead = report.leadState ?? report.state; entry.evidence = evidence; entry.action = "";
    if (entry.lead === "done") {
      entry.providerTurnDone = true;
    }
    if (entry.providerTurnDone) entry.programOwnsTurn = true;
    if (report.sessionBoundary || entry.programOwnsTurn) {
      entry.questions.clear(); entry.children.clear(); entry.waitingToolUseId = undefined;
      entry.event.backgroundAgents = false; entry.event.backgroundCommands = false; entry.event.activeCrons = false;
    }
    this.states.set(key, entry);
    this.watchTranscript(entry);
    this.publish(entry);
    if (report.state !== "done") {
      entry.timer = setTimeout(() => { entry.state = "unverifiable"; this.publish(entry); }, AGENT_STATUS_STALE_MS);
      entry.timer.unref?.();
    }
  }
  noteTerminalInput(terminalId: string, data: string): void {
    if (data !== "\x1d") return;
    const entry = this.states.get(terminalId);
    if (!entry || entry.event.agent !== "codex") return;
    const question = entry.questions.entries().next().value;
    if (!question) return;
    const [callId, remaining] = question;
    const index = remaining.values().next().value;
    if (index !== undefined) remaining.delete(index);
    if (!remaining.size) entry.questions.delete(callId);
    this.applyEvent({ ...entry.event, event: "tool_end", tool: undefined, childId: undefined, outcome: undefined });
  }
  forgetTerminal(terminalId: string): void {
    const entry = this.states.get(terminalId);
    if (entry) { clearTimeout(entry.timer); clearTimeout(entry.fallbackTimer); clearInterval(entry.transcriptTimer); clearTimeout(entry.elicitation?.timer); clearTimeout(entry.publishTimer); }
    this.states.delete(terminalId);
  }
  finishTerminal(terminalId: string, failed: boolean, fallback?: UnifiedHookEvent): void {
    const entry = this.states.get(terminalId);
    if (!entry && !fallback) return;
    clearTimeout(entry?.timer); clearTimeout(entry?.fallbackTimer);
    this.applyEvent({ ...(entry?.event ?? fallback!), event: "session_end", sessionBoundary: false, childId: undefined,
      outcome: failed ? "failure" : entry?.event.outcome, timestamp: new Date().toISOString() }, "process");
  }
  private snapshot(entry: Entry): HookStateEvent {
    const wait = entry.elicitation;
    const evidence: AgentStatusEvidence = { ...entry.evidence, ...(wait ? {
      origin: "hook" as const, observedAt: wait.observedAt, stateStartedAt: wait.startedAt, sessionBoundary: false,
    } : {}) };
    return { projectPath: entry.event.cwd!, sessionId: entry.event.sessionId, state: wait ? wait.stale ? "unverifiable" : "waiting" : entry.state, action: wait ? "Waiting for input" : entry.action,
      agent: entry.event.agent, timestamp: new Date(evidence.observedAt).toISOString(), pid: entry.event.pid,
      terminalSessionId: entry.event.terminalSessionId, lastPrompt: entry.event.prompt,
      evidence };
  }
  private publish(entry: Entry): void {
    const status = this.snapshot(entry);
    const previous = entry.publication?.status;
    // Fold every event immediately; only repeated notifications wait. State,
    // ownership and turn/source changes must never sit behind older progress.
    const changed = !previous
      || (["state", "projectPath", "sessionId", "terminalSessionId", "agent", "pid", "lastPrompt"] as const).some(key => status[key] !== previous[key])
      || (["authorityId", "origin", "turnRevision", "turnStartedAt", "stateStartedAt", "sessionBoundary"] as const).some(key => status.evidence[key] !== previous.evidence[key]);
    const delay = Math.max(0, (entry.publication?.at ?? 0) + STATUS_UPDATE_INTERVAL_MS - Date.now());
    if (changed || delay === 0) {
      clearTimeout(entry.publishTimer); entry.publishTimer = undefined;
      this.emitStatus(entry, status);
    } else if (!entry.publishTimer) {
      entry.publishTimer = setTimeout(() => {
        entry.publishTimer = undefined;
        this.emitStatus(entry, this.snapshot(entry));
      }, delay);
      entry.publishTimer.unref?.();
    }
  }
  private emitStatus(entry: Entry, status: HookStateEvent): void {
    entry.publication = { status, at: Date.now() };
    writeHookLog(status.projectPath, { timestamp: new Date().toISOString(), status: {
      agent: status.agent, sessionId: status.sessionId, terminalSessionId: status.terminalSessionId,
      event: entry.event.event, turnId: entry.event.turnId, state: status.state, lead: entry.lead,
      childCount: entry.children.size, questionCount: entry.questions.size, elicitationCount: entry.elicitation?.requests.size ?? 0, evidence: status.evidence,
    } });
    this.emit("stateChange", status);
  }
  private applyEvent(event: UnifiedHookEvent, origin: AgentStatusEvidence["origin"] = "hook"): void {
    if (!event.sessionId && !event.terminalSessionId) return;
    if (event.event === "session_start" && !event.childId) event = { ...event, sessionBoundary: true };
    const key = event.terminalSessionId ?? `${event.cwd}\0${event.sessionId}`;
    const now = Date.now();
    let entry = this.states.get(key);
    const newTurn = event.event === "prompt" && !event.childId && !event.prompt?.trim().startsWith("<send_user_message_question_reply>");
    if (event.elicitation) {
      if (entry && !event.childId && event.sessionId !== entry.event.sessionId) {
        const canBind = !entry.providerBound && event.elicitation.phase === "request" && event.sessionId
          && event.terminalSessionId && event.terminalSessionId === entry.event.terminalSessionId
          && entry.event.sessionId === event.terminalSessionId && event.agent === entry.event.agent && event.cwd === entry.event.cwd
          && (!entry.event.launchToken || entry.event.launchToken === event.launchToken);
        if (!canBind) return;
        entry.event = { ...entry.event, sessionId: event.sessionId, launchToken: event.launchToken };
      }
      if (!entry) {
        if (event.elicitation.phase === "result") return;
        const evidence: AgentStatusEvidence = { authorityId: this.authorityId, origin: "hook", revision: this.revision, turnRevision: this.revision + 1,
          observedAt: now, stateStartedAt: now, turnStartedAt: now, sessionBoundary: true };
        entry = { event: { ...event, elicitation: undefined }, lead: "done", state: "idle", action: "", evidence, providerBound: !event.childId, questions: new Map(), children: new Map() };
        this.states.set(key, entry);
      }
      if (!event.childId && event.elicitation.phase === "request") entry.providerBound = true;
      this.handleElicitation(entry, event); return;
    }
    // A completed provider cannot settle or reopen the program's newer work or child roster.
    if (entry?.programOwnsTurn && !newTurn && !(!event.childId && (event.event === "session_start" || event.event === "session_end"))) return;
    // Child provider sessions belong to the lead's terminal; their end cannot replace its owner.
    if (entry && event.childId) event = { ...event, sessionId: entry.event.sessionId, prompt: undefined,
      turnId: entry.event.turnId, transcriptPath: undefined };
    if (entry && event.sessionId !== entry.event.sessionId && event.event !== "session_start" && event.event !== "prompt") return;
    // A new provider session behind the same terminal must not inherit waits or children.
    if (entry && event.sessionId !== entry.event.sessionId) {
      clearTimeout(entry.timer); clearInterval(entry.transcriptTimer); clearTimeout(entry.fallbackTimer); clearTimeout(entry.elicitation?.timer); clearTimeout(entry.publishTimer);
      entry = undefined;
    }
    if (entry?.event.turnId && event.turnId && entry.event.turnId !== event.turnId && !event.childId
      && event.event !== "prompt" && event.event !== "session_start") return;
    if (entry && (entry.lead === "done" || entry.providerTurnDone) && event.turnId && entry.event.turnId === event.turnId && !event.childId
      && (event.event === "tool_start" || event.event === "tool_end")) return;
    if (entry) { clearTimeout(entry.fallbackTimer); entry.fallbackTimer = undefined; }
    const previous = entry?.state;
    const evidence: AgentStatusEvidence = {
      authorityId: this.authorityId, turnRevision: newTurn ? this.revision + 1 : entry?.evidence.turnRevision ?? this.revision + 1, origin, observedAt: now, revision: ++this.revision,
      stateStartedAt: entry?.evidence.stateStartedAt ?? now,
      turnStartedAt: newTurn ? now : entry?.evidence.turnStartedAt ?? now,
      sessionBoundary: event.sessionBoundary,
    };
    if (!entry) entry = { event, lead: "done", state: "idle", action: "", evidence, questions: new Map(), children: new Map() };
    if (!event.childId) entry.providerBound = true;
    if (newTurn || !event.childId && (event.event === "session_start" || event.event === "session_end")) {
      clearTimeout(entry.elicitation?.timer); entry.elicitation = undefined;
    }
    if (newTurn || event.event === "session_start" || event.event === "session_end") entry.programOwnsTurn = false;
    if (newTurn) entry.providerTurnDone = false;
    entry.evidence = evidence;
    entry.event = { ...entry.event, ...event, turnId: event.turnId ?? (newTurn ? undefined : entry.event.turnId),
      transcriptPath: event.transcriptPath ?? entry.event.transcriptPath,
      backgroundAgents: event.backgroundAgents ?? entry.event.backgroundAgents,
      backgroundCommands: event.backgroundCommands ?? entry.event.backgroundCommands,
      activeCrons: event.activeCrons ?? entry.event.activeCrons, prompt: event.prompt || entry.event.prompt,
      outcome: event.childId ? entry.event.outcome : event.outcome ?? (event.event === "turn_end" && entry.lead === "done" ? entry.event.outcome : undefined) };
    if (event.childId) {
      if (event.childEvent === "stop" || event.event === "turn_end") entry.children.delete(event.childId);
      else entry.children.set(event.childId, event.event === "attention" ? "waiting" : "working");
    } else {
      if (event.event === "prompt") {
        this.answerQuestions(entry, event.prompt);
      }
      if (event.event === "session_start" || event.event === "session_end") {
        entry.questions.clear(); entry.children.clear(); entry.lead = "done";
        entry.providerTurnDone = true;
        entry.event.backgroundAgents = false; entry.event.backgroundCommands = false; entry.event.activeCrons = false;
      } else if (event.event === "turn_end") {
        entry.questions.clear(); entry.lead = "done"; entry.providerTurnDone = true;
      } else if (event.event === "attention") {
        entry.lead = "waiting"; entry.waitingToolUseId = event.toolUseId;
      } else if (event.event === "tool_start" && /^(?:AskUserQuestion|request_user_input)$/.test(event.tool?.name ?? "")) {
        entry.lead = "waiting"; entry.waitingToolUseId = event.toolUseId;
      } else if (!(entry.lead === "waiting" && entry.waitingToolUseId && (event.event === "tool_end" || event.event === "tool_start") && event.toolUseId !== entry.waitingToolUseId)) {
        entry.lead = "working"; entry.waitingToolUseId = undefined;
      }
      if (event.agent === "codex" && event.event === "tool_start" && event.tool?.name === "request_user_input_async" && event.toolUseId) {
        const input = event.tool.input as { questions?: unknown[] } | undefined;
        if (Array.isArray(input?.questions) && input.questions.length) entry.questions.set(event.toolUseId, new Set(input.questions.map((_, index) => index)));
      }
    }
    let state = entry.lead;
    if (state !== "waiting" && state !== "blocked" && (entry.questions.size || [...entry.children.values()].includes("waiting"))) state = "waiting";
    else if (state === "done" && ([...entry.children.values()].includes("working") || entry.event.backgroundAgents)) state = "working";
    entry.state = state === "done" && (entry.event.backgroundCommands || entry.event.activeCrons) ? "monitoring" : agentDisplayState(state, entry.event.outcome, event.sessionBoundary);
    if (entry.state !== previous) entry.evidence.stateStartedAt = now;
    entry.action = entry.state === "waiting" ? "Waiting for input" : event.tool ? `${capitalize(event.agent)}: ${event.tool.name}` : "";
    this.states.set(key, entry);
    this.watchTranscript(entry);
    this.publish(entry);
    clearTimeout(entry.timer);
    if (state !== "done" || entry.state === "monitoring") entry.timer = setTimeout(() => {
      entry!.state = "unverifiable";
      // Freshness changes presentation, never invents a completion or refreshes the evidence clock.
      this.publish(entry!);
    }, AGENT_STATUS_STALE_MS);
    entry.timer?.unref?.();
  }
  private handleElicitation(entry: Entry, event: UnifiedHookEvent): void {
    const request = event.elicitation!;
    const key = JSON.stringify([event.childId ?? null, request.server ?? null, request.id ?? null]);
    if (request.phase === "request") {
      entry.elicitation ??= { requests: new Set(), startedAt: Date.now(), observedAt: Date.now(), stale: false };
      entry.elicitation.requests.add(key);
    } else {
      if (!entry.elicitation?.requests.delete(key)) return;
      if (!entry.elicitation.requests.size) { clearTimeout(entry.elicitation.timer); entry.elicitation = undefined; }
    }
    const wait = entry.elicitation;
    if (wait) {
      clearTimeout(wait.timer); wait.stale = false; wait.observedAt = Date.now();
      wait.timer = setTimeout(() => { wait.stale = true; this.publish(entry); }, AGENT_STATUS_STALE_MS);
      wait.timer.unref?.();
    }
    // A dialog changes attention, never the underlying lead/child verdict or source ownership.
    entry.evidence = { ...entry.evidence, revision: ++this.revision };
    this.publish(entry);
  }
  private watchTranscript(entry: Entry): void {
    if (entry.lead === "done" || entry.providerTurnDone) { clearInterval(entry.transcriptTimer); entry.transcriptTimer = undefined; return; }
    const { agent, transcriptPath, turnId } = entry.event;
    if (agent !== "codex" || !transcriptPath || !turnId) return;
    if (entry.transcript?.path !== transcriptPath) entry.transcript = { reader: new CodexTurnReader(transcriptPath), path: transcriptPath };
    if (!entry.transcriptTimer) entry.transcriptTimer = setInterval(() => {
      if (!entry.event.turnId || !entry.transcript) return;
      const outcome = entry.transcript.reader.read(entry.event.turnId);
      if (outcome) this.applyEvent({ ...entry.event, event: "turn_end", childId: undefined, outcome, sessionBoundary: false });
    }, 1000);
    entry.transcriptTimer.unref?.();
  }
  private answerQuestions(entry: Entry, prompt?: string): void {
    const match = prompt?.trim().match(/^<send_user_message_question_reply>([\s\S]*)<\/send_user_message_question_reply>$/);
    if (!match) { entry.questions.clear(); return; }
    try {
      const replies: unknown = JSON.parse(match[1]!);
      if (!Array.isArray(replies)) return;
      for (const reply of replies) {
        if (!reply || typeof reply.questionItemId !== "string") continue;
        try {
          const id: unknown = JSON.parse(reply.questionItemId);
          if (!Array.isArray(id) || id[0] !== "request_user_input_async" || typeof id[1] !== "string" || typeof id[2] !== "number") continue;
          const remaining = entry.questions.get(id[1]);
          remaining?.delete(id[2]);
          if (remaining?.size === 0) entry.questions.delete(id[1]);
        } catch { /* One malformed item must not discard the other answers. */ }
      }
    } catch { /* An incomplete reply is not proof that the question was answered. */ }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function writeHookLog(projectPath: string | null, entry: Record<string, unknown>): void {
  if (!projectPath || !path.isAbsolute(projectPath)) return;
  const logPath = path.join(projectPath, ".sharkbay", "logs", "hooks.log");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Hook logging is diagnostic-only and must never affect agent execution.
  }
}

function summarizeUnifiedEvent(event: UnifiedHookEvent): Record<string, unknown> {
  return {
    agent: event.agent,
    sessionId: event.sessionId,
    event: event.event,
    terminalSessionId: event.terminalSessionId,
    pid: event.pid,
    turnId: event.turnId,
    childId: event.childId,
    elicitation: event.elicitation?.phase,
    timestamp: event.timestamp,
    tool: event.tool ? sanitizeForHookLog(event.tool) : undefined,
    prompt: event.prompt,
    cwd: event.cwd,
  };
}

function sanitizeForHookLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_LOG_STRING_LENGTH
      ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}...[truncated ${value.length - MAX_LOG_STRING_LENGTH} chars]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);
  if (depth >= 6) return "[max-depth]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_LOG_ARRAY_ITEMS).map((item) => sanitizeForHookLog(item, depth + 1));
    if (value.length > MAX_LOG_ARRAY_ITEMS) items.push(`[truncated ${value.length - MAX_LOG_ARRAY_ITEMS} items]`);
    return items;
  }
  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, item] of entries.slice(0, MAX_LOG_OBJECT_KEYS)) {
    result[key] = sanitizeForHookLog(item, depth + 1);
  }
  if (entries.length > MAX_LOG_OBJECT_KEYS) {
    result.__truncatedKeys = entries.length - MAX_LOG_OBJECT_KEYS;
  }
  return result;
}
