import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppUpdates } from "../src/main/app-updates.js";

function setup(enabled = true) {
  const client = Object.assign(new EventEmitter(), {
    autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: true, allowDowngrade: true,
    checkForUpdates: vi.fn().mockResolvedValue(null),
    quitAndInstall: vi.fn(),
  });
  const changed = vi.fn();
  const updates = new AppUpdates(client as never, enabled, changed);
  return { client, updates, changed };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("application updates", () => {
  it("only enables stable upgrades and automatic download/install on normal quit", () => {
    const { client } = setup();
    expect(client).toMatchObject({ autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false, allowDowngrade: false });
  });

  it("does not check or install in development", async () => {
    const { client, updates } = setup(false);
    updates.start();
    expect(await updates.check(true)).toEqual({ status: "unsupported", manual: true });
    updates.install();
    expect(client.checkForUpdates).not.toHaveBeenCalled();
    expect(client.quitAndInstall).not.toHaveBeenCalled();
  });

  it("checks at startup and every four hours, and stops polling on exit", async () => {
    vi.useFakeTimers();
    const { client, updates } = setup();
    updates.start();
    updates.start();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(client.checkForUpdates).toHaveBeenCalledTimes(2);
    updates.stop();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(client.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("keeps a single check/download in flight and makes a manual request visible", async () => {
    const { client, updates } = setup();
    let finish!: () => void;
    client.checkForUpdates.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const pending = updates.check();
    expect(await updates.check(true)).toEqual({ status: "checking", manual: true });
    expect(client.checkForUpdates).toHaveBeenCalledOnce();
    client.emit("update-not-available", { version: "0.3.2" });
    finish();
    await pending;
    expect(updates.getState()).toEqual({ status: "up-to-date", manual: true });
  });

  it("reports progress, waits for the download, and never restarts automatically", async () => {
    const { client, updates, changed } = setup();
    let finish!: () => void;
    client.checkForUpdates.mockResolvedValue({ downloadPromise: new Promise<void>((resolve) => { finish = resolve; }) });
    const pending = updates.check();
    client.emit("update-available", { version: "0.3.3" });
    client.emit("download-progress", { percent: 42.7 });
    expect(updates.getState()).toEqual({ status: "downloading", version: "0.3.3", percent: 42 });
    await updates.check(true);
    expect(client.checkForUpdates).toHaveBeenCalledOnce();
    client.emit("update-downloaded", { version: "0.3.3" });
    finish();
    await pending;
    expect(updates.getState()).toEqual({ status: "ready", version: "0.3.3" });
    expect(client.quitAndInstall).not.toHaveBeenCalled();
    changed.mockClear();
    await updates.check(true);
    expect(changed).toHaveBeenCalledWith({ status: "ready", version: "0.3.3" });
    expect(client.checkForUpdates).toHaveBeenCalledOnce();
    updates.install();
    updates.install();
    expect(client.quitAndInstall).toHaveBeenCalledOnce();
    expect(updates.getState()).toEqual({ status: "installing", version: "0.3.3" });
  });

  it("does not install before an update is downloaded", () => {
    const { client, updates } = setup();
    updates.install();
    client.emit("update-available", { version: "0.3.3" });
    updates.install();
    expect(client.quitAndInstall).not.toHaveBeenCalled();
  });

  it("handles a rejected download and retries on the next check", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, updates } = setup();
    client.checkForUpdates.mockImplementation(async () => {
      client.emit("update-available", { version: "0.3.3" });
      client.emit("error", new Error("Network interrupted"));
      return { downloadPromise: Promise.reject(new Error("Network interrupted")) };
    });
    await updates.check();
    expect(updates.getState()).toMatchObject({ status: "error", manual: true });
    client.checkForUpdates.mockImplementation(async () => {
      client.emit("update-not-available", { version: "0.3.2" });
      return null;
    });
    await updates.check(true);
    expect(updates.getState()).toEqual({ status: "up-to-date", manual: true });
  });

  it("keeps background check failures quiet and reports native validation failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, updates } = setup();
    client.checkForUpdates.mockRejectedValue(new Error("Offline"));
    await updates.check();
    expect(updates.getState()).toMatchObject({ status: "error", manual: false });
    client.emit("update-downloaded", { version: "0.3.3" });
    client.emit("error", new Error("Invalid signature"));
    expect(updates.getState()).toMatchObject({ status: "error", manual: true });
    updates.install();
    expect(client.quitAndInstall).not.toHaveBeenCalled();
  });
});
