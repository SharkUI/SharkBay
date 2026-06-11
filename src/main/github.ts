import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitHubInfo, GitHubIssue, GitHubPullRequest, GitHubRelease } from "../shared/types.js";
import { prependPathDirectories, resolveCommandPath, resolveCommandSearchPaths } from "./command-path.js";

const execFileAsync = promisify(execFile);

const LIST_LIMIT = 10;

const EMPTY_INFO: GitHubInfo = {
  available: false,
  issues: [],
  pullRequests: [],
  latestRelease: null,
};

export async function readGitHubInfo(repoPath: string): Promise<GitHubInfo> {
  // Packaged GUI apps inherit only a minimal PATH, so `gh` (typically installed
  // under Homebrew) is not on PATH the way it is in a dev shell. Resolve its
  // absolute path and augment PATH so gh can also find the `git` it shells out
  // to. When gh cannot be located the panel simply hides the GitHub cards.
  const searchPaths = await resolveCommandSearchPaths();
  const ghPath = await resolveCommandPath("gh");
  if (!ghPath) {
    return EMPTY_INFO;
  }
  const envPath = prependPathDirectories(process.env.PATH, searchPaths);

  // Guard: confirms gh is authenticated and the repo is on GitHub.
  const repoView = await gh(repoPath, ["repo", "view", "--json", "nameWithOwner"], ghPath, envPath).catch(() => null);
  if (repoView === null) {
    return EMPTY_INFO;
  }

  const [issuesRaw, prsRaw, releaseRaw] = await Promise.all([
    gh(repoPath, [
      "issue", "list", "--state", "open", "--limit", String(LIST_LIMIT),
      "--json", "number,title,author,createdAt,url,labels",
    ], ghPath, envPath).catch(() => "[]"),
    gh(repoPath, [
      "pr", "list", "--state", "open", "--limit", String(LIST_LIMIT),
      "--json", "number,title,author,createdAt,url,headRefName,isDraft,reviewDecision,labels",
    ], ghPath, envPath).catch(() => "[]"),
    gh(repoPath, [
      "release", "list", "--limit", "1",
      "--json", "tagName,name,publishedAt,isLatest,isPrerelease",
    ], ghPath, envPath).catch(() => "[]"),
  ]);

  return {
    available: true,
    issues: parseGitHubIssues(issuesRaw),
    pullRequests: parseGitHubPullRequests(prsRaw),
    latestRelease: parseLatestGitHubRelease(releaseRaw),
  };
}

export function parseGitHubIssues(raw: string): GitHubIssue[] {
  return parseJsonArray(raw).flatMap((item) => {
    const number = asNumber(item.number);
    const url = asString(item.url);
    if (number === null || !url) return [];
    return [{
      number,
      title: asString(item.title),
      author: asAuthorLogin(item.author),
      createdAt: asString(item.createdAt),
      url,
      labels: asLabelNames(item.labels),
    }];
  });
}

export function parseGitHubPullRequests(raw: string): GitHubPullRequest[] {
  return parseJsonArray(raw).flatMap((item) => {
    const number = asNumber(item.number);
    const url = asString(item.url);
    if (number === null || !url) return [];
    const reviewDecision = asString(item.reviewDecision);
    return [{
      number,
      title: asString(item.title),
      author: asAuthorLogin(item.author),
      createdAt: asString(item.createdAt),
      url,
      headRefName: asString(item.headRefName),
      isDraft: item.isDraft === true,
      reviewDecision: reviewDecision || null,
      labels: asLabelNames(item.labels),
    }];
  });
}

export function parseLatestGitHubRelease(raw: string): GitHubRelease | null {
  const items = parseJsonArray(raw);
  const item = items[0];
  if (!item) return null;
  const tagName = asString(item.tagName);
  if (!tagName) return null;
  return {
    tagName,
    name: asString(item.name) || tagName,
    publishedAt: asString(item.publishedAt),
    isLatest: item.isLatest === true,
    isPrerelease: item.isPrerelease === true,
  };
}

function parseJsonArray(raw: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
  } catch {
    return [];
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asAuthorLogin(value: unknown): string {
  if (value && typeof value === "object" && "login" in value) {
    return asString((value as { login: unknown }).login);
  }
  return "";
}

function asLabelNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((label) => {
    if (label && typeof label === "object" && "name" in label) {
      const name = asString((label as { name: unknown }).name);
      return name ? [name] : [];
    }
    return [];
  });
}

async function gh(repoPath: string, args: string[], ghPath: string, envPath: string): Promise<string> {
  const { stdout } = await execFileAsync(ghPath, args, {
    cwd: repoPath,
    timeout: 8000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, PATH: envPath, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
  });
  return stdout.trimEnd();
}
