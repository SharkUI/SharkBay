import { access, mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);
const ROOT_ADAPTER_FILES = ["AGENTS.md"] as const;
const LEGACY_ROOT_ADAPTER_FILES = ["CLAUDE.md", "GEMINI.md"] as const;
const LEGACY_INSTRUCTION_FILES = ["codex.md", "claude.md", "gemini.md"] as const;
const GENERATED_MARKER = "<!-- sharkbay-generated: true -->";
const EXCLUDE_ENTRIES = ["/.sharkbay/", ...ROOT_ADAPTER_FILES.map((name) => `/${name}`)];
const LEGACY_EXCLUDE_ENTRIES = LEGACY_ROOT_ADAPTER_FILES.map((name) => `/${name}`);
const EXCLUDE_REMOVAL_ENTRIES = new Set([...EXCLUDE_ENTRIES, ...LEGACY_EXCLUDE_ENTRIES]);
const EXCLUDE_BACKUP_FILE = "git-info-exclude.backup";
const EXCLUDE_MISSING_MARKER = "git-info-exclude.missing";

export type GitHubIdentity = {
  login: string;
  id: number;
  avatarUrl: string;
};

export async function resolveGitHubIdentity(): Promise<GitHubIdentity> {
  const { stdout } = await execFileAsync("gh", ["api", "user", "--jq", ".login + \"\\n\" + (.id|tostring) + \"\\n\" + .avatar_url"], { timeout: 10_000 });
  const [login, id, avatarUrl] = stdout.trim().split("\n");
  if (!login || !id) throw new Error("Failed to resolve GitHub identity from gh CLI");
  return { login: login!, id: Number(id), avatarUrl: avatarUrl ?? "" };
}

export async function checkRepoPermission(repo: string, login: string): Promise<string> {
  const { stdout } = await execFileAsync("gh", ["api", `repos/${repo}/collaborators/${login}/permission`, "--jq", ".permission"], { timeout: 10_000 });
  return stdout.trim();
}

export function generateMachineId(): string {
  return randomBytes(3).toString("hex");
}

export async function installHarness(
  repoPath: string,
  options: { githubLogin: string; githubUserId: number; machineId: string; agent: string; repo?: string },
): Promise<void> {
  await assertHarnessInstallable(repoPath);
  const adapterContent = generateAdapterMd(options.repo ?? "");

  const sbDir = join(repoPath, ".sharkbay");
  const harnessDir = join(sbDir, "harness");
  const tasksDir = join(sbDir, "tasks");
  const teamContextDir = join(sbDir, "team-context");

  await mkdir(harnessDir, { recursive: true });
  await mkdir(tasksDir, { recursive: true });
  await mkdir(teamContextDir, { recursive: true });

  await writeFile(join(sbDir, "machine-id"), options.machineId, "utf-8");
  await writeFile(join(harnessDir, "protocol.md"), generateProtocol(options), "utf-8");

  // Root adapter files. Only SharkBay-generated adapters are overwritten.
  for (const name of ROOT_ADAPTER_FILES) {
    await writeFile(join(repoPath, name), adapterContent, "utf-8");
  }
  await cleanupLegacyAdapters(repoPath);
  await cleanupLegacyInstructionFiles(harnessDir);

  await backupLocalExclude(repoPath, harnessDir);
  await ensureLocalExclude(repoPath);
}

export async function assertHarnessInstallable(repoPath: string): Promise<void> {
  await assertGitWorktree(repoPath);
  await assertRootAdaptersCanBeManaged(repoPath);
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

async function assertRootAdaptersCanBeManaged(repoPath: string): Promise<void> {
  const conflicts: string[] = [];

  for (const name of ROOT_ADAPTER_FILES) {
    try {
      const existing = await readFile(join(repoPath, name), "utf-8");
      if (!existing.includes(GENERATED_MARKER)) {
        conflicts.push(name);
      }
    } catch {
      // Missing adapter is fine; SharkBay can create it.
    }
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Refusing to overwrite existing root instruction file(s): ${conflicts.join(", ")}. ` +
      "Move or merge those files before installing SharkBay Teamwork.",
    );
  }
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

  for (const name of [...ROOT_ADAPTER_FILES, ...LEGACY_ROOT_ADAPTER_FILES]) {
    const removed = await removeGeneratedAdapter(repoPath, name);
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

async function removeGeneratedAdapter(repoPath: string, name: string): Promise<"removed" | "skipped" | "missing"> {
  const filePath = join(repoPath, name);
  let existing: string;
  try {
    existing = await readFile(filePath, "utf-8");
  } catch {
    return "missing";
  }
  if (!existing.includes(GENERATED_MARKER)) return "skipped";
  await rm(filePath, { force: true });
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

  try {
    const backup = await readFile(backupPath, "utf-8");
    const cleaned = cleanLocalExcludeContent(content);
    try {
      await access(join(repoPath, ".sharkbay", "harness", EXCLUDE_MISSING_MARKER));
      await rm(excludePath, { force: true });
    } catch {
      await writeFile(excludePath, backup, "utf-8");
    }
    return cleaned.removedLines;
  } catch {
    return cleanLocalExclude(repoPath, content);
  }
}

async function cleanLocalExclude(repoPath: string, content?: string): Promise<string[]> {
  const excludePath = join(repoPath, ".git", "info", "exclude");
  const original = content ?? await readFile(excludePath, "utf-8").catch(() => "");
  const cleaned = cleanLocalExcludeContent(original);
  if (cleaned.removedLines.length > 0) {
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

async function cleanupLegacyAdapters(repoPath: string): Promise<void> {
  for (const name of LEGACY_ROOT_ADAPTER_FILES) {
    const filePath = join(repoPath, name);
    try {
      const existing = await readFile(filePath, "utf-8");
      if (existing.includes(GENERATED_MARKER)) {
        await rm(filePath);
      }
    } catch {
      // Missing legacy adapter is fine.
    }
  }
}

async function cleanupLegacyInstructionFiles(harnessDir: string): Promise<void> {
  const instructionsDir = join(harnessDir, "instructions");
  await Promise.all(
    LEGACY_INSTRUCTION_FILES.map((name) => rm(join(instructionsDir, name), { force: true })),
  );
  await rmdir(instructionsDir).catch(() => {});
}

function generateAdapterMd(repo: string): string {
  return `<!-- sharkbay-generated: true -->
<!-- sharkbay-local-only: true -->
<!-- sharkbay-project: ${repo} -->
<!-- sharkbay-protocol: .sharkbay/harness/protocol.md -->

# SharkBay Local Agent Entry

This worktree uses SharkBay Teamwork.

Before making persistent project changes, read:

\`.sharkbay/harness/protocol.md\`

If the protocol file exists, follow it for task file naming, frontmatter,
status updates, verification notes, and sync readiness.

If the protocol file is missing or unreadable, ask the user whether to continue
without SharkBay task tracking.
`;
}

function generateProtocol(opts: { githubLogin: string; githubUserId: number; machineId: string; agent: string; repo?: string }): string {
  return `# SharkBay Harness Protocol

Project:
- Repo: ${opts.repo ?? ""}
- GitHub login: ${opts.githubLogin}
- GitHub user id: ${opts.githubUserId}
- Machine id: ${opts.machineId}
- Agent: ${opts.agent}
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
agent: ${opts.agent}
createdAt: 2026-05-15T10:30:00Z
updatedAt: 2026-05-15T10:30:00Z
---

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
