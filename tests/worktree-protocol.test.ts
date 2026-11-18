import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { getHarnessUpdateStatus, installHarness, uninstallHarness, updateHarnessFiles } from "../src/main/harness.js";
import { TeamworkSync } from "../src/main/teamwork-sync.js";

const exec = promisify(execFile);
const roots: string[] = [];
const options = { githubLogin: "audit", githubUserId: 1, machineId: "fixture", agent: "codex", repo: "audit/fixture" };
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "Audit", GIT_AUTHOR_EMAIL: "audit@example.invalid", GIT_COMMITTER_NAME: "Audit", GIT_COMMITTER_EMAIL: "audit@example.invalid" };
async function git(repo: string, ...args: string[]) {
  return (await exec("git", ["-c", "core.hooksPath=/dev/null", "-C", repo, ...args], { env, timeout: 5000 })).stdout.trimEnd();
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("protocol on Git worktrees", () => {
  it.each([false, true])("supports install, update, local sync and uninstall with linked=%s", async (linked) => {
    const root = await mkdtemp(path.join(tmpdir(), "sharkbay-worktree-protocol-")); roots.push(root);
    const base = path.join(root, "base"); await mkdir(base);
    await git(base, "init"); await git(base, "config", "user.name", "Audit"); await git(base, "config", "user.email", "audit@example.invalid");
    await writeFile(path.join(base, "keep.txt"), "committed"); await git(base, "add", "keep.txt"); await git(base, "commit", "-m", "fixture");
    const remote = path.join(root, "remote.git"); await git(base, "init", "--bare", remote); await git(base, "remote", "add", "origin", remote);
    const repo = linked ? path.join(root, "worktree") : base;
    if (linked) await git(base, "worktree", "add", repo, "-b", "fixture-linked");
    await writeFile(path.join(repo, "keep.txt"), "staged change"); await git(repo, "add", "keep.txt");
    const index = await git(repo, "rev-parse", "--path-format=absolute", "--git-path", "index");
    const beforeIndex = await readFile(index);
    const exclude = await git(repo, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude");
    await writeFile(exclude, "# user ignore\nkeep.local\n");
    await installHarness(repo, options);
    expect(await readFile(exclude, "utf8")).toContain("/.sharkbay/");
    expect(await getHarnessUpdateStatus(repo)).toMatchObject({ required: false });
    await writeFile(path.join(repo, ".sharkbay/harness/review.sh"), "old");
    expect(await updateHarnessFiles(repo)).toMatchObject({ required: false });
    const sync = new TeamworkSync(repo);
    await sync.ensureContextBranch("audit/fixture", "audit");
    const taskId = "TASK01-u1-mfixture";
    await writeFile(path.join(repo, ".sharkbay/tasks", `${taskId}-fixture.md`), `---\ntaskId: ${taskId}\ntitle: Fixture\nstatus: completed\ncompletedAt: 2026-11-17T00:00:00Z\n---\n`);
    expect(await sync.syncOnce()).toMatchObject({ error: null, pushed: [taskId] });
    expect(await readFile(index)).toEqual(beforeIndex);
    expect(await readFile(path.join(repo, "keep.txt"), "utf8")).toBe("staged change");
    await uninstallHarness(repo);
    expect(await readFile(exclude, "utf8")).toBe("# user ignore\nkeep.local\n");
  });
});
