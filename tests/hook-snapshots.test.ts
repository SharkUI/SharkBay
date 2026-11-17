import { describe, it, expect } from "vitest";
import { isOlderHookSnapshot, projectHookSnapshots, type HookSessionStateEntry } from "../src/renderer/hook-snapshots.js";
import type { AgentStatusEvidence } from "../src/shared/agent-status.js";
const entry = (overrides: Partial<HookSessionStateEntry> = {}): HookSessionStateEntry => ({ sessionId: "session-a", state: "done", agentId: "codex", projectId: "project", timestamp: "2026-11-17T00:00:00Z", lastPrompt: "task A", ...overrides });
describe("terminal status attribution", () => {
 it("orders live and hydrated evidence by authority revision even when the clock moves backwards", () => {
  const evidence = (revision: number, authorityId = "runtime"): AgentStatusEvidence => ({ authorityId, revision, turnRevision: 1, origin: "hook", observedAt: 0, stateStartedAt: 0, turnStartedAt: 0 });
  const before = entry({ terminalSessionId: "a", state: "working", timestamp: "2026-11-17T00:00:02Z", evidence: evidence(1) });
  const after = entry({ terminalSessionId: "a", state: "done", timestamp: "2026-11-17T00:00:01Z", evidence: evidence(2) });
  expect(isOlderHookSnapshot(after, before)).toBe(false);
  expect(isOlderHookSnapshot(before, after)).toBe(true);
  for (const rows of [{ before, after }, { after, before }]) {
   expect(projectHookSnapshots(rows, [{ terminalId: "a", projectId: "project", agentId: "codex" }]).snapshots.a?.state).toBe("done");
  }
  expect(isOlderHookSnapshot({ ...after, evidence: evidence(100, "other-runtime") }, before)).toBe(true);
  expect(isOlderHookSnapshot({ ...before, evidence: undefined }, after)).toBe(false);
 });
 it("does not copy a newer legacy done row to a stale restored alias in another terminal", () => {
  const rows = { "terminal-a\0session-a": entry({terminalSessionId:"terminal-a"}), "session-a": entry({timestamp:"2026-11-17T00:00:01Z"}), "terminal-b\0session-b": entry({sessionId:"session-b",terminalSessionId:"terminal-b",state:"working",lastPrompt:"task B"}) };
  const { snapshots } = projectHookSnapshots(rows,[{terminalId:"terminal-a",projectId:"project",agentId:"codex",hookSessionId:"session-a"},{terminalId:"terminal-b",projectId:"project",agentId:"codex",hookSessionId:"session-a"}]);
  expect(snapshots["terminal-b"]).toMatchObject({state:"working",sessionId:"session-b",lastPrompt:"task B"});
 });
 it("does not guess a restored alias shared by two tabs", () => {
  const { snapshots } = projectHookSnapshots({"session-a":entry()},["a","b"].map(terminalId=>({terminalId,projectId:"project",agentId:"codex",hookSessionId:"session-a"})));
  expect(snapshots).toEqual({});
 });
 it("rejects cross-project or cross-agent attribution even with a matching terminal id", () => {
  const { snapshots } = projectHookSnapshots({"key":entry({terminalSessionId:"a",agentId:"claude"})},[{terminalId:"a",projectId:"other",agentId:"codex"}]);
  expect(snapshots).toEqual({});
 });
 it("keeps two distinct terminal rows for the same resumed provider conversation", () => {
  const { snapshots } = projectHookSnapshots({a:entry({terminalSessionId:"a"}),b:entry({terminalSessionId:"b",state:"working",lastPrompt:"task B"})},["a","b"].map(terminalId=>({terminalId,projectId:"project",agentId:"codex"})));
  expect(snapshots.a?.lastPrompt).toBe("task A");expect(snapshots.b?.lastPrompt).toBe("task B");expect(snapshots.b?.state).toBe("working");
 });
});
