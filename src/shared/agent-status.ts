// State and evidence vocabulary follows Orca; execution and unread attention are independent.
export type AgentExecutionState = "working" | "waiting" | "blocked" | "done";
export type AgentOutcome = "success" | "failure" | "cancellation";
export type AgentDisplayState = AgentExecutionState | "idle" | "failed" | "interrupted" | "unverifiable" | "unknown" | "monitoring";
export const AGENT_STATUS_TONE: Record<AgentDisplayState, "blue" | "green" | "yellow" | "red" | "gray"> = {
  working: "blue", monitoring: "blue", done: "green", interrupted: "gray",
  waiting: "yellow", blocked: "yellow", failed: "red", idle: "gray", unverifiable: "gray", unknown: "gray",
};
export type AgentStatusEvidence = {
  authorityId: string;
  turnRevision: number;
  origin: "hook" | "osc" | "screen" | "process";
  observedAt: number;
  revision: number;
  stateStartedAt: number;
  turnStartedAt: number;
  sessionBoundary?: boolean;
};
export const AGENT_STATUS_STALE_MS = 30 * 60 * 1000;
export const AGENT_STATUS_LABELS: Record<AgentDisplayState, string> = {
  working: "Working", waiting: "Waiting for input", blocked: "Blocked", done: "Done",
  idle: "Idle", failed: "Failed", interrupted: "Interrupted", unverifiable: "No recent update",
  unknown: "Unknown", monitoring: "Monitoring background tasks",
};
export const AGENT_STATUS_RANK: Record<AgentDisplayState, number> = {
  failed: 10, waiting: 9, blocked: 8, working: 7, monitoring: 6,
  done: 5, interrupted: 4, unverifiable: 3, idle: 2, unknown: 1,
};
export function isAgentAttention(state: string): boolean {
  return state === "waiting" || state === "blocked";
}
export function isAgentFinished(state: string): boolean {
  return state === "done" || state === "failed" || state === "interrupted";
}
export function isAgentWorking(state: string): boolean {
  return state === "working" || state === "monitoring";
}
export function agentDisplayState(state: AgentExecutionState, outcome?: AgentOutcome, boundary = false): AgentDisplayState {
  if (state !== "done") return state;
  if (boundary) return "idle";
  return outcome === "failure" ? "failed" : outcome === "cancellation" ? "interrupted" : "done";
}
// Screen text is weaker evidence: it cannot finish a live hook turn or reopen its completed turn.
export function mergeAgentScreenState(screen: AgentDisplayState | null, hook?: AgentDisplayState): AgentDisplayState {
  // Expired evidence cannot hide a live progress or question indicator.
  if (hook === "unverifiable" && (screen === "working" || screen === "waiting")) return screen;
  if (hook && hook !== "unknown") return hook;
  return screen ?? hook ?? "unknown";
}
