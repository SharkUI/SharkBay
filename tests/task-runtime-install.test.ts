import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRepoPermission, installHarness, resolveGitHubIdentity } from "../src/main/harness.js";
import { createTaskRuntime } from "../src/runtime/task-runtime.js";
import { makeTempRoot } from "./helpers.js";

vi.mock("../src/main/harness.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/main/harness.js")>(),
  checkRepoPermission: vi.fn(),
  resolveGitHubIdentity: vi.fn(),
}));

const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
const branch = "refs/heads/sharkbay-team-context";
const taskId = "LOCAL1-u0-moffline";
const taskFile = `.sharkbay/tasks/${taskId}-local-work.md`;
const taskContents = [
  "---", "kind: sharkbay_task", `taskId: ${taskId}`, "title: Offline work", "status: completed",
  "completedAt: 2026-07-01T00:00:00Z", "---", "", "## Summary", "Recorded offline.", "",
].join("\n");

let runtime: ReturnType<typeof createTaskRuntime>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.mocked(resolveGitHubIdentity).mockReset().mockResolvedValue({ login: "SharkUI", id: 3960864, avatarUrl: "" });
  vi.mocked(checkRepoPermission).mockReset().mockResolvedValue("write");
  runtime = createTaskRuntime(() => {});
});

afterEach(async () => {
  await runtime.stop();
  vi.useRealTimers();
});

async function fixture() {
  const root = await makeTempRoot("task-protocol");
  const repo = path.join(root, "project");
  await fs.mkdir(repo);
  await git(repo, "init");
  return { root, repo, git: (...args: string[]) => git(repo, ...args) };
}

async function addRemote(repo: string, remote: string, name: string) {
  const url = `https://github.com/upstream/${name}.git`;
  await git(repo, "init", "--bare", remote);
  await git(repo, "config", `url.${pathToFileURL(remote).href}.insteadOf`, url);
  if (await git(repo, "remote")) await git(repo, "remote", "set-url", "origin", url);
  else await git(repo, "remote", "add", "origin", url);
}

async function waitForStatus(repo: string, expected: Record<string, unknown>) {
  await vi.waitFor(async () => expect(await runtime.getStatus(repo)).toMatchObject(expected), { timeout: 4000 });
}

describe("automatic team sync", () => {
  it("starts the existing sync flow after preparing Harness for an Agent launch", async () => {
    const { root, repo } = await fixture();
    const remote = path.join(root, "remote.git");
    await addRemote(repo, remote, "project");
    await runtime.prepareForAgentLaunch(repo);
    await waitForStatus(repo, { installed: true, syncEnabled: true });
    expect(await git(remote, "rev-parse", branch)).toMatch(/^[a-f\d]{40}$/);
  });

  it("installs and reads local tasks while GitHub is unreachable, then reconnects in the background", async () => {
    const { root, repo } = await fixture();
    const remote = path.join(root, "remote.git");
    await addRemote(repo, remote, "project");
    let failIdentity!: (error: Error) => void;
    vi.mocked(resolveGitHubIdentity).mockImplementationOnce(() => new Promise((_, reject) => { failIdentity = reject; }));

    const status = await runtime.installProtocol(repo);
    try {
      expect(status).toMatchObject({ installed: true, syncEnabled: false });
      expect(status.machineId).toBeTruthy();
      expect(vi.mocked(checkRepoPermission)).not.toHaveBeenCalled();
      await fs.writeFile(path.join(repo, taskFile), taskContents);
      await expect(runtime.getTasks(repo)).resolves.toMatchObject([{ taskId, status: "completed" }]);
      await vi.waitFor(() => expect(failIdentity).toBeTypeOf("function"));
    } finally {
      failIdentity?.(new Error("Could not resolve host: api.github.com"));
    }

    await waitForStatus(repo, { lastError: "Could not reach GitHub. Team sync will retry automatically." });
    expect(await git(remote, "for-each-ref", branch)).toBe("");
    await vi.advanceTimersByTimeAsync(10_000);
    await waitForStatus(repo, { machineId: status.machineId, githubUserId: 3960864, syncEnabled: true, lastError: null, harnessUpdate: { required: false } });
    await expect(fs.readFile(path.join(repo, taskFile), "utf8")).resolves.toBe(taskContents);
    expect(await git(remote, "ls-tree", "-r", "--name-only", branch)).toContain(`${taskId}-local-work.md`);
  });

  it("picks up a newly added origin and switches to a replacement repository without reinstalling", async () => {
    const { root, repo } = await fixture();
    const status = await runtime.installProtocol(repo);
    await fs.writeFile(path.join(repo, taskFile), taskContents);
    await waitForStatus(repo, { githubUserId: 3960864, syncEnabled: false, harnessUpdate: { required: false } });
    expect(checkRepoPermission).not.toHaveBeenCalled();

    const first = path.join(root, "first.git");
    await addRemote(repo, first, "first");
    await vi.advanceTimersByTimeAsync(10_000);
    await waitForStatus(repo, { repo: "upstream/first", machineId: status.machineId, syncEnabled: true });
    const firstHead = await git(first, "rev-parse", branch);

    const second = path.join(root, "second.git");
    await addRemote(repo, second, "second");
    await vi.advanceTimersByTimeAsync(10_000);
    await waitForStatus(repo, { repo: "upstream/second", machineId: status.machineId, syncEnabled: true });
    expect(checkRepoPermission).toHaveBeenLastCalledWith("upstream/second");
    expect(await git(first, "rev-parse", branch)).toBe(firstHead);
    expect(await git(second, "ls-tree", "-r", "--name-only", branch)).toContain(`${taskId}-local-work.md`);

    await git(repo, "remote", "set-url", "--push", "origin", "https://github.com/upstream/first.git");
    await vi.advanceTimersByTimeAsync(10_000);
    await waitForStatus(repo, { syncEnabled: false, lastError: expect.stringContaining("same GitHub repository") });
    await expect(fs.readFile(path.join(repo, taskFile), "utf8")).resolves.toBe(taskContents);
  });

  it("joins an existing team context branch when another installed project opens", async () => {
    const { root, repo } = await fixture();
    const remote = path.join(root, "remote.git");
    const options = { githubLogin: "SharkUI", githubUserId: 3960864, machineId: "one", agent: "", repo: "upstream/project" };
    await addRemote(repo, remote, "project");
    await installHarness(repo, options);
    await fs.writeFile(path.join(repo, taskFile), taskContents);
    await runtime.syncNow(repo);
    const existingHead = await git(remote, "rev-parse", branch);

    const second = path.join(root, "second");
    await git(repo, "init", second);
    await addRemote(second, remote, "project");
    await installHarness(second, { ...options, machineId: "two" });
    await runtime.trackProject(second);
    await vi.waitFor(async () => expect(await runtime.getTasks(second)).toMatchObject([
      { taskId, sourceKind: "team-md", status: "completed" },
    ]), { timeout: 4000 });
    await waitForStatus(second, { machineId: "two", syncEnabled: true });
    expect(await git(remote, "rev-parse", branch)).toBe(existingHead);
  });

  it.each([
    ["credentials", "Sign in to GitHub", undefined, new Error("gh: Bad credentials (HTTP 401)")],
    ["permission", "needs write access", "read", undefined],
  ])("keeps local tasks usable and reports the reason when %s are missing", async (_, reason, permission, error) => {
    const { root, repo } = await fixture();
    const remote = path.join(root, "remote.git");
    await addRemote(repo, remote, "project");
    if (error) vi.mocked(resolveGitHubIdentity).mockRejectedValue(error);
    if (permission) vi.mocked(checkRepoPermission).mockResolvedValue(permission);

    await expect(runtime.installProtocol(repo)).resolves.toMatchObject({ installed: true });
    await waitForStatus(repo, { repo: "upstream/project", syncEnabled: false, lastError: expect.stringContaining(reason) });
    await fs.writeFile(path.join(repo, taskFile), taskContents);
    await expect(runtime.getTasks(repo)).resolves.toMatchObject([{ taskId }]);
    expect(await git(remote, "for-each-ref", branch)).toBe("");
  });
});
