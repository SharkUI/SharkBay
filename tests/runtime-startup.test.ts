import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationRuntime } from "../src/runtime/application-runtime.js";

// Exercise only the real startup coordinator method. No ApplicationRuntime or
// service constructor is called; all I/O and collaborators are inert fixtures.
const state = vi.hoisted(() => ({
  config: { disabledPluginIds: [], telegram: { enabled: true } },
  init: vi.fn(), agentsStart: vi.fn(), release: vi.fn(), milestones: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/main/config.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/main/config.js")>(),
  loadRuntimeConfig: async () => state.config,
}));
vi.mock("../src/runtime/profile-lock.js", () => ({ acquireProfileLock: async () => state.release }));
vi.mock("../src/main/token-usage-db.js", () => ({ TokenUsageDb: class {} }));
vi.mock("../src/main/token-usage-collector.js", () => ({ TokenUsageCollector: class { backfill = vi.fn(); } }));
vi.mock("../src/runtime/agent-runtime.js", () => ({ createAgentRuntime: () => ({
  start: state.agentsStart, agentSessionWatcher: { setUsageCollector: vi.fn() },
}) }));
vi.mock("../src/runtime/telegram-runtime.js", () => ({ createRuntimeTelegram: () => ({ init: state.init }) }));
vi.mock("../src/main/startup-timing.js", () => ({ createStartupTimer: () => state.milestones }));

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  state.config.telegram.enabled = true;
  state.agentsStart.mockResolvedValue(undefined);
  state.init.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function coordinator() {
  return Object.assign(Object.create(ApplicationRuntime.prototype), {
    paths: { userDataPath: "/fixture/startup", configPath: "/fixture/config.json" },
    core: { applyDisabledPlugins: vi.fn().mockResolvedValue(undefined) },
    backfillCancellation: new AbortController(),
    // Error paths must not reach the real cleanup coordinator either.
    dispose: vi.fn().mockResolvedValue(undefined),
  }) as ApplicationRuntime;
}

describe("isolated runtime startup coordinator", () => {
  it("becomes ready while optional Telegram initialization remains pending", async () => {
    let finish!: () => void;
    state.init.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const runtime = coordinator();
    let ready = false;
    const starting = runtime.start().then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toBe(true);
    expect(state.agentsStart).toHaveBeenCalledOnce();
    expect(state.init).toHaveBeenCalledOnce();
    expect(state.agentsStart.mock.invocationCallOrder[0]).toBeLessThan(state.init.mock.invocationCallOrder[0]!);
    expect(state.milestones).toHaveBeenCalledWith("core-ready");
    expect(state.milestones).not.toHaveBeenCalledWith("telegram-init-finished");
    finish(); await starting; await vi.advanceTimersByTimeAsync(0);
    expect(state.milestones).toHaveBeenCalledWith("telegram-init-finished");
  });

  it("contains optional initialization rejection without failing core startup or logging secrets", async () => {
    state.init.mockRejectedValue(new Error("secret fixture should not appear"));
    const runtime = coordinator();
    await expect(runtime.start()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.milestones).toHaveBeenCalledWith("telegram-init-failed");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Telegram initialization failed");
    expect(runtime.dispose).not.toHaveBeenCalled();
  });

  it("starts agents before Telegram and does not initialize a disabled integration", async () => {
    state.config.telegram.enabled = false;
    await coordinator().start();
    expect(state.agentsStart).toHaveBeenCalledOnce();
    expect(state.init).not.toHaveBeenCalled();
  });
});
