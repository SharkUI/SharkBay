import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentHookStateManager } from "../src/main/hooks/state-manager.js";
import { CodexConnector, ClaudeConnector } from "../src/main/hooks/connectors/claude-family.js";
import { ProgramStatusReader } from "../src/main/hooks/program-status.js";
import { CodexTurnReader } from "../src/main/hooks/codex-turn-reader.js";
import { AGENT_STATUS_RANK, mergeAgentScreenState, type AgentDisplayState } from "../src/shared/agent-status.js";

const managers: AgentHookStateManager[] = [];
const folders: string[] = [];
afterEach(() => { managers.forEach((manager) => manager.dispose()); managers.length = 0; folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })); folders.length = 0; vi.useRealTimers(); });
function harness(agent = "codex") {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
  const root = mkdtempSync(path.join(os.tmpdir(), "sharkbay-agent-status-")); folders.push(root);
  const manager = new AgentHookStateManager(); managers.push(manager);
  manager.registerConnector(agent === "codex" ? new CodexConnector() : new ClaudeConnector());
  const send = (name: string, fields: Record<string, unknown> = {}, terminalSessionId = "terminal-a") => manager.handleMessage({
    source: agent, terminalSessionId, launchToken: terminalSessionId,
    payload: { cwd: root, session_id: "provider-session", turn_id: "turn-a", hook_event_name: name, ...fields },
  });
  const read = () => manager.getStatus(root, "provider-session")!;
  return { manager, send, read, root };
}
describe("agent status lifecycle", () => {
  it.each([
    ["\x1b]7501;state=clear\x07", false], ["\x1bc", false],
    ["\x1b]7501;state=clear\x07", true], ["\x1bc", true],
  ] as const)("preserves post-boundary elicitation through delayed OSC arbitration (case %#)", (boundary, pendingBeforeBoundary) => {
    const { manager, send, read, root } = harness("claude"); send("UserPromptSubmit", { turn_id: undefined });
    const reader = new ProgramStatusReader();
    const event = { agent: "claude", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    const report = (data: string) => { for (const value of reader.feed(data)) manager.ingestProgramStatus(event, value); };
    report("\x1b]7501;state=working\x07");
    if (pendingBeforeBoundary) send("Elicitation", { elicitation_id: "old", turn_id: undefined });
    vi.advanceTimersByTime(1000); report(boundary);
    expect(read().state).toBe("working");
    const revision = read().evidence.revision;
    send("ElicitationResult", { elicitation_id: "old", turn_id: undefined });
    expect(read().evidence.revision).toBe(revision);
    vi.advanceTimersByTime(1000);
    send("Elicitation", { elicitation_id: "new", turn_id: undefined });
    const waiting = read(); expect(waiting.state).toBe("waiting");
    vi.advanceTimersByTime(120_002);
    expect(read()).toMatchObject({ state: "waiting", timestamp: waiting.timestamp,
      evidence: { stateStartedAt: waiting.evidence.stateStartedAt, sessionBoundary: false } });
    const settledRevision = read().evidence.revision;
    send("ElicitationResult", { elicitation_id: "old", turn_id: undefined });
    expect(read().evidence.revision).toBe(settledRevision);
    send("ElicitationResult", { elicitation_id: "new", turn_id: undefined });
    expect(read()).toMatchObject({ state: "idle", evidence: { origin: "osc", sessionBoundary: true } });
  });
  it.each([
    ["Stop", false, "done", "\x1b]7501;state=clear\x07"], ["Stop", false, "done", "\x1bc"],
    ["StopFailure", false, "failed", "\x1b]7501;state=clear\x07"], ["StopFailure", false, "failed", "\x1bc"],
    ["Stop", true, "interrupted", "\x1b]7501;state=clear\x07"], ["Stop", true, "interrupted", "\x1bc"],
  ] as const)("cleans a completed hook's dialog independently of execution arbitration (case %#)", (stop, is_interrupt, state, boundary) => {
    const { manager, send, read, root } = harness("claude");
    send("SessionStart", { source: "startup", turn_id: undefined }); send("UserPromptSubmit", { turn_id: undefined });
    send(stop, { is_interrupt, turn_id: undefined });
    const original = read();
    const reader = new ProgramStatusReader();
    const event = { agent: "claude", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    const report = (data: string) => { for (const value of reader.feed(data)) manager.ingestProgramStatus(event, value); };
    report("\x1b]7501;state=done\x07");
    send("Elicitation", { elicitation_id: "a", turn_id: undefined }); expect(read().state).toBe("waiting");
    vi.advanceTimersByTime(130_000); report(boundary);
    expect(read()).toMatchObject({ state, timestamp: original.timestamp, evidence: { origin: "hook" } });
    const published: string[] = []; manager.on("stateChange", value => published.push(value.state));
    send("ElicitationResult", { elicitation_id: "a", turn_id: undefined }); vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    expect(read().state).toBe(state); expect(published).toEqual([]);
  });
  it.each(["\x1b]7501;state=clear\x07", "\x1bc"])("cleans pending elicitation and its timer on accepted OSC boundary %j", (boundary) => {
    const { manager, send, read, root } = harness("claude"); send("UserPromptSubmit", { turn_id: undefined });
    vi.advanceTimersByTime(120_002);
    const reader = new ProgramStatusReader();
    const event = { agent: "claude", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    const report = (data: string) => { for (const value of reader.feed(data)) manager.ingestProgramStatus(event, value); };
    report("\x1b]7501;state=working\x07\x1b]7501;state=done\x07");
    send("Elicitation", { elicitation_id: "ask", turn_id: undefined }); expect(read().state).toBe("waiting");
    report("\x1b]7501;state=done\x07"); expect(read().state).toBe("waiting");
    report(boundary); expect(read()).toMatchObject({ state: "idle", evidence: { sessionBoundary: true } });
    const published: string[] = []; manager.on("stateChange", value => published.push(value.state));
    send("ElicitationResult", { elicitation_id: "ask", turn_id: undefined });
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    expect(read().state).toBe("idle"); expect(published).toEqual([]);
  });
  it("clears the dialog even when a hook and OSC boundary agree on initial idle", () => {
    const { manager, send, read, root } = harness("claude"); send("SessionStart", { source: "startup" });
    send("Elicitation", { elicitation_id: "ask" });
    manager.ingestProgramStatus({ agent: "claude", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, { state: "done", sessionBoundary: true });
    expect(read().state).toBe("idle");
  });
  it("binds the first elicitation to an exact terminal's provisional OSC identity", () => {
    const { manager, send, root } = harness("claude");
    const reader = new ProgramStatusReader();
    manager.ingestProgramStatus({ agent: "claude", sessionId: "terminal-a", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, reader.feed("\x1b]7501;app=claude:state=idle\x07")[0]!);
    send("ElicitationResult", { elicitation_id: "a", turn_id: undefined });
    expect(manager.getStatusForTerminal("terminal-a")?.sessionId).toBe("terminal-a");
    send("Elicitation", { elicitation_id: "a", mcp_server_name: "server", turn_id: undefined });
    expect(manager.getStatusForTerminal("terminal-a")).toMatchObject({ sessionId: "provider-session", state: "waiting" });
    send("ElicitationResult", { elicitation_id: "other", mcp_server_name: "server", turn_id: undefined });
    expect(manager.getStatusForTerminal("terminal-a")?.state).toBe("waiting");
    send("ElicitationResult", { elicitation_id: "a", mcp_server_name: "server", turn_id: undefined });
    expect(manager.getStatusForTerminal("terminal-a")).toMatchObject({ sessionId: "provider-session", state: "idle", evidence: { origin: "osc", sessionBoundary: true } });
    send("Elicitation", { session_id: "old-provider", elicitation_id: "old", turn_id: undefined });
    expect(manager.getStatusForTerminal("terminal-a")).toMatchObject({ sessionId: "provider-session", state: "idle" });
  });
  it.each(["agent", "cwd", "launchToken", "bound-session"])("does not bind a provisional request with a conflicting %s", (field) => {
    const { manager, send, root } = harness("claude");
    manager.ingestProgramStatus({ agent: field === "agent" ? "codex" : "claude", cwd: field === "cwd" ? path.join(root, "other") : root,
      launchToken: field === "launchToken" ? "other-launch" : "terminal-a", sessionId: field === "bound-session" ? "other-provider" : "terminal-a",
      terminalSessionId: "terminal-a", event: "tool_start", timestamp: new Date().toISOString() }, { state: "done", sessionBoundary: true });
    send("Elicitation", { elicitation_id: "a", turn_id: undefined });
    expect(manager.getStatusForTerminal("terminal-a")?.state).toBe("idle");
  });
  it.each(["idle", "done", "failed", "interrupted", "working", "monitoring"])("restores %s after matching out-of-turn Claude elicitation results", (state) => {
    const { send, read } = harness("claude");
    send("SessionStart", { source: "startup", turn_id: undefined });
    if (state !== "idle") {
      send("UserPromptSubmit", { turn_id: undefined });
      if (state !== "working") send(state === "failed" ? "StopFailure" : "Stop", { turn_id: undefined,
        is_interrupt: state === "interrupted", ...(state === "monitoring" ? { background_tasks: [{ type: "local_bash", status: "running" }] } : {}) });
    }
    expect(read().state).toBe(state);
    const turn = read().evidence.turnRevision;
    const clock = read().timestamp; vi.advanceTimersByTime(1000);
    const request = { turn_id: undefined, elicitation_id: "request-a", mcp_server_name: "server" };
    send("Elicitation", request); expect(read().state).toBe("waiting");
    send("ElicitationResult", { ...request, elicitation_id: "other" }); expect(read().state).toBe("waiting");
    send("ElicitationResult", { ...request, mcp_server_name: "other" }); expect(read().state).toBe("waiting");
    send("ElicitationResult", { ...request, agent_id: "child" }); expect(read().state).toBe("waiting");
    send("ElicitationResult", request); expect(read().state).toBe(state);
    expect(read().evidence.turnRevision).toBe(turn);
    expect(read().timestamp).toBe(clock);
  });
  it("accepts a new elicitation after OSC completion while retaining the old hook isolation", () => {
    const { manager, send, read, root } = harness("claude"); send("UserPromptSubmit", { turn_id: undefined });
    vi.advanceTimersByTime(120_002);
    manager.ingestProgramStatus({ agent: "claude", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, { state: "done", outcome: "success" });
    expect(read().state).toBe("done");
    send("Elicitation", { elicitation_id: "ask", turn_id: undefined }); expect(read().state).toBe("waiting");
    send("Stop", { turn_id: undefined }); expect(read().state).toBe("waiting");
    send("ElicitationResult", { elicitation_id: "ask", turn_id: undefined }); expect(read().state).toBe("done");
    expect(read().evidence.origin).toBe("osc");
  });
  it("keeps separate elicitation requests pending and preserves intervening completion", () => {
    const { send, read } = harness("claude"); send("UserPromptSubmit");
    send("Elicitation", { elicitation_id: "a" }); send("Elicitation", { elicitation_id: "b" });
    send("StopFailure"); expect(read().state).toBe("waiting");
    send("ElicitationResult", { elicitation_id: "a" }); expect(read().state).toBe("waiting");
    send("ElicitationResult", { elicitation_id: "b" }); expect(read().state).toBe("failed");
  });
  it.each(["UserPromptSubmit", "SessionStart", "SessionEnd"])("clears elicitation at %s and ignores its late result", (boundary) => {
    const { send, read } = harness("claude"); send("SessionStart", { source: "startup" });
    send("Elicitation", { elicitation_id: "a" });
    const turn_id = boundary === "SessionEnd" ? "turn-a" : "turn-b";
    send(boundary, { source: "startup", turn_id });
    const state = read().state;
    expect(state).toBe(boundary === "UserPromptSubmit" ? "working" : "idle");
    send("ElicitationResult", { elicitation_id: "a", turn_id }); expect(read().state).toBe(state);
  });
  it("expires elicitation evidence without destroying the displaced idle fact", () => {
    const { send, read } = harness("claude"); send("SessionStart", { source: "startup" });
    send("Elicitation", { elicitation_id: "a" });
    const clock = read().timestamp;
    vi.advanceTimersByTime(30 * 60 * 1000 + 1); expect(read().state).toBe("unverifiable"); expect(read().timestamp).toBe(clock);
    send("ElicitationResult", { elicitation_id: "a" }); expect(read().state).toBe("idle");
  });
  it("prioritizes project session states strictly by red, yellow, blue, green, then gray", () => {
    const groups: AgentDisplayState[][] = [
      ["failed"], ["waiting", "blocked"], ["working", "monitoring"],
      ["done"], ["interrupted", "unverifiable", "idle", "unknown"],
    ];
    for (const [index, group] of groups.entries()) {
      for (const higher of group) {
        for (const lower of groups.slice(index + 1).flat()) {
          expect(AGENT_STATUS_RANK[higher], `${higher} must outrank ${lower}`).toBeGreaterThan(AGENT_STATUS_RANK[lower]);
        }
      }
    }
  });
  it("tracks all async questions beyond PostToolUse and unrelated work", () => {
    const { send, read } = harness();
    send("UserPromptSubmit", { prompt: "start" });
    const started = read().evidence.turnStartedAt;
    send("PreToolUse", { tool_name: "request_user_input_async", tool_use_id: "ask", tool_input: { questions: [{ title: "a" }, { title: "b" }] } });
    send("PostToolUse", { tool_name: "request_user_input_async", tool_use_id: "ask" });
    send("PreToolUse", { tool_name: "exec", tool_use_id: "other" });
    expect(read().state).toBe("waiting");
    const answer = (index: number) => `<send_user_message_question_reply>${JSON.stringify([{ questionItemId: JSON.stringify(["request_user_input_async", "ask", index]), answer: "yes" }])}</send_user_message_question_reply>`;
    vi.advanceTimersByTime(10); send("UserPromptSubmit", { prompt: answer(0) });
    expect(read().state).toBe("waiting");
    expect(read().evidence.turnStartedAt).toBe(started);
    send("UserPromptSubmit", { prompt: answer(1) });
    expect(read().state).toBe("working");
  });
  it("does not release Claude's question for parallel sibling events", () => {
    const { send, read } = harness("claude");
    send("UserPromptSubmit"); send("PreToolUse", { tool_name: "AskUserQuestion", tool_use_id: "ask" });
    send("PostToolUse", { tool_name: "Bash", tool_use_id: "sibling" });
    expect(read().state).toBe("waiting");
    send("PostToolUse", { tool_name: "AskUserQuestion", tool_use_id: "ask" });
    expect(read().state).toBe("working");
  });
  it("keeps children live after the lead Stop and clears only on their end", () => {
    const { send, read } = harness("claude");
    send("UserPromptSubmit"); send("SubagentStart", { agent_id: "child" }); send("Stop");
    expect(read().state).toBe("working");
    send("SubagentStop", { agent_id: "child" });
    expect(read().state).toBe("done");
  });
  it.each([
    ["Stop", {}, "StopFailure", {}, "done"],
    ["Stop", {}, "Stop", { is_interrupt: true }, "done"],
    ["StopFailure", {}, "SubagentStop", {}, "failed"],
    ["Stop", { is_interrupt: true }, "StopFailure", {}, "interrupted"],
  ] as const)("keeps lead and child outcomes independent (case %#)", (lead, leadFields, child, childFields, expected) => {
    const { send, read } = harness("claude");
    send("UserPromptSubmit"); send("SubagentStart", { agent_id: "child" });
    send(lead, leadFields); expect(read().state).toBe("working");
    send(child, { ...childFields, agent_id: "child" }); expect(read().state).toBe(expected);
  });
  it("does not reopen OSC completion for an old hook child roster, including after a repeated lead Stop", () => {
    const { manager, send, read, root } = harness("claude");
    send("UserPromptSubmit"); send("SubagentStart", { agent_id: "old-child" });
    manager.ingestProgramStatus({ agent: "claude", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, { state: "done", outcome: "success" });
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("done");
    send("SubagentStop", { agent_id: "sibling" }); expect(read().state).toBe("done");
    send("Stop"); expect(read().state).toBe("done");
    send("PreToolUse", { agent_id: "old-child", tool_name: "Bash" }); expect(read().state).toBe("done");
    send("UserPromptSubmit", { turn_id: "turn-b" });
    send("SubagentStart", { agent_id: "new-child" }); send("Stop", { turn_id: "turn-b" });
    expect(read().state).toBe("working");
    send("SubagentStop", { agent_id: "new-child" }); expect(read().state).toBe("done");
  });
  it.each(["Stop", "PreToolUse", "PermissionRequest"])("keeps new OSC waiting safe from a completed Claude turn's %s without turn IDs", (hook) => {
    const { manager, send, read, root } = harness("claude");
    const emit = (name: string) => send(name, { turn_id: undefined });
    emit("UserPromptSubmit"); emit("Stop"); vi.advanceTimersByTime(1000);
    manager.ingestProgramStatus({ agent: "claude", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, { state: "waiting", workingSince: Date.now() });
    expect(read().state).toBe("waiting");
    const revision = read().evidence.revision;
    emit(hook); expect(read().state).toBe("waiting"); expect(read().evidence.revision).toBe(revision);
    emit("UserPromptSubmit"); expect(read().state).toBe("working");
    emit("Stop"); expect(read().state).toBe("done");
  });
  it.each(["child-end", "session-boundary"])("retains accepted OSC child work across lead Stop until %s", (release) => {
    const { manager, send, read, root } = harness();
    send("UserPromptSubmit"); send("PermissionRequest"); vi.advanceTimersByTime(120_002);
    const reader = new ProgramStatusReader();
    const event = { agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    const report = (body: string) => { for (const value of reader.feed(`\x1b]7501;${body}\x07`, Date.now())) manager.ingestProgramStatus(event, value); };
    report("state=working"); report("id=child:state=working"); report("state=done");
    expect(read()).toMatchObject({ state: "working", evidence: { origin: "osc" } });
    send("Stop"); expect(read().state).toBe("working");
    report("state=done"); expect(read().state).toBe("working");
    if (release === "child-end") { report("id=child:state=done"); expect(read().state).toBe("done"); }
    else { send("SessionEnd"); expect(read().state).toBe("idle"); }
    send("UserPromptSubmit", { turn_id: "turn-b" }); expect(read().state).toBe("working");
    send("Stop", { turn_id: "turn-b" }); expect(read().state).toBe("done");
  });
  it("distinguishes initial idle, failure and interrupt; old same-turn tool hooks cannot reopen it", () => {
    const { send, read } = harness("claude");
    send("SessionStart"); expect(read().state).toBe("idle");
    send("UserPromptSubmit"); send("StopFailure"); expect(read().state).toBe("failed");
    send("PostToolUse", { tool_name: "Bash" }); expect(read().state).toBe("failed");
    send("UserPromptSubmit", { turn_id: "turn-b" }); expect(read().state).toBe("working");
  });
  it("keeps background shells in monitoring after the lead finishes, then settles on an empty inventory", () => {
    const { send, read } = harness("claude"); send("UserPromptSubmit");
    send("Stop", { background_tasks: [{ id: "shell", type: "local_bash", status: "running" }] });
    expect(read().state).toBe("monitoring");
    send("Stop", { background_tasks: [], session_crons: [] }); expect(read().state).toBe("done");
  });
  it("ignores a delayed Stop from the previous turn after a new prompt", () => {
    const { send, read } = harness(); send("UserPromptSubmit"); send("Stop");
    send("UserPromptSubmit", { turn_id: "turn-b" });
    send("Stop", { turn_id: "turn-a" }); expect(read().state).toBe("working");
  });
  it("reports startup failure even when no provider hook ever arrived", () => {
    const { manager, root } = harness();
    manager.finishTerminal("failed-start", true, { agent: "codex", sessionId: "failed-start", terminalSessionId: "failed-start", cwd: root, event: "session_end", timestamp: new Date().toISOString() });
    expect(manager.getStatus(root, "failed-start")).toMatchObject({ state: "failed", evidence: { origin: "process" } });
  });
  it("expires evidence without emitting a completion and revives on a new observation", () => {
    const { send, read } = harness(); send("UserPromptSubmit");
    const clock = read().timestamp;
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    expect(read().state).toBe("unverifiable"); expect(read().timestamp).toBe(clock);
    send("PreToolUse", { tool_name: "exec" }); expect(read().state).toBe("working");
  });
  it("preserves precise terminal identity independently of PID ancestry", () => {
    const { send, read } = harness(); send("UserPromptSubmit");
    expect(read().terminalSessionId).toBe("terminal-a");
    send("UserPromptSubmit", { session_id: "second-provider" }, "terminal-b");
    expect(read().terminalSessionId).toBe("terminal-a");
  });
  it("uses sustained OSC disagreement only after hook silence; old working cannot reopen done", () => {
    const { manager, send, read, root } = harness(); send("UserPromptSubmit");
    const event = { agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    manager.ingestProgramStatus(event, { state: "done" }); expect(read().state).toBe("working");
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("done");
    send("Stop");
    manager.ingestProgramStatus(event, { state: "working", workingSince: Date.now() - 1000 });
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("done");
    expect(mergeAgentScreenState("working", "done")).toBe("done");
    expect(mergeAgentScreenState("done", "unverifiable")).toBe("unverifiable");
  });
  it("does not let an old OSC wait reopen a completed hook turn and then turn it working", () => {
    const { manager, send, read, root } = harness(); send("UserPromptSubmit");
    const workingSince = Date.now();
    const event = { agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    vi.advanceTimersByTime(1000); send("Stop");
    const revision = read().evidence.revision;
    for (const state of ["waiting", "working"] as const) {
      manager.ingestProgramStatus(event, { state, workingSince });
      vi.advanceTimersByTime(120_002);
      expect(read().state).toBe("done");
      expect(read().evidence.revision).toBe(revision);
    }
    send("UserPromptSubmit", { turn_id: "turn-b" }); expect(read().state).toBe("working");
  });
  it("still accepts an OSC wait from work begun after a completed hook turn", () => {
    const { manager, send, read, root } = harness();
    const file = path.join(root, "rollout.jsonl");
    writeFileSync(file, JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-a" } }) + "\n");
    send("UserPromptSubmit", { transcript_path: file }); send("Stop");
    vi.advanceTimersByTime(1000);
    manager.ingestProgramStatus({ agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, { state: "waiting", workingSince: Date.now() });
    expect(read().state).toBe("waiting");
    vi.advanceTimersByTime(1001); expect(read().state).toBe("waiting");
    send("Stop"); expect(read().state).toBe("waiting");
    send("UserPromptSubmit", { turn_id: "turn-b" }); expect(read().state).toBe("working");
  });
  it("does not reopen a completed hook turn for children held by the program roster", () => {
    const { manager, send, read, root } = harness(); send("UserPromptSubmit"); send("Stop");
    vi.advanceTimersByTime(1000);
    const reader = new ProgramStatusReader();
    reader.feed("\x1b]7501;state=working\x07", Date.now());
    reader.feed("\x1b]7501;id=child:state=working\x07", Date.now());
    const report = reader.feed("\x1b]7501;state=done\x07", Date.now())[0]!;
    manager.ingestProgramStatus({ agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, report);
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("done");
  });
  it("retains the current provider turn when OSC takes over, rejecting an old Stop", () => {
    const { manager, send, read, root } = harness(); send("UserPromptSubmit", { turn_id: "turn-b" });
    manager.ingestProgramStatus({ agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, { state: "waiting", workingSince: Date.now() });
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("waiting");
    send("Stop", { turn_id: "turn-a" }); expect(read().state).toBe("waiting");
    send("Stop", { turn_id: "turn-b" }); expect(read().state).toBe("done");
  });
  it("keeps watching the current rollout after OSC fallback", () => {
    const { manager, send, read, root } = harness();
    const file = path.join(root, "rollout.jsonl"); writeFileSync(file, "");
    send("UserPromptSubmit", { transcript_path: file });
    manager.ingestProgramStatus({ agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, { state: "waiting", workingSince: Date.now() });
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("waiting");
    appendFileSync(file, JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-a" } }) + "\n");
    vi.advanceTimersByTime(1001); expect(read().state).toBe("done");
  });
  it("keeps the lead's own auth block ahead of a child's question", () => {
    const { manager, read, root } = harness();
    const event = { agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    manager.ingestProgramStatus(event, { state: "blocked" });
    manager.injectEvent({ ...event, event: "attention", childId: "child" });
    expect(read().state).toBe("blocked");
  });
  it("processes valid async answers even when another reply item is malformed", () => {
    const { send, read } = harness(); send("UserPromptSubmit");
    send("PreToolUse", { tool_name: "request_user_input_async", tool_use_id: "ask", tool_input: { questions: [{ title: "a" }] } });
    const replies = [null, { questionItemId: "bad json" }, { questionItemId: JSON.stringify(["request_user_input_async", "ask", 0]) }];
    send("UserPromptSubmit", { prompt: `<send_user_message_question_reply>${JSON.stringify(replies)}</send_user_message_question_reply>` });
    expect(read().state).toBe("working");
  });
  it("does not let OpenCode's folder-wide live reports override its own waiting hook", () => {
    const { manager, read, root } = harness();
    const event = { agent: "opencode", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "attention" as const, timestamp: new Date().toISOString() };
    manager.injectEvent(event);
    vi.advanceTimersByTime(1000);
    const report = new ProgramStatusReader().feed("\x1b]7501;app=opencode:state=working\x07", Date.now())[0]!;
    manager.ingestProgramStatus(event, report);
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("waiting");
    const idle = new ProgramStatusReader().feed("\x1b]7501;app=opencode:state=idle\x07", Date.now())[0]!;
    manager.ingestProgramStatus(event, idle); expect(read().state).toBe("idle");
  });
  it("arbitrates against the combined async-wait state rather than only the working lead", () => {
    const { manager, send, read, root } = harness(); send("UserPromptSubmit");
    send("PreToolUse", { tool_name: "request_user_input_async", tool_use_id: "ask", tool_input: { questions: [{ title: "a" }] } });
    const event = { agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    manager.ingestProgramStatus(event, { state: "working", workingSince: Date.now() - 1000 });
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("waiting");
    manager.ingestProgramStatus(event, { state: "working", workingSince: Date.now() });
    expect(read().state).toBe("working");
  });
  it("treats a normalized new session as idle even without a connector boundary flag", () => {
    const { manager, read, root } = harness();
    manager.injectEvent({ agent: "gemini", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "session_start", timestamp: new Date().toISOString() });
    expect(read().state).toBe("idle");
  });
  it("does not treat Claude's compaction or child SessionStart as a new idle lead", () => {
    const { send, read } = harness("claude"); send("UserPromptSubmit");
    const revision = read().evidence.revision;
    send("SessionStart", { source: "compact" }); expect(read().state).toBe("working");
    send("SessionStart", { source: "startup", agent_id: "child" });
    expect(read().evidence.revision).toBe(revision);
    send("SessionStart", { source: "clear" }); expect(read().state).toBe("idle");
  });
  it("cancels an OSC disagreement if the program agrees again before the silence deadline", () => {
    const { manager, send, read, root } = harness(); send("UserPromptSubmit");
    const event = { agent: "codex", sessionId: "provider-session", terminalSessionId: "terminal-a", cwd: root, event: "tool_start" as const, timestamp: new Date().toISOString() };
    manager.ingestProgramStatus(event, { state: "done" });
    vi.advanceTimersByTime(1000);
    manager.ingestProgramStatus(event, { state: "working" });
    vi.advanceTimersByTime(120_002); expect(read().state).toBe("working");
  });
  it("clears a skipped async question without waiting for a nonexistent answer hook", () => {
    const { manager, send, read } = harness(); send("UserPromptSubmit");
    send("PreToolUse", { tool_name: "request_user_input_async", tool_use_id: "ask", tool_input: { questions: [{ title: "a" }] } });
    expect(read().state).toBe("waiting");
    manager.noteTerminalInput("terminal-a", "\x1d"); expect(read().state).toBe("working");
  });
  it("fills a missing Codex Stop from an exact current-turn rollout", () => {
    const { send, read, root } = harness();
    const file = path.join(root, "rollout.jsonl"); writeFileSync(file, "");
    send("UserPromptSubmit", { transcript_path: file });
    appendFileSync(file, JSON.stringify({ type: "event_msg", payload: { type: "turn_aborted", turn_id: "turn-a", reason: "interrupted" } }) + "\n");
    vi.advanceTimersByTime(1001); expect(read().state).toBe("interrupted");
  });
});
describe("program evidence", () => {
  it("clears a full child-only roster and admits a new root afterwards", () => {
    const reader = new ProgramStatusReader();
    for (let index = 0; index < 128; index++) reader.feed(`\x1b]7501;id=child-${index}:state=working\x07`, index);
    expect(reader.feed("\x1b]7501;state=clear\x07", 130)[0]).toMatchObject({ state: "done", sessionBoundary: true });
    expect(reader.feed("\x1b]7501;state=working\x07", 140)[0]?.state).toBe("working");
    expect(reader.feed("\x1b]7501;state=done\x07", 150)[0]?.state).toBe("done");
  });
  it.each(["done", "error"])("keeps the %s verdict when the same program rests", (state) => {
    const reader = new ProgramStatusReader();
    reader.feed("\x1b]7501;app=codex:state=working\x07", 100);
    const verdict = reader.feed(`\x1b]7501;state=${state}\x07`, 110)[0]!;
    expect(reader.feed("\x1b]7501;state=idle\x07", 120)[0]).toMatchObject({ state: "done", outcome: verdict.outcome });
    expect(reader.feed("\x1b]7501;state=idle\x07", 130)[0]?.sessionBoundary).not.toBe(true);
    reader.feed("\x1b]7501;state=clear\x07", 140);
    expect(reader.feed("\x1b]7501;app=codex:state=idle\x07", 150)[0]).toMatchObject({ state: "done", sessionBoundary: true });
  });
  it.each([["codex", true], ["opencode", false]] as const)("interprets startup work then idle for %s", (app, boundary) => {
    const reader = new ProgramStatusReader();
    reader.feed(`\x1b]7501;app=${app}:state=working\x07`, 100);
    expect(reader.feed(`\x1b]7501;app=${app}:state=idle\x07`, 110)[0]?.sessionBoundary === true).toBe(boundary);
  });
  it("tracks ordered working transitions across OSC 9999, waits and completion", () => {
    const reader = new ProgramStatusReader();
    const frame = (state: string) => `\x1b]9999;${JSON.stringify({ state })}\x07`;
    expect(reader.feed(frame("working"), 100)[0]?.workingSince).toBe(100);
    expect(reader.feed(frame("working"), 110)[0]?.workingSince).toBe(100);
    expect(reader.feed(frame("waiting"), 120)[0]?.workingSince).toBe(100);
    expect(reader.feed(frame("working"), 130)[0]?.workingSince).toBe(130);
    reader.feed(frame("done"), 140);
    expect(reader.feed(frame("working"), 150)[0]?.workingSince).toBe(150);
  });
  it("preserves native OSC verdicts, lead state and monitoring without leaking a live verdict", () => {
    const reader = new ProgramStatusReader();
    const feed = (value: object) => reader.feed(`\x1b]9999;${JSON.stringify(value)}\x07`, 100)[0]!;
    expect(feed({ state: "done", mainAgent: { state: "done", outcome: "failure", stateStartedAt: 90 } })).toMatchObject({ state: "done", outcome: "failure", leadState: "done" });
    expect(feed({ state: "working", workingMode: "monitoring", mainAgent: { state: "done", stateStartedAt: 90 } })).toMatchObject({ state: "working", workingMode: "monitoring", leadState: "done" });
    expect(feed({ state: "working", interrupted: true, sessionBoundary: true, mainAgent: { state: "working", outcome: "failure", stateStartedAt: 90 } })).toMatchObject({ state: "working", outcome: undefined, sessionBoundary: false });
  });
  it("does not let child work hold a program invocation boundary open", () => {
    const reader = new ProgramStatusReader();
    reader.feed("\x1b]7501;app=codex:state=working\x07", 100);
    reader.feed("\x1b]7501;id=child:state=working\x07", 110);
    expect(reader.feed("\x1b]7501;state=idle\x07", 120)[0]).toMatchObject({ state: "done", sessionBoundary: true });
  });
  it("keeps the last result at the shell prompt but does not give it to the next invocation", () => {
    const reader = new ProgramStatusReader();
    reader.feed("\x1b]7501;state=error\x07", 100);
    expect(reader.feed("\x1b]133;A\x07", 110)).toEqual([]);
    expect(reader.feed("\x1b]7501;app=codex:state=idle\x07", 120)[0]).toMatchObject({ state: "done", sessionBoundary: true });
  });
  it("does not turn unrelated shell markers or resets into agent completion evidence", () => {
    const reader = new ProgramStatusReader();
    expect(reader.feed("\x1b]133;A\x07\x1bc", 100)).toEqual([]);
    reader.feed('\x1b]9999;{"state":"working"}\x07', 110);
    expect(reader.feed("\x1b]133;A\x07\x1bc", 120)).toEqual([]);
  });
  it("releases live records at a shell prompt and handles a split full terminal reset", () => {
    const reader = new ProgramStatusReader();
    reader.feed("\x1b]7501;state=working\x07", 100);
    expect(reader.feed("\x1b]133;A\x07", 110)[0]).toMatchObject({ state: "done", sessionBoundary: true });
    reader.feed("\x1b]7501;state=error\x07", 120);
    expect(reader.feed("\x1b", 130)).toEqual([]);
    expect(reader.feed("c", 140)[0]).toMatchObject({ state: "done", sessionBoundary: true });
    expect(reader.feed("\x1b]7501;state=idle\x07", 150)[0]?.outcome).toBeUndefined();
  });
  it("parses split OSC frames, auth blocks and question waits without reading display text", () => {
    const reader = new ProgramStatusReader();
    expect(reader.feed("Working\x1b]7501;state=blocked:kind=ques")).toEqual([]);
    expect(reader.feed("tion\x1b\\")[0]?.state).toBe("waiting");
    expect(reader.feed("\x1b]7501;state=blocked:kind=auth\x07")[0]?.state).toBe("blocked");
    expect(reader.feed("\x1b]7501;state=error\x07")[0]).toMatchObject({ state: "done", outcome: "failure" });
  });
  it("answers a program-status capability probe once on the host", () => {
    const reader = new ProgramStatusReader();
    expect(reader.feed("\x1b]7501;?\x1b\\")).toEqual([]);
    expect(reader.takeQueryReply()).toBe("\x1b]7501;?:states=idle,working,done,blocked,error:kinds=permission,question,auth\x1b\\");
    expect(reader.takeQueryReply()).toBeNull();
  });
  it("folds child work into root status and releases it when the child completes", () => {
    const reader = new ProgramStatusReader();
    reader.feed("\x1b]7501;state=working\x07", 100);
    reader.feed("\x1b]7501;id=child:state=working\x07", 110);
    expect(reader.feed("\x1b]7501;state=done\x07", 120)[0]?.state).toBe("working");
    expect(reader.feed("\x1b]7501;id=child:state=done\x07", 130)[0]).toMatchObject({ state: "done", outcome: "success" });
  });
  it("ignores a completed rollout for another turn and supports appended partial records", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "sharkbay-rollout-")); folders.push(root);
    const file = path.join(root, "rollout.jsonl");
    writeFileSync(file, '{"type":"event_msg","payload":{"type":"task_complete","turn_id":"old"}}\n');
    const reader = new CodexTurnReader(file); expect(reader.read("current")).toBeUndefined();
    appendFileSync(file, '{"type":"event_msg","payload":{"type":"turn_complete",');
    expect(reader.read("current")).toBeUndefined();
    appendFileSync(file, '"turn_id":"current"}}\n'); expect(reader.read("current")).toBe("success");
  });
  it("retains observed completion for a turn whose prompt hook arrives later", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "sharkbay-rollout-")); folders.push(root);
    const file = path.join(root, "rollout.jsonl");
    writeFileSync(file, JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-b" } }) + "\n");
    const reader = new CodexTurnReader(file);
    expect(reader.read("turn-a")).toBeUndefined(); expect(reader.read("turn-b")).toBe("success");
  });
  it("finds recent completion in a large rollout without replaying its full history", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "sharkbay-rollout-")); folders.push(root);
    const file = path.join(root, "rollout.jsonl");
    writeFileSync(file, "{}\n".repeat(100_000) + JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "current" } }) + "\n");
    expect(new CodexTurnReader(file).read("current")).toBe("success");
  });
});

describe("deployed hook transport", () => {
  it("carries exact terminal identity from the generated CLI through the Unix socket", async () => {
    const { HookBridge } = await import("../src/main/hooks/bridge.js");
    const { spawn } = await import("node:child_process");
    const root = mkdtempSync(path.join(os.tmpdir(), "sharkbay-hook-wire-")); folders.push(root);
    const bridge = new HookBridge({ socketDir: root, socketPathFile: path.join(root, "socket-path") });
    const manager = new AgentHookStateManager(); managers.push(manager); manager.registerConnector(new CodexConnector());
    bridge.on("event", (message) => manager.handleMessage(message));
    const children = new Set<import("node:child_process").ChildProcess>();
    try {
      await bridge.start(root);
      for (const [hook, state] of [["UserPromptSubmit", "working"], ["Stop", "done"]] as const) {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(process.execPath, [path.join(root, "bin/sharkbay-hook"), "--source", "codex"], {
            env: { ...process.env, SHARKBAY_TERMINAL_SESSION_ID: "exact-terminal", SHARKBAY_AGENT_LAUNCH_TOKEN: "launch" }, stdio: ["pipe", "ignore", "pipe"],
          });
          children.add(child);
          const timeout = setTimeout(() => { child.kill(); reject(new Error("Hook transport timed out")); }, 3000);
          child.on("error", (error) => { clearTimeout(timeout); reject(error); });
          child.on("close", (code) => { clearTimeout(timeout); children.delete(child); code === 0 ? resolve() : reject(new Error(`Hook exited ${code}`)); });
          child.stdin.end(JSON.stringify({ hook_event_name: hook, session_id: "provider-id", turn_id: "turn-a", cwd: root }));
        });
        await vi.waitFor(() => expect(manager.getStatus(root, "provider-id")).toMatchObject({ terminalSessionId: "exact-terminal", state, evidence: { origin: "hook" } }));
      }
      const published = readFileSync(path.join(root, ".sharkbay/logs/hooks.log"), "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(row => row.status);
      expect(published.at(-1).status).toMatchObject({ terminalSessionId: "exact-terminal", turnId: "turn-a", event: "turn_end", state: "done", evidence: { origin: "hook" } });
      expect(published.at(-1).status).not.toHaveProperty("prompt");
    } finally { for (const child of children) child.kill(); await bridge.stop(); }
  });
});
