import { describe, expect, it, vi } from "vitest";
import { createCoreRuntime } from "../src/core/core-runtime.js";
import type { TerminalSession } from "../src/shared/types.js";

describe("Core lifecycle", () => {
  it("disposes once and waits for active terminal exit", async () => {
    const core = createCoreRuntime();
    const cancel = vi.spyOn(core, "cancelAllCodeGraphJobs").mockResolvedValue();
    vi.spyOn(core, "listTerminalSessions").mockReturnValue([{ id: "active", status: "running" } as TerminalSession]);
    const close = vi.spyOn(core, "closeAllTerminalSessions").mockImplementation(() => {
      queueMicrotask(() => core.emit("terminalExit", { sessionId: "active", exitCode: 0, signal: null }));
    });
    const stopping = core.dispose();
    expect(core.dispose()).toBe(stopping);
    await stopping;
    expect(cancel).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    expect(core.listenerCount("terminalExit")).toBe(0);
  });
  it("still closes terminals when cancelling background jobs fails", async () => {
    const core = createCoreRuntime();
    vi.spyOn(core, "cancelAllCodeGraphJobs").mockRejectedValue(new Error("cancel failed"));
    const close = vi.spyOn(core, "closeAllTerminalSessions");
    await expect(core.dispose()).rejects.toThrow("cancel failed");
    expect(close).toHaveBeenCalledOnce();
  });
});
