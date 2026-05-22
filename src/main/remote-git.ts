import { getConfiguredRoots } from "./config.js";
import { parseGitDirtyFiles } from "./git.js";
import { remoteShellCommand, runSshCommand, sshArgsForRemoteMachine, type SshCommandRunner } from "./remote-machines.js";
import { createDefaultSecretStore, type SecretStore } from "./secrets.js";
import { parseProjectUri } from "../core/project-uri.js";
import type {
  CreateWorktreeResult,
  GitBranchSummary,
  GitDirtyFile,
  GitEvent,
  GitMetadata,
  IpcRuntimeLike,
  RemoteMachine,
  RemoveWorktreeResult,
  WorktreeStatus,
} from "../shared/types.js";

const gitTimeoutMs = 8000;

type RemoteGitOptions = {
  secretStore?: SecretStore;
  runner?: SshCommandRunner;
};

export async function readRemoteGitMetadata(
  runtime: IpcRuntimeLike,
  projectUri: string,
  options: RemoteGitOptions = {},
): Promise<GitMetadata> {
  const { machine, projectPath } = await resolveRemoteProject(runtime, projectUri);
  try {
    const [gitRoot, currentBranch, defaultBranch, remoteOrigin, status, gitDir, gitCommonDir] = await Promise.all([
      remoteGit(machine, projectPath, ["rev-parse", "--show-toplevel"], options),
      remoteGit(machine, projectPath, ["branch", "--show-current"], options).catch(() => null),
      readRemoteDefaultBranch(machine, projectPath, options),
      remoteGit(machine, projectPath, ["config", "--get", "remote.origin.url"], options).catch(() => null),
      remoteGit(machine, projectPath, ["status", "--porcelain"], options).catch(() => null),
      remoteGit(machine, projectPath, ["rev-parse", "--absolute-git-dir"], options).catch(() => null),
      remoteGit(machine, projectPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"], options).catch(() => null),
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
    return emptyGitMetadata();
  }
}

export async function readRemoteGitBranches(
  runtime: IpcRuntimeLike,
  projectUri: string,
  options: RemoteGitOptions = {},
): Promise<GitBranchSummary> {
  const { machine, projectPath } = await resolveRemoteProject(runtime, projectUri);
  const [currentRaw, locals, remotes] = await Promise.all([
    remoteGit(machine, projectPath, ["branch", "--show-current"], options).catch(() => ""),
    remoteGit(machine, projectPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads"], options).catch(() => ""),
    remoteGit(machine, projectPath, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"], options).catch(() => ""),
  ]);
  const parseLines = (raw: string) => raw.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    current: currentRaw ? currentRaw : null,
    localBranches: parseLines(locals),
    remoteBranches: parseLines(remotes).filter((line) => !line.endsWith("/HEAD")),
  };
}

export async function remoteAddWorktree(
  runtime: IpcRuntimeLike,
  projectUri: string,
  input: { branch: string; base: string; targetPath: string },
  options: RemoteGitOptions = {},
): Promise<CreateWorktreeResult> {
  const { branch, base, targetPath } = input;
  if (!isValidBranchName(branch)) {
    return { ok: false, reason: "invalid-name", message: `Invalid branch name: ${branch}` };
  }
  if (!targetPath.startsWith("/")) {
    return { ok: false, reason: "invalid-name", message: "Remote worktree path must be absolute" };
  }
  const { machine, projectPath } = await resolveRemoteProject(runtime, projectUri);
  const exists = await remoteShellExists(machine, targetPath, options);
  if (exists) {
    return { ok: false, reason: "target-exists", message: `Directory already exists on remote: ${targetPath}` };
  }
  const branchRefExists = await remoteGit(machine, projectPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], options)
    .then(() => true)
    .catch(() => false);
  if (branchRefExists) {
    return { ok: false, reason: "branch-exists", message: `Branch already exists on remote: ${branch}` };
  }
  try {
    await remoteGit(machine, projectPath, ["worktree", "add", "-b", branch, targetPath, base], options);
  } catch (error) {
    return { ok: false, reason: "git-error", message: extractRemoteMessage(error) };
  }
  return { ok: true, targetPath, newProjectUri: "", branch };
}

export async function readRemoteWorktreeStatus(
  runtime: IpcRuntimeLike,
  projectUri: string,
  options: RemoteGitOptions = {},
): Promise<WorktreeStatus> {
  const { machine, projectPath } = await resolveRemoteProject(runtime, projectUri);
  const branch = await remoteGit(machine, projectPath, ["branch", "--show-current"], options).catch(() => "");
  if (!branch) {
    return { branch: null, base: null, ahead: null, behind: null, dirtyCount: null, hasUpstream: false };
  }
  const upstream = await remoteGit(machine, projectPath, ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`], options).catch(() => "");
  let base: string | null = upstream || null;
  const hasUpstream = Boolean(upstream);
  if (!base) {
    const defaultBranchRef = await remoteGit(machine, projectPath, ["symbolic-ref", "refs/remotes/origin/HEAD"], options).catch(() => "");
    if (defaultBranchRef) {
      base = defaultBranchRef.replace(/^refs\/remotes\//, "");
    } else {
      base = await remoteGit(machine, projectPath, ["config", "--get", "init.defaultBranch"], options).catch(() => "") || null;
    }
  }
  let ahead: number | null = null;
  let behind: number | null = null;
  if (base) {
    const counts = await remoteGit(machine, projectPath, ["rev-list", "--left-right", "--count", `${base}...HEAD`], options).catch(() => "");
    if (counts) {
      const [behindStr, aheadStr] = counts.split(/\s+/u);
      const behindNum = Number(behindStr);
      const aheadNum = Number(aheadStr);
      if (Number.isFinite(behindNum)) behind = behindNum;
      if (Number.isFinite(aheadNum)) ahead = aheadNum;
    }
  }
  const dirty = await remoteGit(machine, projectPath, ["status", "--porcelain"], options).catch(() => "");
  const dirtyCount = dirty ? dirty.split("\n").filter((line) => line.trim().length > 0).length : 0;
  return { branch, base, ahead, behind, dirtyCount, hasUpstream };
}

export async function removeRemoteWorktree(
  runtime: IpcRuntimeLike,
  projectUri: string,
  options: RemoteGitOptions & { force?: boolean } = {},
): Promise<RemoveWorktreeResult> {
  const { machine, projectPath } = await resolveRemoteProject(runtime, projectUri);
  const secretStore = options.secretStore ?? createDefaultSecretStore();
  const password = machine.authMode === "password" && machine.passwordSecretId
    ? (await secretStore.get(machine.passwordSecretId)) ?? null
    : null;
  const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
  if (!sshArgs.length) {
    return { ok: false, reason: "git-error", message: "Remote machine SSH connection details are incomplete" };
  }
  const forceFlag = options.force ? " --force" : "";
  const script = `cd ${shellQuote(projectPath)} && main_git=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && [ -n "$main_git" ] && cd "$main_git/.." && git worktree remove${forceFlag} ${shellQuote(projectPath)}`;
  const args = [
    "-o", password ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    ...sshArgs,
    "--",
    remoteShellCommand(script),
  ];
  const runner = options.runner ?? runSshCommand;
  try {
    await runner(args, gitTimeoutMs, password ? { password } : undefined);
    return { ok: true };
  } catch (error) {
    const message = extractRemoteMessage(error);
    if (/contains modified or untracked|locked/i.test(message)) {
      const dirty = await remoteGit(machine, projectPath, ["status", "--porcelain"], options).catch(() => "");
      const dirtyCount = dirty ? dirty.split("\n").filter((line) => line.trim().length > 0).length : 0;
      return { ok: false, reason: "dirty", message, dirtyCount };
    }
    if (/not a working tree|not a git repository/i.test(message)) {
      return { ok: false, reason: "not-worktree", message };
    }
    return { ok: false, reason: "git-error", message };
  }
}

export async function readRemoteWorktreeInfoForMachine(
  machine: RemoteMachine,
  projectPath: string,
  options: RemoteGitOptions = {},
): Promise<{ isLinkedWorktree: boolean | null; worktreeBranch: string | null }> {
  const secretStore = options.secretStore ?? createDefaultSecretStore();
  const password = machine.authMode === "password" && machine.passwordSecretId
    ? (await secretStore.get(machine.passwordSecretId)) ?? null
    : null;
  const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
  if (!sshArgs.length) return { isLinkedWorktree: null, worktreeBranch: null };
  const cd = `cd ${shellQuote(projectPath)}`;
  const script = `${cd} && d=$(git rev-parse --absolute-git-dir 2>/dev/null); c=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); b=$(git branch --show-current 2>/dev/null); printf '%s\\n%s\\n%s\\n' "$d" "$c" "$b"`;
  const args = [
    "-o", password ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    ...sshArgs,
    "--",
    remoteShellCommand(script),
  ];
  const runner = options.runner ?? runSshCommand;
  try {
    const result = await runner(args, gitTimeoutMs, password ? { password } : undefined);
    const [gitDir, gitCommonDir, branch] = result.stdout.split("\n").map((line) => line.trim());
    if (!gitDir || !gitCommonDir) return { isLinkedWorktree: null, worktreeBranch: null };
    const isLinkedWorktree = gitDir !== gitCommonDir;
    return {
      isLinkedWorktree,
      worktreeBranch: isLinkedWorktree && branch ? branch : null,
    };
  } catch {
    return { isLinkedWorktree: null, worktreeBranch: null };
  }
}

async function remoteShellExists(
  machine: RemoteMachine,
  remotePath: string,
  options: RemoteGitOptions,
): Promise<boolean> {
  const secretStore = options.secretStore ?? createDefaultSecretStore();
  const password = machine.authMode === "password" && machine.passwordSecretId
    ? (await secretStore.get(machine.passwordSecretId)) ?? null
    : null;
  const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
  if (!sshArgs.length) throw new Error("Remote machine SSH connection details are incomplete");
  const args = [
    "-o", password ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    ...sshArgs,
    "--",
    remoteShellCommand(`if [ -e ${shellQuote(remotePath)} ]; then echo exists; else echo missing; fi`),
  ];
  const runner = options.runner ?? runSshCommand;
  const result = await runner(args, gitTimeoutMs, password ? { password } : undefined);
  return result.stdout.trim() === "exists";
}

function isValidBranchName(value: string): boolean {
  if (!value || value.length > 200) return false;
  if (/[\s~^:?*\[\\]/u.test(value)) return false;
  if (value.startsWith("-") || value.startsWith(".") || value.endsWith(".") || value.endsWith("/")) return false;
  if (value.includes("..") || value.includes("//")) return false;
  return true;
}

function extractRemoteMessage(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function readRemoteGitHistory(
  runtime: IpcRuntimeLike,
  projectUri: string,
  limit = 50,
  options: RemoteGitOptions = {},
): Promise<GitEvent[]> {
  const { machine, projectPath } = await resolveRemoteProject(runtime, projectUri);
  const raw = await remoteGit(machine, projectPath, [
    "reflog",
    "--date=iso-strict",
    "--format=%H%x1f%gd%x1f%gs%x1f%cd",
    `-n${limit}`,
  ], options).catch(() => "");

  if (!raw) return [];
  return raw.split("\n").flatMap((line) => {
    const [hash, selector, action, date] = line.split("\x1f");
    if (!hash || !selector || !action || !date) return [];
    return [{ hash, selector, action, date }];
  });
}

export async function readRemoteGitDirtyFiles(
  runtime: IpcRuntimeLike,
  projectUri: string,
  options: RemoteGitOptions = {},
): Promise<GitDirtyFile[]> {
  const { machine, projectPath } = await resolveRemoteProject(runtime, projectUri);
  const raw = await remoteGit(machine, projectPath, ["status", "--porcelain=v1", "-uall"], options).catch(() => "");
  return parseGitDirtyFiles(raw);
}

async function readRemoteDefaultBranch(
  machine: RemoteMachine,
  projectPath: string,
  options: RemoteGitOptions,
): Promise<string | null> {
  const symbolic = await remoteGit(machine, projectPath, ["symbolic-ref", "refs/remotes/origin/HEAD"], options).catch(() => null);
  if (symbolic) return symbolic.replace(/^refs\/remotes\/origin\//, "");
  return remoteGit(machine, projectPath, ["config", "--get", "init.defaultBranch"], options).catch(() => null);
}

async function resolveRemoteProject(
  runtime: IpcRuntimeLike,
  projectUri: string,
): Promise<{ machine: RemoteMachine; projectPath: string }> {
  const parsed = parseProjectUri(projectUri);
  if (parsed.kind !== "ssh") throw new Error("Project URI is not an SSH project");
  const config = await getConfiguredRoots(runtime);
  const machine = config.configuredRemoteMachines.find((item) => item.id === parsed.machineId);
  if (!machine) throw new Error(`Remote machine "${parsed.machineId}" is not configured`);
  return { machine, projectPath: parsed.path };
}

async function remoteGit(
  machine: RemoteMachine,
  projectPath: string,
  gitArgs: string[],
  options: RemoteGitOptions,
): Promise<string> {
  const secretStore = options.secretStore ?? createDefaultSecretStore();
  const password = machine.authMode === "password" && machine.passwordSecretId
    ? (await secretStore.get(machine.passwordSecretId)) ?? null
    : null;
  const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
  if (!sshArgs.length) throw new Error("Remote machine SSH connection details are incomplete");
  const args = [
    "-o", password ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    ...sshArgs,
    "--",
    remoteShellCommand(`git -C ${shellQuote(projectPath)} ${gitArgs.map(shellQuote).join(" ")}`),
  ];
  const runner = options.runner ?? runSshCommand;
  const result = await runner(args, gitTimeoutMs, password ? { password } : undefined);
  return result.stdout.trimEnd();
}

function emptyGitMetadata(): GitMetadata {
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
