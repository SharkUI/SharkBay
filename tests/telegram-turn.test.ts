import { describe, expect, it } from "vitest";

import { applyTurnEvent, createTurn, type Turn, type TurnEvent } from "../src/main/telegram/turn.js";

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

  it("ignores events for a different hook session", () => {
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

  it.each(["done", "failed", "interrupted"] as const)("finishes on explicit %s even while a previous request was waiting", (state) => {
    const held = applyTurnEvent(newTurn(), { type: "status", state: "waiting", at: 1100, hookSessionId: "s1", projectPath: "/proj" }).turn;
    expect(applyTurnEvent(held, { type: "status", state, at: 1200, hookSessionId: "s1", projectPath: "/proj" }).action).toBe("finalize");
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
