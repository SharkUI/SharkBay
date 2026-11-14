import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionAuth } from "../src/server/session-auth.js";
import { validateApplicationInput } from "../src/runtime/application-input.js";
import { acquireProfileLock } from "../src/runtime/profile-lock.js";

afterEach(() => { vi.useRealTimers(); });
describe("browser connection authorization", () => {
  it("exchanges once, expires grants and sessions, and revokes pending access", () => {
    vi.useFakeTimers();
    const auth = new SessionAuth();
    const grant = auth.issueGrant();
    const session = auth.exchange(grant, "local");
    expect(auth.authenticate(`other=1; sharkbay_session=${session}`)).toBe(session);
    expect(() => auth.exchange(grant, "local")).toThrow(/expired|already used/);
    const expired = auth.issueGrant();
    vi.advanceTimersByTime(300001);
    expect(() => auth.exchange(expired, "local")).toThrow(/expired/);
    vi.advanceTimersByTime(8 * 3600000);
    expect(() => auth.authenticate(`sharkbay_session=${session}`)).toThrow(/fresh connection/);
    const next = auth.exchange(auth.issueGrant(), "local");
    const pending = auth.issueGrant();
    auth.revokeAll();
    expect(() => auth.authenticate(`sharkbay_session=${next}`)).toThrow();
    expect(() => auth.exchange(pending, "local")).toThrow();
  });
  it("rate limits grant guessing", () => {
    const auth = new SessionAuth();
    for (let index = 0; index < 10; index++) expect(() => auth.exchange("guess", "local")).toThrow();
    expect(() => auth.exchange(auth.issueGrant(), "local")).toThrow(/Too many/);
  });
});
describe("application boundary", () => {
  it.each(["constructor", "toString", "cancelAllCodeGraphJobs", "terminal.inspect"])("rejects internal or unregistered method %s", (method) => {
    expect(() => validateApplicationInput(method, {})).toThrow(/Unsupported/);
  });
  it("rejects host path injection and malformed terminal inputs", () => {
    expect(() => validateApplicationInput("terminal.create", { cwdUri: "local:/repo", userDataPath: "/tmp/other" })).toThrow(/Unexpected field/);
    expect(() => validateApplicationInput("terminal.create", { cwdUri: "local:/repo", service: { id: "x", label: "x", command: "echo", configPath: "/tmp/other" } })).toThrow(/Invalid service/);
    expect(() => validateApplicationInput("terminal.resize", { sessionId: "x", cols: 1000000, rows: 24 })).toThrow(/Invalid cols/);
    expect(() => validateApplicationInput("terminal.input", { sessionId: "x", data: "x".repeat(65537) })).toThrow(/Invalid data/);
    expect(() => validateApplicationInput("terminal.input", [])).toThrow();
  });
});
describe("profile ownership", () => {
  it("rejects both identical data directories and shared config, including aliases", async () => {
    const directory = await realpath(await mkdtemp(path.join(tmpdir(), "sharkbay-lock-")));
    const paths = { userDataPath: path.join(directory, "data"), configPath: path.join(directory, "config.json") };
    await writeFile(paths.configPath, "{}");
    const release = await acquireProfileLock(paths);
    try {
      await expect(acquireProfileLock(paths)).rejects.toThrow(/already held/);
      await mkdir(path.join(directory, "alias-parent"));
      await symlink(directory, path.join(directory, "alias-parent", "alias"));
      await expect(acquireProfileLock({ userDataPath: path.join(directory, "other"), configPath: path.join(directory, "alias-parent", "alias", "config.json") })).rejects.toThrow(/already held/);
      await symlink(paths.configPath, path.join(directory, "config-alias.json"));
      await expect(acquireProfileLock({ userDataPath: path.join(directory, "another"), configPath: path.join(directory, "config-alias.json") })).rejects.toThrow(/already held/);
    } finally { await release(); }
    const retry = await acquireProfileLock(paths);
    await retry();
    await rm(directory, { recursive: true, force: true });
  });
});
