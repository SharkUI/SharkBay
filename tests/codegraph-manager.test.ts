import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodeGraphCommandEnv, CodeGraphManager, ensureGitExcludeEntry, removeGitExcludeEntry } from "../src/core/codegraph-manager.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";

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

    const result = await manager.readProjectStatus(toLocalProjectUri("/tmp/sharkbay-codegraph-project"), true);

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

    const result = await manager.ensureProjectStatus(toLocalProjectUri("/tmp/sharkbay-codegraph-project"), true);

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

    const result = await manager.readProjectStatus(toLocalProjectUri("/tmp/sharkbay-codegraph-project"), true);

    expect(result.state).toBe("not-installed");
    expect(result.summary).toBe("CodeGraph CLI not installed");
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
