import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { installHarness } from "../src/main/harness.js";
import { deleteTeamContextBranch, hasLocalContextBranch, TeamworkSync } from "../src/main/teamwork-sync.js";
import { makeTempRoot, writeText } from "./helpers.js";

const execFileAsync = promisify(execFile);

const gitIdentityEnv = {
  GIT_AUTHOR_NAME: "SharkBay",
  GIT_AUTHOR_EMAIL: "sharkbay@example.com",
  GIT_COMMITTER_NAME: "SharkBay",
  GIT_COMMITTER_EMAIL: "sharkbay@example.com",
};

describe("teamwork context sync", () => {
  it("coalesces overlapping sync requests", async () => {
    const { repo } = await createInstalledSyncRepo("teamwork-sync-overlap");

    await withGitIdentity(async () => {
      const sync = new TeamworkSync(repo);
      await sync.ensureContextBranch("SharkUI/AIBF", "SharkUI");
      const first = sync.syncOnce();
      const second = sync.syncOnce();

      expect(second).toBe(first);
      await expect(first).resolves.toEqual({ fetched: true, pushed: [], error: null });
    });
  });

  it("creates the context branch and syncs completed local tasks", async () => {
    const root = await makeTempRoot("teamwork-sync");
    const remote = path.join(root, "remote.git");
    const repo = path.join(root, "repo");
    await fs.mkdir(repo, { recursive: true });
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["init"], { cwd: repo });
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo });
    await writeText(path.join(repo, "README.md"), "# Fixture\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: repo });
    await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo, env: { ...process.env, ...gitIdentityEnv } });
    await execFileAsync("git", ["push", "origin", "HEAD:main"], { cwd: repo });

    await installHarness(repo, {
      githubLogin: "SharkUI",
      githubUserId: 3960864,
      machineId: "jl25uj",
      agent: "codex",
      repo: "SharkUI/AIBF",
    });

    const taskId = "A1B2C3-u3960864-mjl25uj";
    const taskFilename = `${taskId}-test-sync.md`;
    await writeText(path.join(repo, ".sharkbay", "tasks", taskFilename), [
      "---",
      "kind: sharkbay_task",
      `taskId: ${taskId}`,
      "taskTag: A1B2C3",
      "mode: quick",
      "title: Sync completed task",
      "status: completed",
      "actor: SharkUI",
      "githubUserId: 3960864",
      "machine: jl25uj",
      "agent: codex",
      "createdAt: 2026-05-16T02:34:49Z",
      "updatedAt: 2026-05-16T02:36:05Z",
      "completedAt: 2026-05-16T02:36:05Z",
      "commit: abc1234",
      "---",
      "",
      "## Summary",
      "Synced a completed fixture task.",
      "",
      "## Files",
      "- README.md",
      "",
      "## Work",
      "- Created a fixture task.",
      "",
      "## Verification",
      "- Unit test.",
      "",
      "## Notes",
      "- None.",
      "",
    ].join("\n"));

    const originalGitEnv = snapshotGitEnv();
    Object.assign(process.env, gitIdentityEnv);
    try {
      const sync = new TeamworkSync(repo);
      await expect(hasLocalContextBranch(repo)).resolves.toBe(false);
      await sync.ensureContextBranch("SharkUI/AIBF", "SharkUI");
      await expect(hasLocalContextBranch(repo)).resolves.toBe(true);

      const { stdout: branchList } = await execFileAsync("git", ["-C", repo, "ls-remote", "--heads", "origin", "sharkbay-team-context"]);
      expect(branchList).toContain("refs/heads/sharkbay-team-context");

      const result = await sync.syncOnce();
      expect(result).toEqual({ fetched: true, pushed: [taskId], error: null });

      const mirroredTask = await findFile(path.join(repo, ".sharkbay", "team-context", "tasks"), taskFilename);
      expect(mirroredTask).not.toBeNull();
      await expect(fs.readFile(mirroredTask!, "utf8")).resolves.toContain("title: Sync completed task");

      await expect(deleteTeamContextBranch(repo)).resolves.toBe(true);
      await expect(hasLocalContextBranch(repo)).resolves.toBe(false);
      const { stdout: deletedBranchList } = await execFileAsync("git", ["-C", repo, "ls-remote", "--heads", "origin", "sharkbay-team-context"]);
      expect(deletedBranchList).toBe("");
    } finally {
      restoreGitEnv(originalGitEnv);
    }
  });

  it("updates an existing remote task when the local record is newer", async () => {
    const { repo } = await createInstalledSyncRepo("teamwork-sync-newer-local");
    const taskId = "B2C3D4-u3960864-mjl25uj";
    const taskFilename = `${taskId}-newer-local.md`;
    await writeTaskFile(repo, taskFilename, {
      taskId,
      taskTag: "B2C3D4",
      title: "Sync newer local task",
      updatedAt: "2026-05-16T02:36:05Z",
      completedAt: "2026-05-16T02:36:05Z",
      summary: "Synced the first version.",
    });

    await withGitIdentity(async () => {
      const sync = new TeamworkSync(repo);
      await sync.ensureContextBranch("SharkUI/AIBF", "SharkUI");
      await expect(sync.syncOnce()).resolves.toEqual({ fetched: true, pushed: [taskId], error: null });

      await writeTaskFile(repo, taskFilename, {
        taskId,
        taskTag: "B2C3D4",
        title: "Sync newer local task",
        updatedAt: "2026-05-16T02:40:05Z",
        completedAt: "2026-05-16T02:36:05Z",
        commit: "abc1234",
        summary: "Synced the newer version.",
      });

      await expect(sync.syncOnce()).resolves.toEqual({ fetched: true, pushed: [taskId], error: null });
      const mirroredTask = await findFile(path.join(repo, ".sharkbay", "team-context", "tasks"), taskFilename);
      expect(mirroredTask).not.toBeNull();
      const mirroredContent = await fs.readFile(mirroredTask!, "utf8");
      expect(mirroredContent).toContain("updatedAt: 2026-05-16T02:40:05Z");
      expect(mirroredContent).toContain("commit: abc1234");
      expect(mirroredContent).toContain("Synced the newer version.");
    });
  });

  it("does not overwrite a newer remote task with an older local record", async () => {
    const { root, remote, repo } = await createInstalledSyncRepo("teamwork-sync-newer-remote");
    const taskId = "C3D4E5-u3960864-mjl25uj";
    const taskFilename = `${taskId}-newer-remote.md`;
    await writeTaskFile(repo, taskFilename, {
      taskId,
      taskTag: "C3D4E5",
      title: "Preserve newer remote task",
      updatedAt: "2026-05-16T02:36:05Z",
      completedAt: "2026-05-16T02:36:05Z",
      summary: "Synced the first version.",
    });

    await withGitIdentity(async () => {
      const sync = new TeamworkSync(repo);
      await sync.ensureContextBranch("SharkUI/AIBF", "SharkUI");
      await expect(sync.syncOnce()).resolves.toEqual({ fetched: true, pushed: [taskId], error: null });

      const actorRepo = path.join(root, "actor");
      await execFileAsync("git", ["clone", "--branch", "sharkbay-team-context", remote, actorRepo]);
      const actorTask = await findFile(path.join(actorRepo, ".sharkbay-team-context", "tasks"), taskFilename);
      expect(actorTask).not.toBeNull();
      await fs.writeFile(actorTask!, taskMarkdown({
        taskId,
        taskTag: "C3D4E5",
        title: "Preserve newer remote task",
        updatedAt: "2026-05-16T02:50:05Z",
        completedAt: "2026-05-16T02:36:05Z",
        commit: "remote999",
        summary: "Remote actor updated this task.",
      }), "utf8");
      await execFileAsync("git", ["add", ".sharkbay-team-context"], { cwd: actorRepo });
      await execFileAsync("git", ["commit", "-m", "remote updates task"], { cwd: actorRepo, env: { ...process.env, ...gitIdentityEnv } });
      await execFileAsync("git", ["push", "origin", "HEAD:sharkbay-team-context"], { cwd: actorRepo });

      await writeTaskFile(repo, taskFilename, {
        taskId,
        taskTag: "C3D4E5",
        title: "Preserve newer remote task",
        updatedAt: "2026-05-16T02:40:05Z",
        completedAt: "2026-05-16T02:36:05Z",
        commit: "local222",
        summary: "Local record is older than remote.",
      });

      await expect(sync.syncOnce()).resolves.toEqual({ fetched: true, pushed: [], error: null });
      const mirroredTask = await findFile(path.join(repo, ".sharkbay", "team-context", "tasks"), taskFilename);
      expect(mirroredTask).not.toBeNull();
      const mirroredContent = await fs.readFile(mirroredTask!, "utf8");
      expect(mirroredContent).toContain("updatedAt: 2026-05-16T02:50:05Z");
      expect(mirroredContent).toContain("commit: remote999");
      expect(mirroredContent).not.toContain("commit: local222");
    });
  });
});

async function findFile(directory: string, filename: string): Promise<string | null> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === filename) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = await findFile(fullPath, filename);
      if (found) return found;
    }
  }
  return null;
}

async function createInstalledSyncRepo(prefix: string): Promise<{ root: string; remote: string; repo: string }> {
  const root = await makeTempRoot(prefix);
  const remote = path.join(root, "remote.git");
  const repo = path.join(root, "repo");
  await fs.mkdir(repo, { recursive: true });
  await execFileAsync("git", ["init", "--bare", remote]);
  await execFileAsync("git", ["init"], { cwd: repo });
  await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo });
  await writeText(path.join(repo, "README.md"), "# Fixture\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: repo });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repo, env: { ...process.env, ...gitIdentityEnv } });
  await execFileAsync("git", ["push", "origin", "HEAD:main"], { cwd: repo });

  await installHarness(repo, {
    githubLogin: "SharkUI",
    githubUserId: 3960864,
    machineId: "jl25uj",
    agent: "codex",
    repo: "SharkUI/AIBF",
  });
  return { root, remote, repo };
}

type TaskFixture = {
  taskId: string;
  taskTag: string;
  title: string;
  updatedAt: string;
  completedAt: string;
  commit?: string;
  summary: string;
};

async function writeTaskFile(repo: string, filename: string, input: TaskFixture): Promise<void> {
  await writeText(path.join(repo, ".sharkbay", "tasks", filename), taskMarkdown(input));
}

function taskMarkdown(input: TaskFixture): string {
  return [
    "---",
    "kind: sharkbay_task",
    `taskId: ${input.taskId}`,
    `taskTag: ${input.taskTag}`,
    "mode: quick",
    `title: ${input.title}`,
    "status: completed",
    "actor: SharkUI",
    "githubUserId: 3960864",
    "machine: jl25uj",
    "agent: codex",
    "createdAt: 2026-05-16T02:34:49Z",
    `updatedAt: ${input.updatedAt}`,
    `completedAt: ${input.completedAt}`,
    input.commit ? `commit: ${input.commit}` : null,
    "---",
    "",
    "## Summary",
    input.summary,
    "",
    "## Files",
    "- README.md",
    "",
    "## Work",
    "- Created a fixture task.",
    "",
    "## Verification",
    "- Unit test.",
    "",
    "## Notes",
    "- None.",
    "",
  ].filter((line): line is string => line !== null).join("\n");
}

async function withGitIdentity<T>(callback: () => Promise<T>): Promise<T> {
  const originalGitEnv = snapshotGitEnv();
  Object.assign(process.env, gitIdentityEnv);
  try {
    return await callback();
  } finally {
    restoreGitEnv(originalGitEnv);
  }
}

function snapshotGitEnv(): Record<keyof typeof gitIdentityEnv, string | undefined> {
  return {
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
  };
}

function restoreGitEnv(snapshot: Record<keyof typeof gitIdentityEnv, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
