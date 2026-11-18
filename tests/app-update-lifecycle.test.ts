import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipcChannels } from "../src/shared/ipc-channels.js";

const originalResourcesPath = process.resourcesPath;

const mocks = vi.hoisted(() => ({
  app: null as any,
  updater: null as any,
  windows: [] as any[],
  handlers: new Map<string, (...args: any[]) => any>(),
  disconnectRuntime: vi.fn(),
  ensureRuntime: vi.fn(),
  startup: vi.fn(),
}));

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), {
      mainFrame: {}, send: vi.fn(), isDestroyed: () => false,
      setWindowOpenHandler: vi.fn(),
    });
    constructor() { super(); mocks.windows.push(this); }
    isDestroyed() { return false; }
    isMinimized() { return false; }
    show = vi.fn();
    focus() {}
    hide() {}
    destroy() {}
    setVisibleOnAllWorkspaces() {}
    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    loadFile = vi.fn().mockResolvedValue(undefined);
    loadURL = vi.fn().mockResolvedValue(undefined);
  }
  return {
    get app() { return mocks.app; }, BrowserWindow: Window,
    ipcMain: { on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), handle: (channel: string, handler: (...args: any[]) => any) => mocks.handlers.set(channel, handler) },
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    screen: { getPrimaryDisplay: () => ({ size: { width: 1500 }, workArea: { y: 30 }, bounds: { y: 0, x: 0 } }) },
    shell: { openExternal: vi.fn() }, dialog: { showErrorBox: vi.fn() },
  };
});
vi.mock("../src/main/startup-timing.js", () => ({ createStartupTimer: () => mocks.startup }));
vi.mock("electron-updater", () => ({ default: { get autoUpdater() { return mocks.updater; } } }));
vi.mock("../electron/ipc.js", () => ({
  openRuntimeInBrowser: vi.fn(), registerIpcHandlers: async () => {}, shouldAllowBrowserCertificateError: () => false,
  disconnectRuntime: mocks.disconnectRuntime,
}));
vi.mock("../electron/runtime-client.js", () => ({ ensureRuntime: mocks.ensureRuntime }));
vi.mock("../src/main/config.js", () => ({
  getRuntimeConfigPath: () => "/tmp/sharkbay-update-test.json",
  loadAppConfig: async () => ({ appearanceTheme: "day" }),
}));

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  Object.defineProperty(process, "resourcesPath", { configurable: true, value: "/tmp/sharkbay-update-test/Resources" });
  // The real entry registers signal handlers; keep them out of the test process.
  vi.spyOn(process, "once").mockReturnValue(process);
  mocks.windows = [];
  mocks.handlers.clear();
  mocks.disconnectRuntime.mockReset();
  mocks.ensureRuntime.mockReset().mockResolvedValue({ call: async () => ({ appearanceTheme: "day" }) });
  mocks.startup.mockClear();
  mocks.app = Object.assign(new EventEmitter(), {
    isPackaged: true, setName: vi.fn(), setPath: vi.fn(), requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(),
    getPath: () => "/tmp/sharkbay-update-test", getLocale: () => "en", getAppPath: () => "/app",
    quit: vi.fn(), dock: { setBadge: vi.fn() },
  });
  mocks.updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn().mockResolvedValue(null), quitAndInstall: vi.fn(),
  });
  await import("../electron/main.js");
  await vi.dynamicImportSettled();
});

afterEach(() => {
  Object.defineProperty(process, "resourcesPath", { configurable: true, value: originalResourcesPath });
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

function mainSender() {
  const sender = mocks.windows[0].webContents;
  return { sender, senderFrame: sender.mainFrame };
}

describe("update installation and app exit", () => {
  it("checks automatically but only quits after an explicit ready-update request", () => {
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledOnce();
    mocks.handlers.get(ipcChannels.appUpdateInstall)!(mainSender());
    expect(mocks.app.quit).not.toHaveBeenCalled();
    mocks.updater.emit("update-downloaded", { version: "0.3.3" });
    expect(mocks.app.quit).not.toHaveBeenCalled();
    mocks.handlers.get(ipcChannels.appUpdateInstall)!(mainSender());
    expect(mocks.app.quit).toHaveBeenCalledOnce();
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("waits for desktop cleanup before installing and ignores repeated quit events", async () => {
    let finish!: () => void;
    mocks.disconnectRuntime.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    mocks.updater.emit("update-downloaded", { version: "0.3.3" });
    mocks.handlers.get(ipcChannels.appUpdateInstall)!(mainSender());
    const event = { preventDefault: vi.fn() };
    mocks.app.emit("before-quit", event);
    mocks.app.emit("before-quit", event);
    expect(mocks.disconnectRuntime).toHaveBeenCalledOnce();
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.updater.quitAndInstall).toHaveBeenCalledOnce();
    const finalQuit = { preventDefault: vi.fn() };
    mocks.app.emit("before-quit", finalQuit);
    expect(finalQuit.preventDefault).not.toHaveBeenCalled();
  });

  it("preserves normal quit and bounds cleanup time", async () => {
    mocks.disconnectRuntime.mockReturnValue(new Promise(() => {}));
    mocks.app.emit("before-quit", { preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(4000);
    expect(mocks.app.quit).toHaveBeenCalledOnce();
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
    expect(mocks.updater.autoInstallOnAppQuit).toBe(true);
  });

  it("rejects update controls from other windows or subframes", () => {
    const check = mocks.handlers.get(ipcChannels.appUpdateCheck)!;
    expect(() => check({ sender: {}, senderFrame: {} })).toThrow("main window");
    expect(() => check({ ...mainSender(), senderFrame: {} })).toThrow("main window");
  });
});


describe("desktop startup visibility", () => {
  it("shows the first frame immediately without waiting for project-scan contentReady", () => {
    const window = mocks.windows[0];
    window.emit("ready-to-show");
    expect(window.show).toHaveBeenCalledOnce();
  });

  it("creates and shows a loading window while runtime connection is still pending", async () => {
    vi.resetModules();
    mocks.windows = [];
    let connect!: (value: unknown) => void;
    mocks.ensureRuntime.mockReturnValueOnce(new Promise(resolve => { connect = resolve; }));
    await import("../electron/main.js");
    await vi.dynamicImportSettled();
    expect(mocks.windows).toHaveLength(1);
    const window = mocks.windows[0];
    expect(window.loadURL.mock.calls[0][0]).toMatch(/^data:text\/html/);
    expect(window.loadFile).not.toHaveBeenCalled();
    window.emit("ready-to-show");
    expect(window.show).toHaveBeenCalledOnce();
    connect({ call: async () => ({ appearanceTheme: "day" }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.windows[0]).toBe(window);
    expect(window.loadFile).toHaveBeenCalledWith(expect.stringContaining("dist/renderer/index.html"));
    expect(mocks.windows).toHaveLength(2);
  });

  it("does not load the workspace if the user quits while connecting", async () => {
    vi.resetModules(); mocks.windows = []; mocks.app.removeAllListeners();
    mocks.disconnectRuntime.mockResolvedValue(undefined);
    let connect!: (value: unknown) => void;
    mocks.ensureRuntime.mockReturnValueOnce(new Promise(resolve => { connect = resolve; }));
    await import("../electron/main.js"); await vi.dynamicImportSettled();
    mocks.app.emit("before-quit", { preventDefault: vi.fn() });
    const runtime = { call: vi.fn(), dispose: vi.fn() };
    connect(runtime); await vi.advanceTimersByTimeAsync(0);
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(runtime.call).not.toHaveBeenCalled();
    expect(mocks.windows[0].loadFile).not.toHaveBeenCalled();
  });

});
