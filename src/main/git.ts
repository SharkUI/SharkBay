import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitDirtyFile, GitEvent, GitMetadata } from "../shared/types.js";

const execFileAsync = promisify(execFile);

export async function readGitMetadata(repoPath: string): Promise<GitMetadata> {
  try {
    const gitRoot = await git(repoPath, ["rev-parse", "--show-toplevel"]);
    const [currentBranch, defaultBranch, remoteOrigin, status] = await Promise.all([
      git(repoPath, ["branch", "--show-current"]).catch(() => null),
      readDefaultBranch(repoPath),
      git(repoPath, ["config", "--get", "remote.origin.url"]).catch(() => null),
      git(repoPath, ["status", "--porcelain"]).catch(() => null),
    ]);

    return {
      isGitRepository: true,
      gitRoot,
      currentBranch,
      defaultBranch,
      remoteOrigin,
      githubUrl: remoteOrigin,
      dirtyWorktree: status === null ? null : status.length > 0,
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
    };
  }
}

export async function readOriginUrls(repoPath: string): Promise<{ fetch: string; push: string[] } | null> {
  const urls = await git(repoPath, ["config", "--get-regexp", "^remote\\.origin\\.(url|pushurl)$"]).catch(() => "");
  const lines = urls.split("\n");
  const fetch = lines.find((line) => line.startsWith("remote.origin.url "))?.slice("remote.origin.url ".length);
  if (!fetch) return null;
  const push = lines.filter((line) => line.startsWith("remote.origin.pushurl ")).map((line) => line.slice("remote.origin.pushurl ".length));
  return { fetch, push: push.length ? push : [fetch] };
}

export function githubRepoFromRemote(remote: string | null): string | null {
  const match = remote?.match(/^(?:https?:\/\/(?:[^/\s@]+@)?github\.com\/|ssh:\/\/(?:[^/\s@]+@)?github\.com(?::\d+)?\/|(?:[^/\s@]+@)?github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i);
  return match?.[1] ?? null;
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
  const raw = await git(repoPath, ["status", "--porcelain=v1", "-z", "-uall"]).catch(() => "");
  return parseGitDirtyFiles(raw);
}

export function parseGitDirtyFiles(raw: string): GitDirtyFile[] {
  const records = raw.split("\0");
  const files: GitDirtyFile[] = [];
  for (let index = 0; index < records.length; index++) {
    const line = records[index]!;
    if (line.length < 4) {
      continue;
    }
    const staged = line[0] ?? " ";
    const unstaged = line[1] ?? " ";
    // With -z, Git emits the destination first, then the original rename/copy path.
    const filePath = line.slice(3);
    if (/[RC]/u.test(`${staged}${unstaged}`)) index++;
    if (!filePath) {
      continue;
    }
    files.push({
      path: filePath,
      status: `${staged}${unstaged}`.trim() || "modified",
      staged,
      unstaged,
    });
  }
  return files;
}

async function readDefaultBranch(repoPath: string): Promise<string | null> {
  const symbolic = await git(repoPath, ["symbolic-ref", "refs/remotes/origin/HEAD"]).catch(() => null);
  if (symbolic) {
    return symbolic.replace(/^refs\/remotes\/origin\//, "");
  }
  return git(repoPath, ["config", "--get", "init.defaultBranch"]).catch(() => null);
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    timeout: 3000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trimEnd();
}
