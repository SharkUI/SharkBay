import type { AgentDisplayState, AgentStatusEvidence } from "../shared/agent-status.js";
export type HookSessionStateEntry = {
  sessionId?: string; state: AgentDisplayState; projectId: string; agentId: string;
  timestamp: string; terminalSessionId?: string; evidence?: AgentStatusEvidence; lastPrompt?: string;
};
export type HookTerminalIdentity = { terminalId: string; projectId: string; agentId: string; hookSessionId?: string };
export type HookSnapshotByTerminalId = Record<string, { sessionId: string; state: AgentDisplayState; timestampMs: number; evidence?: AgentStatusEvidence; lastPrompt?: string }>;
export function isOlderHookSnapshot(incoming: { timestamp: string | number; evidence?: AgentStatusEvidence }, previous: { timestamp: string | number; evidence?: AgentStatusEvidence }): boolean {
  if (incoming.evidence && previous.evidence && incoming.evidence.authorityId === previous.evidence.authorityId) return incoming.evidence.revision < previous.evidence.revision;
  const time = (value: string | number) => typeof value === "number" ? value : Date.parse(value) || 0;
  return time(incoming.timestamp) < time(previous.timestamp);
}
export function projectHookSnapshots(entries: Record<string, HookSessionStateEntry>, terminals: HookTerminalIdentity[]) {
  const sessionToTerminal: Record<string, string> = {};
  const snapshots: HookSnapshotByTerminalId = {};
  const explicitTerminals = new Set(Object.values(entries).flatMap(entry => entry.terminalSessionId ? [entry.terminalSessionId] : []));
  const identity = (entry: HookSessionStateEntry, key: string) => `${entry.projectId}\0${entry.agentId}\0${entry.sessionId ?? key}`;
  const explicitSessions = new Set(Object.entries(entries).filter(([, entry]) => entry.terminalSessionId).map(([key, entry]) => identity(entry, key)));
  for (const [key, entry] of Object.entries(entries)) {
    const matches = terminals.filter(tab => tab.projectId === entry.projectId && tab.agentId === entry.agentId
      && (entry.terminalSessionId ? tab.terminalId === entry.terminalSessionId : tab.hookSessionId === (entry.sessionId ?? key)));
    if (matches.length !== 1) continue;
    const terminalId = matches[0]!.terminalId;
    // Live attribution owns both the physical terminal and its provider identity; restored aliases cannot copy it.
    if (!entry.terminalSessionId && (explicitTerminals.has(terminalId) || explicitSessions.has(identity(entry, key)))) continue;
    sessionToTerminal[key] = terminalId;
    const timestampMs = Date.parse(entry.timestamp) || 0;
    const previous = snapshots[terminalId];
    if (previous && isOlderHookSnapshot(entry, { timestamp: previous.timestampMs, evidence: previous.evidence })) continue;
    snapshots[terminalId] = { sessionId: entry.sessionId ?? key, state: entry.state, timestampMs, evidence: entry.evidence, lastPrompt: entry.lastPrompt };
  }
  return { snapshots, sessionToTerminal };
}
