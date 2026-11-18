import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCodeGraphCommandEnv, CodeGraphManager, ensureGitExcludeEntry, removeGitExcludeEntry, runCodeGraphCommandInGroup } from "../src/core/codegraph-manager.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";

let fixture: string;
beforeEach(async () => { fixture = await fs.mkdtemp(path.join(tmpdir(), "sharkbay-codegraph-regression-")); });
afterEach(async () => { await fs.rm(fixture, { recursive: true, force: true }); });

describe("CodeGraphManager", () => {
  it("prepends the resolved CLI directory to PATH for npm shims", () => {
    const env = buildCodeGraphCommandEnv("/Users/shark/.nvm/versions/node/v24.14.1/bin/codegraph", {
      PATH: "/usr/bin:/bin",
    });

    expect(env.PATH?.split(":").slice(0, 3)).toEqual([
      "/Users/shark/.nvm/versions/node/v24.14.1/bin",
      "/usr/bin",
      "/bin",
    ]);
  });

  it("reads status without initializing an enabled local project", async () => {
    const calls: string[][] = [];
    const manager = new CodeGraphManager(
      async () => "/usr/local/bin/codegraph",
      async (_command, args) => {
        calls.push(args);
        return { stdout: JSON.stringify({ initialized: false }), stderr: "" };
      },
    );

    const result = await manager.readProjectStatus(toLocalProjectUri(path.join(fixture, "project")), true);

    expect(result.state).toBe("uninitialized");
    expect(result.summary).toBe("CodeGraph not initialized");
    expect(calls.map((args) => args[0])).toEqual(["status"]);
  });

  it("initializes and syncs an enabled local project when ensuring status", async () => {
    let initialized = false;
    let synced = false;
    const calls: string[][] = [];
    const manager = new CodeGraphManager(
      async () => "/usr/local/bin/codegraph",
      async (_command, args) => {
        calls.push(args);
        if (args[0] === "status") {
          return {
            stdout: JSON.stringify({
              initialized,
              fileCount: initialized ? 2 : 0,
              nodeCount: initialized ? 12 : 0,
              edgeCount: initialized ? 18 : 0,
              pendingChanges: initialized && !synced ? { added: 0, modified: 1, removed: 0 } : { added: 0, modified: 0, removed: 0 },
            }),
            stderr: "",
          };
        }
        if (args[0] === "init") {
          initialized = true;
          return { stdout: "", stderr: "" };
        }
        if (args[0] === "sync") {
          synced = true;
          return { stdout: "", stderr: "" };
        }
        throw new Error(`Unexpected command: ${args.join(" ")}`);
      },
    );

    const result = await manager.ensureProjectStatus(toLocalProjectUri(path.join(fixture, "project")), true);

    expect(result.state).toBe("indexed");
    expect(result.stats).toMatchObject({ files: 2, nodes: 12, edges: 18 });
    expect(calls.map((args) => args[0])).toEqual(["status", "init", "status", "sync", "status"]);
  });

  it("reports not installed without running project commands", async () => {
    const manager = new CodeGraphManager(
      async () => null,
      async () => {
        throw new Error("Should not run CodeGraph without a CLI path");
      },
    );

    const result = await manager.readProjectStatus(toLocalProjectUri(path.join(fixture, "project")), true);

    expect(result.state).toBe("not-installed");
    expect(result.summary).toBe("CodeGraph CLI not installed");
  });

  it("passes an abort signal into init/sync commands and tracks active jobs", async () => {
    const seenSignals: Array<AbortSignal | undefined> = [];
    let resolveInit: () => void = () => {};
    const manager = new CodeGraphManager(
      async () => "/usr/local/bin/codegraph",
      async (_command, args, options) => {
        if (args[0] === "status") {
          return { stdout: JSON.stringify({ initialized: false }), stderr: "" };
        }
        if (args[0] === "init") {
          seenSignals.push(options.signal);
          // Block until the test releases it, so the job stays "active".
          await new Promise<void>((resolve) => { resolveInit = resolve; });
          return { stdout: "", stderr: "" };
        }
        return { stdout: JSON.stringify({ initialized: true, fileCount: 1, nodeCount: 1, edgeCount: 1 }), stderr: "" };
      },
    );

    const uri = toLocalProjectUri(path.join(fixture, "cancel"));
    const pending = manager.ensureProjectStatus(uri, true);
    await vi.waitFor(() => expect(seenSignals).toHaveLength(1));

    expect(manager.hasActiveJobs()).toBe(true);
    expect(seenSignals[0]).toBeInstanceOf(AbortSignal);

    resolveInit();
    await pending;
    expect(manager.hasActiveJobs()).toBe(false);
  });

  it("cancelling an in-flight ensure aborts its signal and returns a cancelled status", async () => {
    let abortedDuringInit = false;
    const manager = new CodeGraphManager(
      async () => "/usr/local/bin/codegraph",
      async (_command, args, options) => {
        if (args[0] === "status") {
          return { stdout: JSON.stringify({ initialized: false }), stderr: "" };
        }
        if (args[0] === "init") {
          return await new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => {
              abortedDuringInit = true;
              reject(new Error("CodeGraph command cancelled"));
            });
          });
        }
        return { stdout: JSON.stringify({ initialized: true }), stderr: "" };
      },
    );

    const uri = toLocalProjectUri(path.join(fixture, "cancel-2"));
    const pending = manager.ensureProjectStatus(uri, true);
    await new Promise((resolve) => setTimeout(resolve, 10));

    manager.cancelProject(uri);
    const result = await pending;

    expect(abortedDuringInit).toBe(true);
    expect(result.state).toBe("uninitialized");
    expect(result.summary).toBe("CodeGraph indexing cancelled");
    expect(manager.hasActiveJobs()).toBe(false);
  });

  it("cancelAll aborts every active maintenance job", async () => {
    const manager = new CodeGraphManager(
      async () => "/usr/local/bin/codegraph",
      async (_command, args, options) => {
        if (args[0] === "status") {
          return { stdout: JSON.stringify({ initialized: false }), stderr: "" };
        }
        return await new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new Error("CodeGraph command cancelled")));
        });
      },
    );

    const a = manager.ensureProjectStatus(toLocalProjectUri(path.join(fixture, "a")), true);
    const b = manager.ensureProjectStatus(toLocalProjectUri(path.join(fixture, "b")), true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(manager.hasActiveJobs()).toBe(true);

    manager.cancelAll();
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.summary).toBe("CodeGraph indexing cancelled");
    expect(rb.summary).toBe("CodeGraph indexing cancelled");
    expect(manager.hasActiveJobs()).toBe(false);
  });
});

describe("runCodeGraphCommandInGroup", () => {
  it("captures stdout from a real detached process", async () => {
    const result = await runCodeGraphCommandInGroup("/bin/sh", ["-c", "printf hello"], { cwd: process.cwd(), timeout: 5_000 });
    expect(result.stdout).toBe("hello");
  });

  it("terminates the process group when the abort signal fires", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const pending = runCodeGraphCommandInGroup("/bin/sh", ["-c", "sleep 30"], { cwd: process.cwd(), timeout: 60_000, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow(/cancelled|aborted/i);
    // Should reject promptly on abort, well under the 30s sleep.
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("rejects with a timeout error and kills the process when the timeout elapses", async () => {
    const started = Date.now();
    const pending = runCodeGraphCommandInGroup("/bin/sh", ["-c", "sleep 30"], { cwd: process.cwd(), timeout: 50 });
    await expect(pending).rejects.toThrow(/timed out/i);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe("ensureGitExcludeEntry", () => {
  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "sharkbay-test-"));
    await fs.mkdir(path.join(dir, ".git", "info"), { recursive: true });
    return dir;
  }

  it("creates exclude file with the entry when file does not exist", async () => {
    const dir = await makeTmpDir();
    await fs.rm(path.join(dir, ".git", "info", "exclude"), { force: true });
    await ensureGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe(".codegraph\n");
    await fs.rm(dir, { recursive: true });
  });

  it("appends entry to existing exclude file", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, ".git", "info", "exclude"), "node_modules\n");
    await ensureGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe("node_modules\n.codegraph\n");
    await fs.rm(dir, { recursive: true });
  });

  it("does not duplicate entry if already present", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, ".git", "info", "exclude"), "node_modules\n.codegraph\n");
    await ensureGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe("node_modules\n.codegraph\n");
    await fs.rm(dir, { recursive: true });
  });

  it("recognizes entry with trailing slash as already present", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, ".git", "info", "exclude"), ".codegraph/\n");
    await ensureGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe(".codegraph/\n");
    await fs.rm(dir, { recursive: true });
  });

  it("handles file without trailing newline", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, ".git", "info", "exclude"), "node_modules");
    await ensureGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe("node_modules\n.codegraph\n");
    await fs.rm(dir, { recursive: true });
  });

  it("creates .git/info directory if missing", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "sharkbay-test-"));
    await ensureGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe(".codegraph\n");
    await fs.rm(dir, { recursive: true });
  });
});

describe("removeGitExcludeEntry", () => {
  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "sharkbay-test-"));
    await fs.mkdir(path.join(dir, ".git", "info"), { recursive: true });
    return dir;
  }

  it("removes the entry from exclude file", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, ".git", "info", "exclude"), "node_modules\n.codegraph\n");
    await removeGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe("node_modules\n");
    await fs.rm(dir, { recursive: true });
  });

  it("removes entry with trailing slash", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, ".git", "info", "exclude"), "node_modules\n.codegraph/\n");
    await removeGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe("node_modules\n");
    await fs.rm(dir, { recursive: true });
  });

  it("does nothing when entry is not present", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, ".git", "info", "exclude"), "node_modules\n");
    await removeGitExcludeEntry(dir, ".codegraph");
    const content = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf-8");
    expect(content).toBe("node_modules\n");
    await fs.rm(dir, { recursive: true });
  });

  it("does nothing when exclude file does not exist", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "sharkbay-test-"));
    await removeGitExcludeEntry(dir, ".codegraph");
    const exists = await fs.access(path.join(dir, ".git", "info", "exclude")).then(() => true).catch(() => false);
    expect(exists).toBe(false);
    await fs.rm(dir, { recursive: true });
  });
});

it("rejects commands terminated by a signal", async () => {
  await expect(runCodeGraphCommandInGroup(process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"], { cwd: fixture, timeout: 1000 })).rejects.toMatchObject({ signal: "SIGTERM" });
});
it("does not spawn a command with an already aborted signal", async () => {
  const controller = new AbortController(); controller.abort(new Error("already cancelled"));
  await expect(runCodeGraphCommandInGroup("/missing-command", [], { cwd: fixture, timeout: 1000, signal: controller.signal })).rejects.toThrow("already cancelled");
});
it("waits for a cancelled sync to settle before removing the index", async () => {
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  let signal: AbortSignal | undefined; const calls: string[] = [];
  const manager = new CodeGraphManager(async () => "/fixture/codegraph", async (_command, args, options) => {
    calls.push(args[0]!);
    if (args[0] === "status") return { stdout: JSON.stringify({ initialized: true, pendingChanges: { modified: 1 } }), stderr: "" };
    if (args[0] === "sync") { signal = options.signal; entered(); await new Promise<void>((resolve) => { finish = resolve; }); signal?.throwIfAborted(); }
    return { stdout: "", stderr: "" };
  });
  const uri = toLocalProjectUri(fixture);
  const sync = manager.ensureProjectStatus(uri, true); await started;
  const removal = manager.removeProjectIndexes([uri]);
  expect(signal?.aborted).toBe(true);
  expect(calls).not.toContain("uninit");
  expect((await manager.ensureProjectStatus(uri, true)).state).toBe("disabled");
  finish(); await sync; await removal;
  expect(calls).toEqual(["status", "sync", "uninit"]); expect(manager.hasActiveJobs()).toBe(false);
});
