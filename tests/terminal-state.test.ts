import { EventEmitter } from "node:events";
import Xterm from "@xterm/headless";
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
  it.each(["\x1b[43mSTALE", "\x1b[48;2;255;", "\x1b]11;rgb:"])("replaces queued color and parser state when replaying a snapshot after %j", async (pending) => {
    const { state, core } = fixture();
    const observer = new Xterm.Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    try {
      core.emit("terminalData", { sessionId: "terminal", data: "DEFAULT\x1b[41mRED\x1b[0m", stream: "stdout" });
      let snapshot!: TerminalFrame;
      await state.attach("terminal", (frame) => { snapshot = frame; });
      observer.write(pending);
      // Attach/resize snapshots can arrive before the previous write has parsed.
      observer.write(snapshot.data);
      observer.write(snapshot.data);
      await new Promise<void>((done) => observer.write("NEXT", done));
      const line = observer.buffer.active.getLine(0)!;
      expect(line.translateToString(true)).toBe("DEFAULTREDNEXT");
      expect(line.getCell(0)!.isBgDefault()).toBe(true);
      expect(line.getCell(7)!.getBgColor()).toBe(1);
      expect(line.getCell(10)!.isBgDefault()).toBe(true);
    } finally { observer.dispose(); await state.dispose(); }
  });

  it("restores alternate-screen truecolor across takeover and resize snapshots", async () => {
    const { state, core, frames } = fixture();
    const observer = new Xterm.Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    try {
      core.emit("terminalData", { sessionId: "terminal", data: "\x1b[?1049h\x1b[48;2;12;34;56mRGB\x1b[0m", stream: "stdout" });
      for (const [owner, cols, rows] of [["desktop", 100, 30], ["web", 60, 20]] as const) {
        state.claim("terminal", owner);
        await state.resize("terminal", owner, cols, rows);
        const snapshot = frames.at(-1)!;
        observer.write("\x1b[43mSTALE");
        observer.resize(snapshot.cols!, snapshot.rows!);
        await new Promise<void>((done) => observer.write(snapshot.data, done));
        expect(observer.buffer.active.type).toBe("alternate");
        expect(observer.buffer.active.getLine(0)!.translateToString(true)).toBe("RGB");
        expect(observer.buffer.active.getLine(0)!.getCell(0)!.getBgColor()).toBe(0x0c2238);
      }
      await new Promise<void>((done) => observer.write("NEXT", done));
      expect(observer.buffer.active.getLine(0)!.getCell(3)!.isBgDefault()).toBe(true);
    } finally { observer.dispose(); await state.dispose(); }
  });

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
