/**
 * Turn boundary state machine (spec §7).
 *
 * Each `/say`-equivalent prompt opens a Turn. The machine decides when to finalize
 * (delete progress message + send clean result). It guards against the review's
 * Major risk: only events that belong to THIS turn (matching project/hookSession/pty
 * and at/after the prompt) count, and finalize is only allowed once the turn has
 * actually been observed entering `working` — so a stale `stopped`, a delayed hook
 * event, or another PTY's output for the same hook session cannot finalize early.
 *
 * Pure: only explicit status and PTY lifecycle events may finish a turn.
 */

import type { SessionState } from "./types.js";

export type TurnState = "awaiting" | "working" | "done";

export type TurnKey = {
  hookSessionId: string;
  projectPath: string;
  ptyId: string;
};

export type Turn = TurnKey & {
  turnId: string;
  startedAt: number;
  sawWorking: boolean;
  approvalHeld: boolean;
  state: TurnState;
};

export type TurnEvent =
  | { type: "status"; state: SessionState; at: number; hookSessionId: string; projectPath: string }
  | { type: "ptyData"; at: number; ptyId: string }
  | { type: "ptyExit"; ptyId: string }
  | { type: "stop" };

/** Result of applying an event. `finalize` means: delete progress + send result. */
export type TurnResult = {
  turn: Turn;
  action: "none" | "finalize" | "approvalHold" | "approvalRelease";
};

export function createTurn(input: TurnKey & { turnId: string; startedAt: number }): Turn {
  return {
    turnId: input.turnId,
    hookSessionId: input.hookSessionId,
    projectPath: input.projectPath,
    ptyId: input.ptyId,
    startedAt: input.startedAt,
    sawWorking: false,
    approvalHeld: false,
    state: "awaiting",
  };
}

function matchesSession(turn: Turn, e: { hookSessionId: string }): boolean {
  // Match on the globally-unique hook session id only. projectPath (the hook cwd)
  // is fragile across macOS realpath/symlink/'/private' differences and must not
  // gate finalization.
  return e.hookSessionId === turn.hookSessionId;
}

export function applyTurnEvent(turn: Turn, event: TurnEvent): TurnResult {
  if (turn.state === "done") return { turn, action: "none" };

  switch (event.type) {
    case "stop":
    case "ptyExit": {
      if (event.type === "ptyExit" && event.ptyId !== turn.ptyId) return { turn, action: "none" };
      return finalize(turn);
    }

    case "ptyData": {
      if (event.ptyId !== turn.ptyId || event.at < turn.startedAt) return { turn, action: "none" };
      // Any output for this turn's PTY means the agent is producing the response.
      const next = { ...turn, sawWorking: true } as Turn;
      if (next.state === "awaiting") next.state = "working";
      return { turn: next, action: "none" };
    }

    case "status": {
      if (!matchesSession(turn, event) || event.at < turn.startedAt) return { turn, action: "none" };
      if (event.state === "approval" || event.state === "waiting" || event.state === "blocked") {
        if (turn.approvalHeld) return { turn, action: "none" };
        return { turn: { ...turn, approvalHeld: true, sawWorking: true, state: "working" }, action: "approvalHold" };
      }
      if (event.state === "working" || event.state === "monitoring") {
        const released = turn.approvalHeld;
        const next = { ...turn, sawWorking: true, approvalHeld: false, state: "working" } as Turn;
        return { turn: next, action: released ? "approvalRelease" : "none" };
      }
      // stopped: only finalize if we have actually seen this turn working.
      if ((["done", "failed", "interrupted"].includes(event.state) || event.state === "stopped" && !turn.approvalHeld) && turn.sawWorking) return finalize(turn);
      return { turn, action: "none" };
    }


  }
}

function finalize(turn: Turn): TurnResult {
  return { turn: { ...turn, state: "done" }, action: "finalize" };
}
