import { getConfiguredRoots } from "./config.js";
import { parseGitDirtyFiles } from "./git.js";
import { remoteShellCommand, runSshCommand, sshArgsForRemoteMachine, type SshCommandRunner } from "./remote-machines.js";
import { createDefaultSecretStore, type SecretStore } from "./secrets.js";
import { parseProjectUri } from "../core/project-uri.js";
import type { GitDirtyFile, GitEvent, GitMetadata, IpcRuntimeLike, RemoteMachine } from "../shared/types.js";

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
    const [gitRoot, currentBranch, defaultBranch, remoteOrigin, status] = await Promise.all([
      remoteGit(machine, projectPath, ["rev-parse", "--show-toplevel"], options),
      remoteGit(machine, projectPath, ["branch", "--show-current"], options).catch(() => null),
      readRemoteDefaultBranch(machine, projectPath, options),
      remoteGit(machine, projectPath, ["config", "--get", "remote.origin.url"], options).catch(() => null),
      remoteGit(machine, projectPath, ["status", "--porcelain"], options).catch(() => null),
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
    return emptyGitMetadata();
  }
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
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
