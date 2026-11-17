import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentHookStateManager, type HookStateEvent } from "../src/main/hooks/state-manager.js";
import { ClaudeConnector, CodexConnector } from "../src/main/hooks/connectors/claude-family.js";
import type { ProgramStatus } from "../src/main/hooks/program-status.js";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.useRealTimers(); });
function harness(agent = "claude") {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
  const root = mkdtempSync(path.join(os.tmpdir(), "sharkbay-status-coalescing-"));
  const manager = new AgentHookStateManager(); const events: HookStateEvent[] = [];
  manager.registerConnector(agent === "codex" ? new CodexConnector() : new ClaudeConnector());
  manager.on("stateChange", event => events.push(event));
  cleanups.push(() => { manager.dispose(); rmSync(root, { recursive: true, force: true }); });
  const send = (name: string, fields: Record<string, unknown> = {}, terminalSessionId = "terminal-a") => manager.handleMessage({
    source: agent, terminalSessionId, launchToken: terminalSessionId,
    payload: { cwd: root, session_id: "provider", hook_event_name: name, ...fields },
  });
  const read = (terminalId = "terminal-a") => manager.getStatusForTerminal(terminalId)!;
  const report = (status: ProgramStatus) => manager.ingestProgramStatus({ agent, sessionId: "provider", terminalSessionId: "terminal-a", cwd: root, event: "tool_start", timestamp: new Date().toISOString() }, status);
  return { root, manager, events, send, read, report };
}

describe("isolated agent status notification coalescing", () => {
  it("reduces 200 tool updates to a leading and latest trailing notification/log without delaying internal state", () => {
    const { root, send, read, events } = harness();
    for (let index = 0; index < 200; index++) send("PreToolUse", { tool_name: `Read-${index}` });
    expect(read()).toMatchObject({ state: "working", action: "Claude: Read-199" });
    expect(read().evidence.revision).toBe(200);
    expect(events).toHaveLength(1);
    vi.advanceTimersByTime(199); expect(events).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(events).toHaveLength(2);
    expect(events.at(-1)).toEqual(read());
    const rows = readFileSync(path.join(root, ".sharkbay/logs/hooks.log"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(rows.filter(row => row.normalized)).toHaveLength(200);
    expect(rows.filter(row => row.status).map(row => row.status.evidence.revision)).toEqual([1, 200]);
    vi.advanceTimersByTime(1000); expect(events).toHaveLength(2);
  });

  it.each([
    ["PermissionRequest", {}, "waiting"], ["Stop", {}, "done"],
    ["StopFailure", {}, "failed"], ["Stop", { is_interrupt: true }, "interrupted"],
    ["SessionEnd", {}, "idle"], ["Stop", { background_tasks: [{ type: "local_bash", status: "running" }] }, "monitoring"],
  ] as const)("publishes %s/%j immediately and cancels queued older progress", (name, fields, state) => {
    const { send, read, events } = harness();
    send("UserPromptSubmit", { prompt: "work" }); send("PreToolUse", { tool_name: "Read" });
    send(name, fields);
    expect(events.map(event => event.state)).toEqual(["working", state]);
    expect(events.at(-1)).toEqual(read());
    vi.advanceTimersByTime(250); expect(events.map(event => event.state)).toEqual(["working", state]);
  });

  it("coalesces OSC progress while preserving immediate blocked, waiting and outcome changes", () => {
    const { report, read, events } = harness();
    for (let index = 0; index < 200; index++) report({ state: "working" });
    expect(events).toHaveLength(1);
    report({ state: "blocked" }); report({ state: "waiting" }); report({ state: "done", outcome: "failure" });
    expect(events.map(event => event.state)).toEqual(["working", "blocked", "waiting", "failed"]);
    expect(events.at(-1)).toEqual(read());
    vi.advanceTimersByTime(250); expect(events).toHaveLength(4);
  });

  it("preserves the event clock, turn identity and latest monotonic evidence during sustained activity", () => {
    const { send, read, events } = harness(); send("UserPromptSubmit", { prompt: "first" });
    const initial = read().evidence;
    vi.advanceTimersByTime(100); send("PreToolUse", { tool_name: "Read" });
    const latest = read(); vi.advanceTimersByTime(100);
    expect(events.at(-1)).toEqual(latest);
    expect(events.at(-1)!.evidence).toMatchObject({ authorityId: initial.authorityId, turnRevision: initial.turnRevision, turnStartedAt: initial.turnStartedAt, stateStartedAt: initial.stateStartedAt });
    expect(events.at(-1)!.evidence.observedAt).toBe(initial.observedAt + 100);
    send("UserPromptSubmit", { prompt: "second" });
    expect(events.at(-1)).toEqual(read());
    expect(events.at(-1)!.evidence.turnRevision).toBeGreaterThan(initial.turnRevision);
    expect(events.map(event => event.evidence.revision)).toEqual([...events.map(event => event.evidence.revision)].sort((a, b) => a - b));
  });

  it("keeps delivering progress during a continuous burst instead of waiting for silence", () => {
    const { manager, send, read, events } = harness();
    const publishedAt: number[] = []; manager.on("stateChange", () => publishedAt.push(Date.now()));
    send("PreToolUse", { tool_name: "Read-0" });
    for (let index = 1; index <= 100; index++) {
      vi.advanceTimersByTime(10); send("PreToolUse", { tool_name: `Read-${index}` });
    }
    expect(events.length).toBeGreaterThanOrEqual(5); expect(events.length).toBeLessThanOrEqual(7);
    vi.advanceTimersByTime(200); expect(events.at(-1)).toEqual(read());
    expect(events.at(-1)!.action).toBe("Claude: Read-100");
    for (let index = 1; index < publishedAt.length; index++) expect(publishedAt[index]! - publishedAt[index - 1]!).toBe(200);
  });

  it("publishes process evidence immediately even when the displayed completion is unchanged", () => {
    const { manager, send, read, events } = harness();
    send("UserPromptSubmit"); send("Stop"); send("Stop");
    expect(events).toHaveLength(2);
    manager.finishTerminal("terminal-a", false);
    expect(events).toHaveLength(3); expect(events.at(-1)).toEqual(read());
    expect(events.at(-1)).toMatchObject({ state: "done", evidence: { origin: "process" } });
    vi.advanceTimersByTime(250); expect(events).toHaveLength(3);
  });

  it("publishes stale evidence without inventing a newer observation time", () => {
    const { send, read, events } = harness(); send("UserPromptSubmit");
    vi.advanceTimersByTime(100); send("PreToolUse"); const observed = read().timestamp;
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    expect(events.at(-1)).toEqual(read());
    expect(events.at(-1)).toMatchObject({ state: "unverifiable", timestamp: observed });
  });

  it("folds every child lifecycle event before coalescing its notifications", () => {
    const { send, read, events } = harness(); send("UserPromptSubmit");
    for (let index = 0; index < 20; index++) send("SubagentStart", { agent_id: `child-${index}` });
    send("Stop"); expect(read().state).toBe("working");
    for (let index = 0; index < 19; index++) send("SubagentStop", { agent_id: `child-${index}` });
    expect(read().state).toBe("working"); expect(events).toHaveLength(1);
    send("SubagentStop", { agent_id: "child-19" });
    expect(events.map(event => event.state)).toEqual(["working", "done"]);
    vi.advanceTimersByTime(250); expect(events.at(-1)).toEqual(read()); expect(events).toHaveLength(2);
  });

  it("retains all asynchronous question answers before releasing the wait", () => {
    const { send, read, events } = harness("codex"); send("UserPromptSubmit");
    send("PreToolUse", { tool_name: "request_user_input_async", tool_use_id: "call", tool_input: { questions: [{}, {}] } });
    expect(events.at(-1)!.state).toBe("waiting");
    const answer = (index: number) => `<send_user_message_question_reply>${JSON.stringify([{ questionItemId: JSON.stringify(["request_user_input_async", "call", index]) }])}</send_user_message_question_reply>`;
    send("UserPromptSubmit", { prompt: answer(0) }); expect(read().state).toBe("waiting");
    send("UserPromptSubmit", { prompt: answer(1) }); expect(events.at(-1)!.state).toBe("working");
    send("Stop"); vi.advanceTimersByTime(250); expect(events.at(-1)).toEqual(read()); expect(read().state).toBe("done");
  });

  it("does not resurrect an elicitation cleared before a pending update was sent", () => {
    const { send, read, events } = harness(); send("UserPromptSubmit");
    send("Elicitation", { elicitation_id: "first" }); send("Elicitation", { elicitation_id: "second" });
    send("ElicitationResult", { elicitation_id: "first" }); expect(read().state).toBe("waiting");
    send("ElicitationResult", { elicitation_id: "second" }); expect(events.at(-1)!.state).toBe("working");
    send("Stop"); vi.advanceTimersByTime(250); expect(events.at(-1)!.state).toBe("done");
  });

  it("keeps independent terminal queues and discards updates after close, replacement or disposal", () => {
    const { manager, send, read, events } = harness();
    send("PreToolUse", { tool_name: "A-first" }); send("PreToolUse", { tool_name: "A-last" });
    send("PreToolUse", { tool_name: "B-first", session_id: "provider-b" }, "terminal-b");
    send("PreToolUse", { tool_name: "B-last", session_id: "provider-b" }, "terminal-b");
    expect(events).toHaveLength(2);
    manager.forgetTerminal("terminal-a"); vi.advanceTimersByTime(200);
    expect(events).toHaveLength(3); expect(events.at(-1)).toEqual(read("terminal-b"));
    send("PreToolUse", { tool_name: "B-queued", session_id: "provider-b" }, "terminal-b");
    send("SessionStart", { source: "startup", session_id: "replacement" }, "terminal-b");
    expect(events.at(-1)).toMatchObject({ state: "idle", sessionId: "replacement" });
    vi.advanceTimersByTime(250); expect(events).toHaveLength(4);
    send("PreToolUse", { session_id: "replacement" }, "terminal-b");
    send("PreToolUse", { tool_name: "queued", session_id: "replacement" }, "terminal-b");
    const beforeDispose = events.length; manager.dispose(); vi.advanceTimersByTime(250);
    expect(events).toHaveLength(beforeDispose);
  });
});
