import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { addConfiguredProject, renameProject } from "./config.js";
import type { CreateWorktreeInput, CreateWorktreeResult, GitWorkspace, IpcRuntimeLike } from "../shared/types.js";

const execFileAsync = promisify(execFile);
const teamContextBranch = "sharkbay-team-context";

async function runGit(cwd: string, args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd })).stdout;
}

export async function readGitRepository(repoPath: string) {
  const [commonDir, gitDir] = await Promise.all([
    runGit(repoPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    runGit(repoPath, ["rev-parse", "--absolute-git-dir"]),
  ]);
  return { commonDir: commonDir.trimEnd(), primary: commonDir === gitDir };
}

export async function readGitWorkspace(repoPath: string): Promise<GitWorkspace> {
  const [root, worktrees, branches, remoteBranches] = await Promise.all([
    runGit(repoPath, ["rev-parse", "--show-toplevel"]),
    runGit(repoPath, ["worktree", "list", "--porcelain", "-z"]),
    runGit(repoPath, ["for-each-ref", "--format=%(refname:lstrip=2)", "refs/heads"]),
    runGit(repoPath, ["for-each-ref", "--format=%(refname:lstrip=3)%09%(symref)", "refs/remotes/origin"]),
  ]);
  if (root.trimEnd() !== repoPath) throw new Error("Select a Git worktree root");
  return {
    worktrees: worktrees.split("\0\0").flatMap((record, index) => {
      const fields = record.split("\0");
      const location = fields[0]?.slice("worktree ".length);
      if (!location || !fields[0]?.startsWith("worktree ") || fields.includes("bare")) return [];
      return [{
        path: location,
        branch: fields.find((line) => line.startsWith("branch refs/heads/"))?.slice("branch refs/heads/".length) ?? null,
        head: fields.find((line) => line.startsWith("HEAD "))?.slice(5, 12) ?? "",
        primary: index === 0,
        locked: fields.some((line) => line === "locked" || line.startsWith("locked ")),
        prunable: fields.some((line) => line === "prunable" || line.startsWith("prunable ")),
      }];
    }),
    branches: branches.split("\n").filter((branch) => branch && branch !== teamContextBranch),
    remoteBranches: remoteBranches.split("\n").flatMap((line) => {
      const [branch, symref] = line.split("\t");
      return branch && !symref && branch !== teamContextBranch ? [branch] : [];
    }),
  };
}

export async function fetchGitBranches(repoPath: string): Promise<void> {
  const remotes = await runGit(repoPath, ["remote"]);
  if (!remotes.split("\n").includes("origin")) return;
  try {
    await execFileAsync("git", [
      "fetch", "--atomic", "--prune", "--no-tags", "--no-prune-tags", "--no-recurse-submodules", "--refmap=",
      "origin", "+refs/heads/*:refs/remotes/origin/*",
    ], {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 20_000,
    });
  } catch {
    throw new Error("Could not fetch branches from origin. Check access to the remote and try again.");
  }
}

async function validateBranch(repoPath: string, branch: string) {
  if (!branch || branch.startsWith("-") || branch === teamContextBranch) throw new Error("Choose a local development branch");
  await runGit(repoPath, ["check-ref-format", `refs/heads/${branch}`]);
}

export async function deleteLocalBranch(repoPath: string, branch: string) {
  await validateBranch(repoPath, branch);
  await runGit(repoPath, ["branch", "--delete", "--", branch]);
}

export async function removeGitWorktree(repoPath: string, worktreePath: string) {
  const { worktrees } = await readGitWorkspace(repoPath);
  const worktree = worktrees.find((item) => item.path === worktreePath);
  if (!worktree || worktree.primary || worktree.locked || worktree.prunable) throw new Error("This worktree cannot be removed");
  const changes = await runGit(worktreePath, ["status", "--porcelain", "--untracked-files=all", "--ignored"]);
  if (changes) throw new Error("The worktree contains local files or changes");
  if (!worktree.branch) {
    const refs = await runGit(worktreePath, ["for-each-ref", "--contains", "HEAD", "refs/heads", "refs/remotes", "refs/tags"]);
    if (!refs) throw new Error("The detached worktree contains commits without a branch or tag");
  }
  await runGit(repoPath, ["worktree", "remove", "--", worktreePath]);
}

function sanitizeBranchForPath(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function createWorktree(runtime: IpcRuntimeLike, input: CreateWorktreeInput): Promise<CreateWorktreeResult> {
  const { sourceProjectPath, branchName, existingBranch, trackOrigin } = input;
  await validateBranch(sourceProjectPath, branchName);
  if (existingBranch && trackOrigin) throw new Error("Choose one branch source");

  const baseName = path.basename(sourceProjectPath);
  const targetDir = path.resolve(sourceProjectPath, "..", `${baseName}-${sanitizeBranchForPath(branchName)}`);

  if (existingBranch) {
    await runGit(sourceProjectPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    await runGit(sourceProjectPath, ["worktree", "add", "--", targetDir, branchName]);
  } else if (trackOrigin) {
    const remoteRef = `refs/remotes/origin/${branchName}`;
    const fetchRefspec = `+refs/heads/${branchName}:${remoteRef}`;
    await runGit(sourceProjectPath, [
      "-c", `remote.origin.fetch=${fetchRefspec}`, "worktree", "add", "--track", "-b", branchName, "--", targetDir, remoteRef,
    ]);
    // A single-branch clone needs a fetch mapping for the new branch's upstream.
    const upstream = await runGit(sourceProjectPath, ["rev-parse", "--symbolic-full-name", `${branchName}@{upstream}`]).catch(() => "");
    if (!upstream.trim()) await runGit(sourceProjectPath, ["config", "--add", "remote.origin.fetch", fetchRefspec]);
  } else {
    await runGit(sourceProjectPath, ["worktree", "add", "-b", branchName, "--", targetDir]);
  }

  await addConfiguredProject(runtime, { path: targetDir });
  const uri = `local:${encodeURI(targetDir)}`;
  await renameProject(runtime, { uri, name: `${baseName}:${branchName}` });

  return { targetPath: targetDir, branchName };
}
