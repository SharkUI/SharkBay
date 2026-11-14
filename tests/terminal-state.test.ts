import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { TerminalState } from "../src/runtime/terminal-state.js";
import type { CoreRuntime } from "../src/core/core-runtime.js";
import type { TerminalFrame } from "../src/shared/application-api.js";
import type { TerminalSession } from "../src/shared/types.js";
function fixture() {
  const session = { id: "terminal", status: "running", cols: 80, rows: 24 } as TerminalSession;
  const core = Object.assign(new EventEmitter(), { inputTerminal: vi.fn(), resizeTerminal: vi.fn(() => session) }) as unknown as CoreRuntime;
  const frames: TerminalFrame[] = [];
  const state = new TerminalState(core, (name, payload) => { if (name === "terminal:data") frames.push(payload as TerminalFrame); });
  core.emit("terminalUpdate", { session, reason: "created" });
  return { state, core, frames, session };
}
describe("terminal screen lifecycle", () => {
  it("recovers its output queue after an attach callback fails", async () => {
    const { state, core, frames } = fixture();
    try {
      await expect(state.attach("terminal", () => { throw new Error("connection closed"); })).rejects.toThrow("connection closed");
      core.emit("terminalData", { sessionId: "terminal", data: "恢复成功", stream: "stdout" });
      await state.attach("terminal", (frame) => frames.push(frame));
      expect(frames.at(-1)!.data).toContain("恢复成功"); expect(frames.at(-1)!.reset).toBe(true);
    } finally { await state.dispose(); }
  });
  it("rejects a stale queued resize after takeover and accepts the new owner's resize", async () => {
    const { state, core, frames } = fixture();
    try {
      state.claim("terminal", "old");
      const resize = state.resize("terminal", "old", 100, 30);
      state.claim("terminal", "new");
      await expect(resize).rejects.toThrow(/controlled by another/);
      expect(core.resizeTerminal).not.toHaveBeenCalled();
      await state.resize("terminal", "new", 60, 20);
      expect(frames.at(-1)).toMatchObject({ reset: true, cols: 60, rows: 20 });
    } finally { await state.dispose(); }
  });
  it("does not resurrect closed screens and releases listeners on disposal", async () => {
    const { state, core, session } = fixture();
    core.emit("terminalUpdate", { session, reason: "closed" });
    core.emit("terminalData", { sessionId: "terminal", data: "late output", stream: "stdout" });
    expect(() => state.attach("terminal", () => {})).toThrow(/no longer exists/);
    await state.dispose(); expect(core.listenerCount("terminalData")).toBe(0); expect(core.listenerCount("terminalUpdate")).toBe(0);
  });
});
