import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { resolveCommandPath } from "./command-path.js";

const execFileAsync = promisify(execFile);
const ROOT_ADAPTER_FILES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "QWEN.md"] as const;
const KIRO_STEERING_FILE = ".kiro/steering/sharkbay-protocol.md";
const TEAMWORK_ENTRY_START = "<!-- sharkbay-teamwork:start -->";
const TEAMWORK_ENTRY_END = "<!-- sharkbay-teamwork:end -->";
const EXCLUDE_ENTRIES = ["/.sharkbay/"];
const LEGACY_EXCLUDE_ENTRIES = [] as string[];
const EXCLUDE_REMOVAL_ENTRIES = new Set([...EXCLUDE_ENTRIES, ...LEGACY_EXCLUDE_ENTRIES]);
const EXCLUDE_BACKUP_FILE = "git-info-exclude.backup";
const EXCLUDE_MISSING_MARKER = "git-info-exclude.missing";
export const TEAMWORK_BOOTSTRAP_PROMPT = [
  "I'm working in SharkBay Teamwork mode for this project.",
  "Please read `.sharkbay/harness/protocol.md` first and follow it for the rest of this session.",
  "This bootstrap message itself does not require a task record.",
  "If a later request involves editing project files, generating persisted project artifacts, running a multi-step implementation or verification workflow, or preparing a commit, create or update the required task under `.sharkbay/tasks/` before making project changes.",
  "Keep Files and Work updated while working; finish by filling Summary and Verification; record the commit hash if a commit is produced.",
  "Treat `.sharkbay/team-context/` as read-only.",
  "If the protocol file is missing or unreadable, ask me whether to continue without SharkBay task tracking.",
  "After reading the protocol, wait for my next instruction.",
].join(" ");

export type GitHubIdentity = {
  login: string;
  id: number;
  avatarUrl: string;
};

export async function resolveGitHubIdentity(): Promise<GitHubIdentity> {
  const ghPath = await resolveGitHubCliPath();
  const { stdout } = await execFileAsync(ghPath, ["api", "user", "--jq", ".login + \"\\n\" + (.id|tostring) + \"\\n\" + .avatar_url"], { timeout: 10_000 });
  const [login, id, avatarUrl] = stdout.trim().split("\n");
  if (!login || !id) throw new Error("Failed to resolve GitHub identity from gh CLI");
  return { login: login!, id: Number(id), avatarUrl: avatarUrl ?? "" };
}

export async function checkRepoPermission(repo: string, login: string): Promise<string> {
  const ghPath = await resolveGitHubCliPath();
  const { stdout } = await execFileAsync(ghPath, ["api", `repos/${repo}/collaborators/${login}/permission`, "--jq", ".permission"], { timeout: 10_000 });
  return stdout.trim();
}

async function resolveGitHubCliPath(): Promise<string> {
  const executablePath = await resolveCommandPath("gh");
  if (executablePath) return executablePath;
  throw new Error("Teamwork requires the GitHub CLI (`gh`). Install it with `brew install gh`, then run `gh auth login`.");
}

export function generateMachineId(): string {
  return randomBytes(3).toString("hex");
}

export async function installHarness(
  repoPath: string,
  options: { githubLogin: string; githubUserId: number; machineId: string; agent: string; repo?: string },
): Promise<void> {
  await assertHarnessInstallable(repoPath);

  const sbDir = join(repoPath, ".sharkbay");
  const harnessDir = join(sbDir, "harness");
  const tasksDir = join(sbDir, "tasks");
  const teamContextDir = join(sbDir, "team-context");

  await mkdir(harnessDir, { recursive: true });
  await mkdir(tasksDir, { recursive: true });
  await mkdir(teamContextDir, { recursive: true });

  await writeFile(join(sbDir, "machine-id"), options.machineId, "utf-8");
  await writeFile(join(harnessDir, "protocol.md"), generateProtocol(options), "utf-8");

  await backupLocalExclude(repoPath, harnessDir);
  await ensureLocalExclude(repoPath);
}

export async function assertHarnessInstallable(repoPath: string): Promise<void> {
  await assertGitWorktree(repoPath);
}

async function assertGitWorktree(repoPath: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"], { timeout: 3_000 });
    if (stdout.trim() === "true") return;
  } catch {
    // Re-throw a SharkBay-facing message below.
  }
  throw new Error("Teamwork harness requires a Git repository. Run git init in this folder before installing Teamwork.");
}

export async function isHarnessInstalled(repoPath: string): Promise<boolean> {
  try {
    await access(join(repoPath, ".sharkbay", "harness", "protocol.md"));
    return true;
  } catch {
    return false;
  }
}

export async function getMachineId(repoPath: string): Promise<string | null> {
  try {
    return (await readFile(join(repoPath, ".sharkbay", "machine-id"), "utf-8")).trim();
  } catch {
    return null;
  }
}

export type TeamworkUninstallResult = {
  removedPaths: string[];
  skippedPaths: string[];
  excludeRemovedLines: string[];
};

export async function uninstallHarness(repoPath: string): Promise<TeamworkUninstallResult> {
  const removedPaths: string[] = [];
  const skippedPaths: string[] = [];

  for (const name of [...ROOT_ADAPTER_FILES, KIRO_STEERING_FILE]) {
    const removed = await removeManagedEntryBlock(repoPath, name);
    if (removed === "removed") removedPaths.push(name);
    else if (removed === "skipped") skippedPaths.push(name);
  }

  const excludeRemovedLines = await restoreLocalExclude(repoPath);
  const sharkbayDir = join(repoPath, ".sharkbay");
  try {
    await access(sharkbayDir);
    await rm(sharkbayDir, { recursive: true, force: true });
    removedPaths.push(".sharkbay");
  } catch {
    skippedPaths.push(".sharkbay");
  }

  return { removedPaths: removedPaths.sort(), skippedPaths: skippedPaths.sort(), excludeRemovedLines };
}

async function removeManagedEntryBlock(repoPath: string, name: string): Promise<"removed" | "skipped" | "missing"> {
  const filePath = join(repoPath, name);
  let existing: string;
  try {
    existing = await readFile(filePath, "utf-8");
  } catch {
    return "missing";
  }
  const stripped = removeTeamworkEntryBlock(existing);
  if (stripped === existing) return "skipped";
  if (stripped.trim().length === 0) {
    await rm(filePath, { force: true });
  } else {
    await writeFile(filePath, stripped, "utf-8");
  }
  return "removed";
}

async function backupLocalExclude(repoPath: string, harnessDir: string): Promise<void> {
  const backupPath = join(harnessDir, EXCLUDE_BACKUP_FILE);
  try {
    await access(backupPath);
    return;
  } catch {
    // First install in this worktree; capture the current local exclude state.
  }

  const excludePath = join(repoPath, ".git", "info", "exclude");
  try {
    const content = await readFile(excludePath, "utf-8");
    await writeFile(backupPath, content, "utf-8");
    await rm(join(harnessDir, EXCLUDE_MISSING_MARKER), { force: true });
  } catch {
    await writeFile(backupPath, "", "utf-8");
    await writeFile(join(harnessDir, EXCLUDE_MISSING_MARKER), "true\n", "utf-8");
  }
}

async function restoreLocalExclude(repoPath: string): Promise<string[]> {
  const backupPath = join(repoPath, ".sharkbay", "harness", EXCLUDE_BACKUP_FILE);
  const excludePath = join(repoPath, ".git", "info", "exclude");
  let content: string;
  try {
    content = await readFile(excludePath, "utf-8");
  } catch {
    content = "";
  }

  let backup = "";
  try {
    backup = await readFile(backupPath, "utf-8");
  } catch {
    backup = "";
  }

  if (backup.split("\n").includes("/.sharkbay/")) {
    return [];
  }

  const cleaned = cleanLocalExcludeContent(content);
  if (cleaned.removedLines.length === 0) return [];

  try {
    await access(join(repoPath, ".sharkbay", "harness", EXCLUDE_MISSING_MARKER));
    if (cleaned.content.length === 0) {
      await rm(excludePath, { force: true });
    } else {
      await writeFile(excludePath, cleaned.content, "utf-8");
    }
  } catch {
    await writeFile(excludePath, cleaned.content, "utf-8");
  }
  return cleaned.removedLines;
}

export function cleanLocalExcludeContent(content: string): { content: string; removedLines: string[] } {
  const normalized = content.replace(/\r\n/g, "\n");
  const hadFinalNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hadFinalNewline) lines.pop();

  const removedLines: string[] = [];
  const kept = lines.filter((line) => {
    if (EXCLUDE_REMOVAL_ENTRIES.has(line.trim())) {
      removedLines.push(line);
      return false;
    }
    return true;
  });

  return {
    content: kept.length ? `${kept.join("\n")}${hadFinalNewline ? "\n" : ""}` : "",
    removedLines,
  };
}

export async function ensureLocalExclude(repoPath: string): Promise<void> {
  const excludePath = join(repoPath, ".git", "info", "exclude");
  await mkdir(join(repoPath, ".git", "info"), { recursive: true });

  let content = "";
  try {
    content = await readFile(excludePath, "utf-8");
  } catch { /* file may not exist */ }

  content = content
    .split("\n")
    .filter((line) => !LEGACY_EXCLUDE_ENTRIES.includes(line.trim()))
    .join("\n");

  const missing = EXCLUDE_ENTRIES.filter((e) => !content.split("\n").includes(e));
  if (missing.length > 0) {
    const suffix = (content.endsWith("\n") || content === "" ? "" : "\n") + missing.join("\n") + "\n";
    await writeFile(excludePath, content + suffix, "utf-8");
  } else {
    await writeFile(excludePath, content.endsWith("\n") || content === "" ? content : `${content}\n`, "utf-8");
  }
}

export type TeamworkAgentLaunchResult = {
  initialCommand: string;
  injected: boolean;
  skippedReason?: "not-installed" | "unsupported-agent";
};

export async function prepareTeamworkAgentLaunch(repoPath: string, agentId: string, initialCommand: string): Promise<TeamworkAgentLaunchResult> {
  const bootstrapArgs = teamworkBootstrapArgs(agentId, TEAMWORK_BOOTSTRAP_PROMPT);
  if (!bootstrapArgs) {
    return { initialCommand, injected: false, skippedReason: "unsupported-agent" };
  }
  const harnessRoot = await resolveHarnessRoot(repoPath);
  if (!await hasSharkbayHarnessDir(harnessRoot)) {
    return { initialCommand, injected: false, skippedReason: "not-installed" };
  }

  const protocolOptions = await resolveProtocolOptions(harnessRoot, agentId);
  await ensureProtocolFiles(harnessRoot, protocolOptions);
  return { initialCommand: appendShellArgs(initialCommand, bootstrapArgs), injected: true };
}

async function hasSharkbayHarnessDir(repoPath: string): Promise<boolean> {
  try {
    await access(join(repoPath, ".sharkbay"));
    return true;
  } catch {
    return false;
  }
}

async function resolveHarnessRoot(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--path-format=absolute", "--git-common-dir"], { timeout: 3_000 });
    const commonDir = stdout.trim();
    const { stdout: gitDirOut } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--absolute-git-dir"], { timeout: 3_000 });
    if (commonDir && gitDirOut.trim() !== commonDir) {
      return dirname(commonDir);
    }
  } catch { /* not a git repo or git unavailable */ }
  return repoPath;
}

function teamworkBootstrapArgs(agentId: string, prompt: string): string[] | null {
  const normalized = agentId.trim().toLowerCase();
  if (normalized === "codex" || normalized === "claude") return [prompt];
  if (normalized === "gemini" || normalized === "qwen") return ["-i", prompt];
  if (normalized === "kiro") return ["chat", prompt];
  if (normalized === "opencode") return ["--prompt", prompt];
  return null;
}

function appendShellArgs(command: string, args: string[]): string {
  const suffix = args.map(shellQuote).join(" ");
  return suffix ? `${command} ${suffix}` : command;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function resolveProtocolOptions(repoPath: string, agentId: string): Promise<{ githubLogin: string; githubUserId: number; machineId: string; agent: string; repo?: string }> {
  const existing = await readExistingProtocolOptions(repoPath);
  const machineId = await getMachineId(repoPath) ?? existing.machineId ?? generateMachineId();
  let identity: GitHubIdentity | null = null;
  if (!existing.githubLogin || !existing.githubUserId) {
    try {
      identity = await resolveGitHubIdentity();
    } catch {
      identity = null;
    }
  }
  return {
    githubLogin: identity?.login ?? existing.githubLogin ?? "unknown",
    githubUserId: identity?.id ?? existing.githubUserId ?? 0,
    machineId,
    agent: agentId,
    repo: await resolveRepoName(repoPath) || existing.repo,
  };
}

async function readExistingProtocolOptions(repoPath: string): Promise<Partial<{ githubLogin: string; githubUserId: number; machineId: string; repo: string }>> {
  let content = "";
  try {
    content = await readFile(join(repoPath, ".sharkbay", "harness", "protocol.md"), "utf-8");
  } catch {
    return {};
  }
  const githubUserId = Number(readProtocolField(content, "GitHub user id"));
  return {
    repo: readProtocolField(content, "Repo") ?? undefined,
    githubLogin: readProtocolField(content, "GitHub login") ?? undefined,
    githubUserId: Number.isFinite(githubUserId) && githubUserId > 0 ? githubUserId : undefined,
    machineId: readProtocolField(content, "Machine id") ?? undefined,
  };
}

function readProtocolField(content: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim() || null;
}

async function ensureProtocolFiles(
  repoPath: string,
  options: { githubLogin: string; githubUserId: number; machineId: string; agent: string; repo?: string },
): Promise<void> {
  const sbDir = join(repoPath, ".sharkbay");
  const harnessDir = join(sbDir, "harness");
  await mkdir(harnessDir, { recursive: true });
  await mkdir(join(sbDir, "tasks"), { recursive: true });
  await mkdir(join(sbDir, "team-context"), { recursive: true });
  await writeFile(join(sbDir, "machine-id"), options.machineId, "utf-8");
  await writeFile(join(harnessDir, "protocol.md"), generateProtocol(options), "utf-8");
  await ensureLocalExclude(repoPath);
}

async function resolveRepoName(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "config", "--get", "remote.origin.url"], { timeout: 3_000 });
    return githubRepoFromRemote(stdout.trim()) ?? "";
  } catch {
    return "";
  }
}

function githubRepoFromRemote(remoteOrigin: string | null): string | null {
  const match = remoteOrigin?.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

function removeTeamworkEntryBlock(existing: string): string {
  const start = existing.indexOf(TEAMWORK_ENTRY_START);
  const end = existing.indexOf(TEAMWORK_ENTRY_END);
  if (start < 0 && end < 0) return existing;
  if (start >= 0) {
    const before = existing.slice(0, start).trimEnd();
    const after = end > start ? existing.slice(end + TEAMWORK_ENTRY_END.length).replace(/^\r?\n/, "") : "";
    return joinEntryParts(before, "", after);
  }
  const after = existing.slice(end + TEAMWORK_ENTRY_END.length).replace(/^\r?\n/, "");
  return after;
}

function joinEntryParts(before: string, block: string, after: string): string {
  const parts = [before.trimEnd(), block.trim(), after.trim()].filter((part) => part.length > 0);
  return parts.length ? `${parts.join("\n\n")}\n` : "";
}

function generateProtocol(opts: { githubLogin: string; githubUserId: number; machineId: string; agent: string; repo?: string }): string {
  return `# SharkBay Harness Protocol

Project:
- Repo: ${opts.repo ?? ""}
- GitHub login: ${opts.githubLogin}
- GitHub user id: ${opts.githubUserId}
- Machine id: ${opts.machineId}
- Local tasks: .sharkbay/tasks/
- Team context mirror: .sharkbay/team-context/
- Team context branch: sharkbay-team-context

## Agent Responsibility

You maintain SharkBay task files directly.
SharkBay reads and displays them.

## Team Context

Synced task records from the team are available in:
.sharkbay/team-context/tasks/**/*.md

Treat .sharkbay/team-context/ as read-only. Write only your own task records
under .sharkbay/tasks/.

Before editing files, making design decisions, or continuing work that may
overlap with prior team work, search the team context mirror.

Useful searches:
- rg "browser fullscreen" .sharkbay/team-context/tasks
- rg "docs/shared/teamwork-design.html" .sharkbay/team-context/tasks
- rg "issue #123" .sharkbay/team-context/tasks

If a previous task affects the current work, read that task record and mention
its taskId in the current task's Work Summary or Notes For Future Agents.

## When To Create Or Update A Task

Create or update a SharkBay task file before performing a persistent
project-changing unit of work.

Project-changing work includes:
- editing files
- generating a persisted project artifact
- running a multi-step implementation or verification workflow
- preparing a commit
- turning an accepted issue or request into local work

Discussion, explanation, code reading, and design exploration can remain outside
task tracking until the user asks to record it or implementation begins.

## Task Identity

Use one task file per logical task.

- taskTag: 6 uppercase characters, for example A7K3P9
- taskId: <taskTag>-u<githubUserId>-m<machineId>
- filename: .sharkbay/tasks/<taskId>-<slug>.md
- slug: short lowercase words joined with hyphens

Example:
.sharkbay/tasks/A7K3P9-u${opts.githubUserId}-m${opts.machineId}-update-teamwork-design.md

## Mode

Use mode: quick for small, direct edits.
Use mode: task for broader work that needs a clearer summary, verification,
or commit context.

## Status

Use one of:
- active
- paused
- completed
- blocked
- abandoned

## Required Frontmatter

---
kind: sharkbay_task
taskId: A7K3P9-u${opts.githubUserId}-m${opts.machineId}
taskTag: A7K3P9
mode: task
title: Update teamwork design
status: active
actor: ${opts.githubLogin}
githubUserId: ${opts.githubUserId}
machine: ${opts.machineId}
agent: # e.g. Codex GPT-5.5
branch: main
createdAt: 2026-05-15T10:30:00Z
updatedAt: 2026-05-15T10:30:00Z
---

Use the actual task executor identity in \`agent\`, for example:
- Codex GPT-5.5
- Kiro Claude 4.6
- Claude Code Sonnet 4.5
- Gemini CLI 2.5 Pro

Set \`branch\` to the current Git branch when the task is created. Keep that
original task-creation branch even if later work switches branches.

When the task is ready for team sync, add:

status: completed
completedAt: 2026-05-15T11:40:00Z
commit: abc1234

## Required Sections

## Summary
One or two sentences describing the task outcome.

## Files
- path/to/changed-file

## Work
- Concise bullet describing meaningful work.
- Concise bullet describing meaningful decision or result.

## Verification
- Command, check, review, or reason verification was not run.

## Notes
- Context useful to future agents.

## Update Rules

Update the task file when:
- the task starts
- changed files become clear
- the work summary changes materially
- verification is run or intentionally skipped
- the task becomes blocked, abandoned, or ready to sync

Keep task files concise. Summarize work; keep raw chat transcripts in the CLI's
own session history.

## Sync Readiness

Before setting status: completed, make sure:
- Summary describes the outcome
- Files lists changed project files
- Work captures the important steps or decisions
- Verification is filled
- commit is present when the task produced a commit

## Safety

Keep unrelated dirty files untouched.
Ask the user when task boundaries are unclear.
Keep secrets, credentials, tokens, customer data, and private transcripts out of
task files.
`;
}
