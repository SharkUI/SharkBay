import { describe, expect, it } from "vitest";

import { applyTurnEvent, createTurn, SILENCE_FALLBACK_MS, type Turn, type TurnEvent } from "../src/main/telegram/turn.js";

const KEY = { hookSessionId: "s1", projectPath: "/proj", ptyId: "pty-1" };

function newTurn(startedAt = 1000): Turn {
  return createTurn({ ...KEY, turnId: "t1", startedAt });
}

function run(turn: Turn, events: TurnEvent[]): { turn: Turn; finalized: boolean } {
  let finalized = false;
  let current = turn;
  for (const e of events) {
    const res = applyTurnEvent(current, e);
    current = res.turn;
    if (res.action === "finalize") finalized = true;
  }
  return { turn: current, finalized };
}

describe("Turn state machine", () => {
  it("finalizes after working then stopped", () => {
    const { finalized, turn } = run(newTurn(), [
      { type: "status", state: "working", at: 1100, hookSessionId: "s1", projectPath: "/proj" },
      { type: "status", state: "stopped", at: 1500, hookSessionId: "s1", projectPath: "/proj" },
    ]);
    expect(finalized).toBe(true);
    expect(turn.state).toBe("done");
  });

  it("does NOT finalize on a stale stopped before working is seen", () => {
    const { finalized } = run(newTurn(1000), [
      // stopped that predates the prompt — must be ignored
      { type: "status", state: "stopped", at: 900, hookSessionId: "s1", projectPath: "/proj" },
      // stopped after prompt but we never saw working — still must not finalize
      { type: "status", state: "stopped", at: 1200, hookSessionId: "s1", projectPath: "/proj" },
    ]);
    expect(finalized).toBe(false);
  });

  it("ignores events for a different hook session / project", () => {
    const { finalized } = run(newTurn(), [
      { type: "status", state: "working", at: 1100, hookSessionId: "other", projectPath: "/proj" },
      { type: "status", state: "stopped", at: 1200, hookSessionId: "other", projectPath: "/proj" },
    ]);
    expect(finalized).toBe(false);
  });

  it("ignores PTY data from another PTY (no cross-talk)", () => {
    const { turn } = run(newTurn(), [
      { type: "ptyData", at: 1100, ptyId: "pty-OTHER" },
    ]);
    expect(turn.sawWorking).toBe(false);
  });

  it("treats this PTY's data as entering working", () => {
    const { turn } = run(newTurn(), [{ type: "ptyData", at: 1100, ptyId: "pty-1" }]);
    expect(turn.sawWorking).toBe(true);
    expect(turn.state).toBe("working");
  });

  it("holds during approval and does not finalize", () => {
    const { finalized, turn } = run(newTurn(), [
      { type: "status", state: "working", at: 1100, hookSessionId: "s1", projectPath: "/proj" },
      { type: "status", state: "approval", at: 1200, hookSessionId: "s1", projectPath: "/proj" },
      { type: "status", state: "stopped", at: 1300, hookSessionId: "s1", projectPath: "/proj" },
    ]);
    expect(finalized).toBe(false);
    expect(turn.approvalHeld).toBe(true);
  });

  it("releases approval then finalizes on next stopped", () => {
    let turn = newTurn();
    const hold = applyTurnEvent(turn, { type: "status", state: "approval", at: 1100, hookSessionId: "s1", projectPath: "/proj" });
    expect(hold.action).toBe("approvalHold");
    const release = applyTurnEvent(hold.turn, { type: "status", state: "working", at: 1200, hookSessionId: "s1", projectPath: "/proj" });
    expect(release.action).toBe("approvalRelease");
    const end = applyTurnEvent(release.turn, { type: "status", state: "stopped", at: 1300, hookSessionId: "s1", projectPath: "/proj" });
    expect(end.action).toBe("finalize");
  });

  it("finalizes on turnEnd after working", () => {
    const { finalized } = run(newTurn(), [
      { type: "ptyData", at: 1100, ptyId: "pty-1" },
      { type: "turnEnd", at: 1400, hookSessionId: "s1", projectPath: "/proj" },
    ]);
    expect(finalized).toBe(true);
  });

  it("conservative silence fallback needs working + two ticks past threshold", () => {
    const base = newTurn(1000);
    const afterData = applyTurnEvent(base, { type: "ptyData", at: 1100, ptyId: "pty-1" }).turn;
    const t1 = applyTurnEvent(afterData, { type: "silence", at: 1000 + SILENCE_FALLBACK_MS + 1 });
    expect(t1.action).toBe("none");
    expect(t1.turn.state).toBe("settling");
    const t2 = applyTurnEvent(t1.turn, { type: "silence", at: 1000 + SILENCE_FALLBACK_MS + 200 });
    expect(t2.action).toBe("finalize");
  });

  it("silence does nothing before working was seen", () => {
    const res = applyTurnEvent(newTurn(1000), { type: "silence", at: 1000 + SILENCE_FALLBACK_MS + 5000 });
    expect(res.action).toBe("none");
  });

  it("ptyExit and stop finalize immediately", () => {
    expect(applyTurnEvent(newTurn(), { type: "ptyExit", ptyId: "pty-1" }).action).toBe("finalize");
    expect(applyTurnEvent(newTurn(), { type: "stop" }).action).toBe("finalize");
  });

  it("is idempotent once done", () => {
    const done = applyTurnEvent(newTurn(), { type: "stop" }).turn;
    expect(applyTurnEvent(done, { type: "status", state: "working", at: 9999, hookSessionId: "s1", projectPath: "/proj" }).action).toBe("none");
  });
});
