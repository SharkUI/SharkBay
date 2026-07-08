import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentSessionWatcherPollInterval, prependPathDirectories, resolveCommandPath, resolveCommandSearchPaths, shouldRefreshDiscovery } from "../src/main/agent-clis.js";

describe("agent cli discovery", () => {
  it("finds executables in fallback directories when they are absent from PATH", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-agent-clis-"));
    const home = path.join(root, "home");
    const bin = path.join(home, ".local", "bin");
    const command = `sharkbay-fallback-${process.pid}-${Date.now()}`;
    const executable = path.join(bin, command);
    await fs.mkdir(bin, { recursive: true });
    await fs.writeFile(executable, "#!/bin/sh\n");
    await fs.chmod(executable, 0o755);

    await expect(resolveCommandPath(command, [".local/bin"], home)).resolves.toBe(executable);
  });

  it("finds executables installed into nvm versioned node bins", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-agent-clis-"));
    const home = path.join(root, "home");
    const bin = path.join(home, ".nvm", "versions", "node", "v22.22.1", "bin");
    const command = `sharkbay-nvm-${process.pid}-${Date.now()}`;
    const executable = path.join(bin, command);
    await fs.mkdir(bin, { recursive: true });
    await fs.writeFile(executable, "#!/bin/sh\n");
    await fs.chmod(executable, 0o755);

    await expect(resolveCommandPath(command, [], home)).resolves.toBe(executable);
  });

  it("includes nvm versioned node bins in command search paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-agent-clis-"));
    const home = path.join(root, "home");
    const bin = path.join(home, ".nvm", "versions", "node", "v22.22.1", "bin");
    await fs.mkdir(bin, { recursive: true });

    await expect(resolveCommandSearchPaths(home, [])).resolves.toContain(bin);
  });

  it("prepends command search paths without duplicating existing PATH entries", () => {
    expect(prependPathDirectories(`/usr/bin${path.delimiter}/opt/bin`, ["/opt/bin", "/nvm/bin"])).toBe(
      `/opt/bin${path.delimiter}/nvm/bin${path.delimiter}/usr/bin`
    );
  });

  it("ignores invalid command names", async () => {
    await expect(resolveCommandPath("bad command", ["/usr/local/bin"])).resolves.toBeNull();
  });

  it("refreshes transcript discovery only after the interval, but always on a cold cache", () => {
    // Cold cache: always discover, regardless of timing.
    expect(shouldRefreshDiscovery(0, 0, 5000, false)).toBe(true);
    expect(shouldRefreshDiscovery(1000, 1100, 5000, false)).toBe(true);
    // Warm cache, within interval: reuse.
    expect(shouldRefreshDiscovery(1000, 4000, 5000, true)).toBe(false);
    // Warm cache, interval elapsed: re-discover.
    expect(shouldRefreshDiscovery(1000, 6000, 5000, true)).toBe(true);
    expect(shouldRefreshDiscovery(1000, 6001, 5000, true)).toBe(true);
  });

  it("uses fast session polling only shortly after transcript activity", () => {
    expect(agentSessionWatcherPollInterval({
      lastActivityAt: null,
      now: 10_000,
      activePollGraceMs: 15_000,
      activeIntervalMs: 1_000,
      idleIntervalMs: 5_000,
    })).toBe(5_000);
    expect(agentSessionWatcherPollInterval({
      lastActivityAt: 10_000,
      now: 20_000,
      activePollGraceMs: 15_000,
      activeIntervalMs: 1_000,
      idleIntervalMs: 5_000,
    })).toBe(1_000);
    expect(agentSessionWatcherPollInterval({
      lastActivityAt: 10_000,
      now: 25_000,
      activePollGraceMs: 15_000,
      activeIntervalMs: 1_000,
      idleIntervalMs: 5_000,
    })).toBe(5_000);
  });
});
