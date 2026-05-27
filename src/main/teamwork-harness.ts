import { access, chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
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
const AGENT_SESSION_ID_SCRIPT = [
  "#!/bin/sh",
  "set -eu",
  "",
  "agent=\"$(printf '%s' \"${1:-}\" | tr '[:upper:]' '[:lower:]')\"",
  "",
  "if [ -n \"${SHARKBAY_RESTORED_SESSION_ID:-}\" ]; then",
  "  printf '%s\\n' \"$SHARKBAY_RESTORED_SESSION_ID\"",
  "  exit 0",
  "fi",
  "",
  "case \"$agent\" in",
  "  *kiro*)",
  "    pid=\"$PPID\"",
  "    kiro_pid=\"\"",
  "    while [ -n \"$pid\" ] && [ \"$pid\" != \"1\" ]; do",
  "      cmd=\"$(ps -o command= -p \"$pid\" 2>/dev/null || true)\"",
  "      case \"$cmd\" in",
  "        *kiro-cli*|*kiro_cli*|*Kiro\\ CLI*) kiro_pid=\"$pid\"; break ;;",
  "      esac",
  "      pid=\"$(ps -o ppid= -p \"$pid\" 2>/dev/null | tr -d ' ' || true)\"",
  "    done",
  "    if [ -z \"$kiro_pid\" ]; then",
  "      echo \"kiro process not found\" >&2",
  "      exit 1",
  "    fi",
  "    for lock in \"$HOME\"/.kiro/sessions/cli/*.lock; do",
  "      [ -f \"$lock\" ] || continue",
  "      lock_pid=\"$(sed -n 's/.*\"pid\":\\([0-9][0-9]*\\).*/\\1/p' \"$lock\")\"",
  "      [ \"$lock_pid\" = \"$kiro_pid\" ] || continue",
  "      session_id=\"$(basename \"$lock\" .lock)\"",
  "      meta=\"$HOME/.kiro/sessions/cli/$session_id.json\"",
  "      cwd=\"$(sed -n 's/.*\"cwd\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' \"$meta\" 2>/dev/null)\"",
  "      if [ \"$cwd\" = \"$PWD\" ]; then",
  "        printf '%s\\n' \"$session_id\"",
  "        exit 0",
  "      fi",
  "    done",
  "    echo \"kiro session id not found\" >&2",
  "    exit 1",
  "    ;;",
  "  *deepseek*)",
  "    audit=\"$HOME/.deepseek/audit.log\"",
  "    if [ ! -f \"$audit\" ]; then",
  "      echo \"deepseek audit log not found\" >&2",
  "      exit 1",
  "    fi",
  "    latest_event=\"$(",
  "      tail -n 100 \"$audit\" |",
  "        awk '/\"session_id\"[[:space:]]*:/ { line=$0 } END { if (line) print line }'",
  "    )\"",
  "    session_id=\"$(printf '%s\\n' \"$latest_event\" | sed -n 's/.*\"session_id\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p')\"",
  "    if [ -z \"$session_id\" ]; then",
  "      echo \"deepseek session id not found\" >&2",
  "      exit 1",
  "    fi",
  "    meta=\"$HOME/.deepseek/sessions/$session_id.json\"",
  "    if [ ! -f \"$meta\" ]; then",
  "      echo \"deepseek session metadata not found\" >&2",
  "      exit 1",
  "    fi",
  "    workspace=\"$(sed -n 's/.*\"workspace\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' \"$meta\" 2>/dev/null | head -n 1)\"",
  "    if [ \"$workspace\" != \"$PWD\" ]; then",
  "      echo \"deepseek session workspace mismatch\" >&2",
  "      exit 1",
  "    fi",
  "    printf '%s\\n' \"$session_id\"",
  "    exit 0",
  "    ;;",
  "  *opencode*)",
  "    pid=\"$PPID\"",
  "    opencode_pid=\"\"",
  "    while [ -n \"$pid\" ] && [ \"$pid\" != \"1\" ]; do",
  "      cmd=\"$(ps -o command= -p \"$pid\" 2>/dev/null || true)\"",
  "      case \"$cmd\" in",
  "        *opencode*) opencode_pid=\"$pid\"; break ;;",
  "      esac",
  "      pid=\"$(ps -o ppid= -p \"$pid\" 2>/dev/null | tr -d ' ' || true)\"",
  "    done",
  "    if [ -z \"$opencode_pid\" ]; then",
  "      echo \"opencode process not found\" >&2",
  "      exit 1",
  "    fi",
  "    log_files=\"$(",
  "      lsof -p \"$opencode_pid\" 2>/dev/null |",
  "        awk '/\\/\\.local\\/share\\/opencode\\/log\\/.*\\.log$/ {print $NF}' |",
  "        sort -u",
  "    )\"",
  "    if [ -z \"$log_files\" ]; then",
  "      echo \"opencode log not found\" >&2",
  "      exit 1",
  "    fi",
  "    for log in $log_files; do",
  "      [ -f \"$log\" ] || continue",
  "      session_id=\"$(",
  "        tail -n 1000 \"$log\" |",
  "          sed -n -e 's/.*session\\.id=\\(ses_[^[:space:]]*\\).*/\\1/p' -e 's/.*service=session id=\\(ses_[^[:space:]]*\\).*/\\1/p' |",
  "          tail -n 1",
  "      )\"",
  "      [ -n \"$session_id\" ] || continue",
  "      db_row=\"$(opencode db \"select id, directory, path from session where id = '$session_id' limit 1\" --format json 2>/dev/null || true)\"",
  "      directory=\"$(printf '%s\\n' \"$db_row\" | sed -n 's/.*\"directory\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' | head -n 1)\"",
  "      path_value=\"$(printf '%s\\n' \"$db_row\" | sed -n 's/.*\"path\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' | head -n 1)\"",
  "      if [ \"$directory\" = \"$PWD\" ] || [ \"$path_value\" = \"$PWD\" ]; then",
  "        printf '%s\\n' \"$session_id\"",
  "        exit 0",
  "      fi",
  "    done",
  "    echo \"opencode session id not found\" >&2",
  "    exit 1",
  "    ;;",
  "  *claude*|*gemini*|*qwen*)",
  "    if [ -z \"${SHARKBAY_SESSION_ID:-}\" ]; then",
  "      echo \"SHARKBAY_SESSION_ID not set\" >&2",
  "      exit 1",
  "    fi",
  "    printf '%s\\n' \"$SHARKBAY_SESSION_ID\"",
  "    exit 0",
  "    ;;",
  "  *codex*) ;;",
  "  *)",
  "    echo \"usage: $0 codex|claude|deepseek|gemini|kiro|opencode|qwen\" >&2",
  "    exit 64",
  "    ;;",
  "esac",
  "",
  "transcript=\"$(",
  "  lsof -p \"$PPID\" 2>/dev/null |",
  "    awk '/\\/\\.codex\\/sessions\\/.*\\.jsonl$/ {print $NF; exit}'",
  ")\"",
  "",
  "if [ -z \"$transcript\" ]; then",
  "  echo \"codex session transcript not found\" >&2",
  "  exit 1",
  "fi",
  "",
  "session_id=\"$(",
  "  head -n 1 \"$transcript\" |",
  "    sed -n 's/.*\"payload\":{\"id\":\"\\([^\"]*\\)\".*/\\1/p'",
  ")\"",
  "",
  "if [ -z \"$session_id\" ]; then",
  "  echo \"codex session id not found\" >&2",
  "  exit 1",
  "fi",
  "",
  "printf '%s\\n' \"$session_id\"",
].join("\n") + "\n";
const TEAMWORK_BOOTSTRAP_INTRO = [
  "I'm working in SharkBay Teamwork mode for this project.",
  "Please read `.sharkbay/harness/protocol.md` first and follow it for the rest of this session.",
];

const TEAMWORK_BOOTSTRAP_CODEGRAPH_PROMPT = "CodeGraph is installed and configured for this project; when searching or understanding project code, use CodeGraph before rg/grep/ broad file reads.";

const TEAMWORK_BOOTSTRAP_TASK_PROMPT = [
  "If a later request involves editing project files, generating persisted project artifacts, running a multi-step implementation or verification workflow, or preparing a commit, create or update the required task under `.sharkbay/tasks/` before making project changes.",
  "Keep Files and Work updated while working; finish by filling Summary and Verification; record the commit hash if a commit is produced.",
  "Treat `.sharkbay/team-context/` as read-only.",
];

export type TeamworkBootstrapPromptOptions = {
  codeGraphEnabled?: boolean;
};

export function teamworkBootstrapPrompt(options: TeamworkBootstrapPromptOptions = {}): string {
  return [
    ...TEAMWORK_BOOTSTRAP_INTRO,
    ...(options.codeGraphEnabled ? [TEAMWORK_BOOTSTRAP_CODEGRAPH_PROMPT] : []),
    ...TEAMWORK_BOOTSTRAP_TASK_PROMPT,
  ].join(" ");
}

export const TEAMWORK_BOOTSTRAP_PROMPT = teamworkBootstrapPrompt();

export type GitHubIdentity = {
  login: string;
  id: number;
  avatarUrl: string;
};

type ProtocolOptions = {
  githubLogin: string;
  githubUserId: number;
  machineId: string;
  agent: string;
  repo?: string;
};

type ManagedHarnessFile = {
  path: string;
  content: string;
  executable?: boolean;
};

export type TeamworkHarnessFileIssue = {
  path: string;
  reason: "missing" | "changed";
};

export type TeamworkHarnessUpdateStatus = {
  required: boolean;
  files: TeamworkHarnessFileIssue[];
};

export type TeamworkLocalIdentity = {
  githubLogin?: string;
  githubUserId?: number;
  machineId?: string;
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

function managedHarnessFiles(options: ProtocolOptions): ManagedHarnessFile[] {
  return [
    {
      path: ".sharkbay/harness/protocol.md",
      content: generateProtocol(options),
    },
    {
      path: ".sharkbay/harness/agent-session-id.sh",
      content: AGENT_SESSION_ID_SCRIPT,
      executable: true,
    },
  ];
}

async function writeManagedHarnessFiles(repoPath: string, options: ProtocolOptions): Promise<void> {
  const sbDir = join(repoPath, ".sharkbay");
  const harnessDir = join(sbDir, "harness");

  await mkdir(harnessDir, { recursive: true });
  await mkdir(join(sbDir, "tasks"), { recursive: true });
  await mkdir(join(sbDir, "team-context"), { recursive: true });

  await writeFile(join(sbDir, "machine-id"), options.machineId, "utf-8");
  for (const file of managedHarnessFiles(options)) {
    await writeFile(join(repoPath, file.path), file.content, "utf-8");
    if (file.executable) await chmod(join(repoPath, file.path), 0o755);
  }
}

export async function getHarnessUpdateStatus(repoPath: string): Promise<TeamworkHarnessUpdateStatus> {
  if (!await hasSharkbayHarnessDir(repoPath)) return { required: false, files: [] };
  const options = await resolveProtocolOptions(repoPath, "", { resolveIdentity: false, generateMachineId: false });
  return compareManagedHarnessFiles(repoPath, options);
}

export async function updateHarnessFiles(repoPath: string): Promise<TeamworkHarnessUpdateStatus> {
  await assertHarnessInstallable(repoPath);
  const options = await resolveProtocolOptions(repoPath, "", { resolveIdentity: true, generateMachineId: true });
  await writeManagedHarnessFiles(repoPath, options);
  await ensureLocalExclude(repoPath);
  return compareManagedHarnessFiles(repoPath, options);
}

export async function installHarness(
  repoPath: string,
  options: ProtocolOptions,
): Promise<void> {
  await assertHarnessInstallable(repoPath);

  await writeManagedHarnessFiles(repoPath, options);
  await backupLocalExclude(repoPath, join(repoPath, ".sharkbay", "harness"));
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

export async function getLocalHarnessIdentity(repoPath: string): Promise<TeamworkLocalIdentity> {
  const existing = await readExistingProtocolOptions(repoPath);
  return {
    githubLogin: existing.githubLogin,
    githubUserId: existing.githubUserId,
    machineId: await getMachineId(repoPath) ?? existing.machineId,
  };
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

async function compareManagedHarnessFiles(repoPath: string, options: ProtocolOptions): Promise<TeamworkHarnessUpdateStatus> {
  const files: TeamworkHarnessFileIssue[] = [];
  for (const file of managedHarnessFiles(options)) {
    const filePath = join(repoPath, file.path);
    let current: string;
    try {
      current = await readFile(filePath, "utf-8");
    } catch {
      files.push({ path: file.path, reason: "missing" });
      continue;
    }

    let changed = current !== file.content;
    if (!changed && file.executable) {
      try {
        const fileStat = await stat(filePath);
        changed = (fileStat.mode & 0o111) === 0;
      } catch {
        changed = true;
      }
    }
    if (changed) files.push({ path: file.path, reason: "changed" });
  }

  return { required: files.length > 0, files };
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
  bootstrapPrompt?: string;
  skippedReason?: "not-installed" | "unsupported-agent";
};

export async function prepareTeamworkAgentLaunch(
  repoPath: string,
  agentId: string,
  initialCommand: string,
  options: TeamworkBootstrapPromptOptions = {},
): Promise<TeamworkAgentLaunchResult> {
  const bootstrapPrompt = teamworkBootstrapPrompt(options);
  const bootstrapArgs = teamworkBootstrapArgs(agentId, bootstrapPrompt);
  if (!bootstrapArgs) {
    return { initialCommand, injected: false, skippedReason: "unsupported-agent" };
  }
  if (!await hasSharkbayHarnessDir(repoPath)) {
    return { initialCommand, injected: false, skippedReason: "not-installed" };
  }

  return { initialCommand: appendShellArgs(withLaunchSessionId(agentId, initialCommand), bootstrapArgs), injected: true, bootstrapPrompt };
}

async function hasSharkbayHarnessDir(repoPath: string): Promise<boolean> {
  try {
    await access(join(repoPath, ".sharkbay"));
    return true;
  } catch {
    return false;
  }
}

function teamworkBootstrapArgs(agentId: string, prompt: string): string[] | null {
  const normalized = agentId.trim().toLowerCase();
  if (normalized === "codex" || normalized === "claude") return [prompt];
  if (normalized === "deepseek") return [];
  if (normalized === "gemini" || normalized === "qwen") return ["-i", prompt];
  if (normalized === "kiro") return ["chat", prompt];
  if (normalized === "opencode") return [];
  return null;
}

function withLaunchSessionId(agentId: string, command: string): string {
  const normalized = agentId.trim().toLowerCase();
  if (normalized !== "claude" && normalized !== "gemini" && normalized !== "qwen") return command;
  const sessionId = randomUUID();
  return `SHARKBAY_SESSION_ID=${shellQuote(sessionId)} ${appendShellArgs(command, ["--session-id", sessionId])}`;
}

function appendShellArgs(command: string, args: string[]): string {
  const suffix = args.map(shellQuote).join(" ");
  return suffix ? `${command} ${suffix}` : command;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function resolveProtocolOptions(
  repoPath: string,
  agentId: string,
  options: { resolveIdentity?: boolean; generateMachineId?: boolean } = {},
): Promise<ProtocolOptions> {
  const existing = await readExistingProtocolOptions(repoPath);
  const shouldResolveIdentity = options.resolveIdentity ?? true;
  const machineId = await getMachineId(repoPath)
    ?? existing.machineId
    ?? (options.generateMachineId === false ? "unknown" : generateMachineId());
  let identity: GitHubIdentity | null = null;
  if (shouldResolveIdentity && (!existing.githubLogin || !existing.githubUserId)) {
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

## Code Intelligence

This project has CodeGraph installed and configured. When searching code,
prefer CodeGraph over \`rg\`, \`grep\`, or broad file reads:
- \`codegraph query <symbol-or-name>\`
- \`codegraph callers <symbol>\`
- \`codegraph callees <symbol>\`
- \`codegraph impact <symbol>\`
- \`codegraph affected <changed-files>\`

Use \`codegraph context "what you need to understand"\` only for initial
exploration when no clear symbol or file is known.

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
sessionId: # omit this line if unavailable
branch: main
createdAt: 2026-05-15T10:30:00Z
updatedAt: 2026-05-15T10:30:00Z
---

Use the actual task executor identity in \`agent\`, for example:
- Codex GPT-5.5
- Kiro Claude 4.6
- Claude Code Sonnet 4.5
- Gemini CLI 2.5 Pro

When creating a task, run \`.sharkbay/harness/agent-session-id.sh "<agent>"\`.
If it prints a session id, add \`sessionId: <id>\` immediately after
\`agent\`. If it fails or prints no id, omit the \`sessionId\` line.

Set \`branch\` to the current Git branch when the task is created. Keep that
original task-creation branch even if later work switches branches.

Before creating or updating any task file, run:

\`date -u +%Y-%m-%dT%H:%M:%SZ\`

Use that output verbatim for \`createdAt\`, \`updatedAt\`, and \`completedAt\`
when those fields are written or changed.

Never estimate, round, backfill, or fabricate timestamps.

When the task is ready for team sync, add:

status: completed
completedAt: 2026-05-15T11:40:00Z
commits:
  - abc1234
  - def5678

List every commit produced by the task, in chronological order.
A task may produce multiple commits (iterative fixes, follow-up adjustments).
All related commits must be recorded so the full change context is preserved,
even when commits from other concurrent tasks are interleaved.

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
- commits lists all commits produced by the task (if any)

## Safety

Keep unrelated dirty files untouched.
Ask the user when task boundaries are unclear.
Keep secrets, credentials, tokens, customer data, and private transcripts out of
task files.
`;
}
