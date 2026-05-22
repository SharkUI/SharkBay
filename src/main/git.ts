import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  CreateWorktreeResult,
  GitBranchSummary,
  GitDirtyFile,
  GitEvent,
  GitMetadata,
  RemoveWorktreeResult,
  WorktreeStatus,
} from "../shared/types.js";

const execFileAsync = promisify(execFile);

export async function readGitMetadata(repoPath: string): Promise<GitMetadata> {
  try {
    const gitRoot = await git(repoPath, ["rev-parse", "--show-toplevel"]);
    const [currentBranch, defaultBranch, remoteOrigin, status, gitDir, gitCommonDir] = await Promise.all([
      git(repoPath, ["branch", "--show-current"]).catch(() => null),
      readDefaultBranch(repoPath),
      git(repoPath, ["config", "--get", "remote.origin.url"]).catch(() => null),
      git(repoPath, ["status", "--porcelain"]).catch(() => null),
      git(repoPath, ["rev-parse", "--absolute-git-dir"]).catch(() => null),
      git(repoPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).catch(() => null),
    ]);

    const isLinkedWorktree = gitDir !== null && gitCommonDir !== null && gitDir !== gitCommonDir;

    return {
      isGitRepository: true,
      gitRoot,
      currentBranch,
      defaultBranch,
      remoteOrigin,
      githubUrl: remoteOrigin,
      dirtyWorktree: status === null ? null : status.length > 0,
      isLinkedWorktree,
      worktreeBranch: isLinkedWorktree ? currentBranch : null,
    };
  } catch {
    return {
      isGitRepository: false,
      gitRoot: null,
      currentBranch: null,
      defaultBranch: null,
      remoteOrigin: null,
      githubUrl: null,
      dirtyWorktree: null,
      isLinkedWorktree: null,
      worktreeBranch: null,
    };
  }
}

export async function listLocalGitBranches(repoPath: string): Promise<GitBranchSummary> {
  const [currentRaw, locals, remotes] = await Promise.all([
    git(repoPath, ["branch", "--show-current"]).catch(() => ""),
    git(repoPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]).catch(() => ""),
    git(repoPath, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]).catch(() => ""),
  ]);
  return {
    current: currentRaw ? currentRaw : null,
    localBranches: parseLines(locals),
    remoteBranches: parseLines(remotes).filter((line) => !line.endsWith("/HEAD")),
  };
}

export async function addLocalWorktree(
  repoPath: string,
  options: { branch: string; base: string; targetPath: string },
): Promise<CreateWorktreeResult> {
  const { branch, base, targetPath } = options;
  if (!isValidBranchName(branch)) {
    return { ok: false, reason: "invalid-name", message: `Invalid branch name: ${branch}` };
  }
  let targetExists = false;
  try {
    await fs.access(targetPath);
    targetExists = true;
  } catch {
    // Target doesn't exist — good.
  }
  if (targetExists) {
    return { ok: false, reason: "target-exists", message: `Directory already exists: ${targetPath}` };
  }
  const branchRefExists = await git(repoPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])
    .then(() => true)
    .catch(() => false);
  if (branchRefExists) {
    return { ok: false, reason: "branch-exists", message: `Branch already exists: ${branch}` };
  }
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await git(repoPath, ["worktree", "add", "-b", branch, targetPath, base]);
  } catch (error) {
    return { ok: false, reason: "git-error", message: extractMessage(error) };
  }
  return { ok: true, targetPath, newProjectUri: "", branch };
}

export async function readLocalWorktreeStatus(repoPath: string): Promise<WorktreeStatus> {
  const branch = await git(repoPath, ["branch", "--show-current"]).catch(() => "");
  if (!branch) {
    return { branch: null, base: null, ahead: null, behind: null, dirtyCount: null, hasUpstream: false };
  }
  const upstream = await git(repoPath, ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]).catch(() => "");
  let base: string | null = upstream || null;
  const hasUpstream = Boolean(upstream);
  if (!base) {
    const defaultBranchRef = await git(repoPath, ["symbolic-ref", "refs/remotes/origin/HEAD"]).catch(() => "");
    if (defaultBranchRef) {
      base = defaultBranchRef.replace(/^refs\/remotes\//, "");
    } else {
      base = await git(repoPath, ["config", "--get", "init.defaultBranch"]).catch(() => "") || null;
    }
  }
  let ahead: number | null = null;
  let behind: number | null = null;
  if (base) {
    const counts = await git(repoPath, ["rev-list", "--left-right", "--count", `${base}...HEAD`]).catch(() => "");
    if (counts) {
      const [behindStr, aheadStr] = counts.split(/\s+/u);
      const behindNum = Number(behindStr);
      const aheadNum = Number(aheadStr);
      if (Number.isFinite(behindNum)) behind = behindNum;
      if (Number.isFinite(aheadNum)) ahead = aheadNum;
    }
  }
  const dirty = await git(repoPath, ["status", "--porcelain"]).catch(() => "");
  const dirtyCount = dirty ? dirty.split("\n").filter((line) => line.trim().length > 0).length : 0;
  return { branch, base, ahead, behind, dirtyCount, hasUpstream };
}

export async function removeLocalWorktree(
  repoPath: string,
  options: { force?: boolean } = {},
): Promise<RemoveWorktreeResult> {
  const gitDir = await git(repoPath, ["rev-parse", "--absolute-git-dir"]).catch(() => "");
  const gitCommonDir = await git(repoPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).catch(() => "");
  if (!gitDir || !gitCommonDir || gitDir === gitCommonDir) {
    return { ok: false, reason: "not-worktree", message: "This project is not a linked worktree." };
  }
  const args = ["worktree", "remove"];
  if (options.force) args.push("--force");
  args.push(repoPath);
  try {
    await git(gitCommonDir.replace(/\/\.git$/, "") || repoPath, args);
    return { ok: true };
  } catch (error) {
    const message = extractMessage(error);
    if (/contains modified or untracked|locked/i.test(message)) {
      const dirty = await git(repoPath, ["status", "--porcelain"]).catch(() => "");
      const dirtyCount = dirty ? dirty.split("\n").filter((line) => line.trim().length > 0).length : 0;
      return { ok: false, reason: "dirty", message, dirtyCount };
    }
    return { ok: false, reason: "git-error", message };
  }
}

export async function readGitHistory(repoPath: string, limit = 50): Promise<GitEvent[]> {
  const raw = await git(repoPath, [
    "reflog",
    "--date=iso-strict",
    "--format=%H%x1f%gd%x1f%gs%x1f%cd",
    `-n${limit}`,
  ]).catch(() => "");

  if (!raw) {
    return [];
  }

  return raw.split("\n").flatMap((line) => {
    const [hash, selector, action, date] = line.split("\x1f");
    if (!hash || !selector || !action || !date) {
      return [];
    }
    return [{ hash, selector, action, date }];
  });
}

export async function readGitDirtyFiles(repoPath: string): Promise<GitDirtyFile[]> {
  const raw = await git(repoPath, ["status", "--porcelain=v1", "-uall"]).catch(() => "");
  return parseGitDirtyFiles(raw);
}

export function parseGitDirtyFiles(raw: string): GitDirtyFile[] {
  return raw.split("\n").flatMap((line) => {
    if (line.length < 4) {
      return [];
    }
    const staged = line[0] ?? " ";
    const unstaged = line[1] ?? " ";
    const pathText = line.slice(3).trim();
    const renamedPath = pathText.includes(" -> ") ? pathText.split(" -> ").pop() ?? pathText : pathText;
    const filePath = unquotePorcelainPath(renamedPath);
    if (!filePath) {
      return [];
    }
    return [{
      path: filePath,
      status: `${staged}${unstaged}`.trim() || "modified",
      staged,
      unstaged,
    }];
  });
}

async function readDefaultBranch(repoPath: string): Promise<string | null> {
  const symbolic = await git(repoPath, ["symbolic-ref", "refs/remotes/origin/HEAD"]).catch(() => null);
  if (symbolic) {
    return symbolic.replace(/^refs\/remotes\/origin\//, "");
  }
  return git(repoPath, ["config", "--get", "init.defaultBranch"]).catch(() => null);
}

function unquotePorcelainPath(value: string): string {
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1)
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
  return value;
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trimEnd();
}

function parseLines(raw: string): string[] {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean);
}

function isValidBranchName(value: string): boolean {
  if (!value || value.length > 200) return false;
  if (/[\s~^:?*\[\\]/u.test(value)) return false;
  if (value.startsWith("-") || value.startsWith(".") || value.endsWith(".") || value.endsWith("/")) return false;
  if (value.includes("..") || value.includes("//")) return false;
  return true;
}

function extractMessage(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
