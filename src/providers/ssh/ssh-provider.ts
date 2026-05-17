import path from "node:path";
import { EventEmitter } from "node:events";
import { getConfiguredRoots } from "../../main/config.js";
import { listRemoteProjectFiles, readRemoteProjectFile, writeRemoteProjectFile } from "../../main/remote-files.js";
import { readRemoteGitDirtyFiles, readRemoteGitHistory, readRemoteGitMetadata } from "../../main/remote-git.js";
import { remoteShellCommand, runSshCommand, sshArgsForRemoteMachine, type SshCommandRunner } from "../../main/remote-machines.js";
import { createDefaultSecretStore, type SecretStore } from "../../main/secrets.js";
import { TerminalManager } from "../../main/terminal.js";
import type {
  ExecutionTarget,
  GitDirtyFile,
  GitEvent,
  GitMetadata,
  IpcRuntimeLike,
  MachineProfile,
  PathExistsInput,
  PathExistsResult,
  ProfileReadOptions,
  ProjectFilesInput,
  ProjectFilesResult,
  ProjectProfile,
  ProjectScanInput,
  ReadFileInput,
  ReadFileResult,
  RemoteMachine,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  WriteFileInput,
  WriteFileResult,
} from "../../shared/types.js";
import type {
  CommandResult,
  ExecutionProvider,
  MachineProbeContext,
  ProjectProbeContext,
  RunCommandOptions,
} from "../../core/execution-provider.js";
import { parseProjectUri } from "../../core/project-uri.js";

export type DiagnosticsTap = {
  recordSshLatency(latencyMs: number, ok: boolean): void;
};

export class SshProvider extends EventEmitter implements ExecutionProvider {
  readonly id = "ssh";
  readonly kind = "ssh" as const;
  readonly label = "SSH";

  private readonly terminalManager: TerminalManager;
  private readonly secretStore: SecretStore;
  private readonly runner: SshCommandRunner;
  private diagnostics: DiagnosticsTap | null = null;

  constructor(options: { terminalManager?: TerminalManager; secretStore?: SecretStore; runner?: SshCommandRunner } = {}) {
    super();
    this.terminalManager = options.terminalManager ?? new TerminalManager();
    this.secretStore = options.secretStore ?? createDefaultSecretStore();
    this.runner = options.runner ?? runSshCommand;
    this.terminalManager.on("data", (event) => this.emit("terminalData", event));
    this.terminalManager.on("update", (event) => this.emit("terminalUpdate", event));
    this.terminalManager.on("exit", (event) => this.emit("terminalExit", event));
  }

  setDiagnosticsCollector(diagnostics: DiagnosticsTap): void {
    this.diagnostics = diagnostics;
  }

  async resolveTarget(runtime: IpcRuntimeLike, uriOrTargetId: string): Promise<ExecutionTarget> {
    const machineId = uriOrTargetId.startsWith("ssh://") ? parseProjectUri(uriOrTargetId).targetId : uriOrTargetId;
    const machine = await this.resolveMachine(runtime, machineId);
    return targetFromMachine(machine);
  }

  scanProjects(_runtime: IpcRuntimeLike, _input?: ProjectScanInput): Promise<ScanProjectsResult> {
    return Promise.resolve({ roots: [], candidates: [] });
  }

  listProjectFiles(runtime: IpcRuntimeLike, input: ProjectFilesInput): Promise<ProjectFilesResult> {
    return listRemoteProjectFiles(runtime, input, { secretStore: this.secretStore, runner: this.runner });
  }

  readProjectFile(runtime: IpcRuntimeLike, input: ReadFileInput): Promise<ReadFileResult> {
    return readRemoteProjectFile(runtime, input, { secretStore: this.secretStore, runner: this.runner });
  }

  writeProjectFile(runtime: IpcRuntimeLike, input: WriteFileInput): Promise<WriteFileResult> {
    return writeRemoteProjectFile(runtime, input, { secretStore: this.secretStore, runner: this.runner });
  }

  readGitMetadata(runtime: IpcRuntimeLike, projectUri: string): Promise<GitMetadata> {
    return readRemoteGitMetadata(runtime, projectUri, { secretStore: this.secretStore, runner: this.runner });
  }

  readGitHistory(runtime: IpcRuntimeLike, projectUri: string): Promise<GitEvent[]> {
    return readRemoteGitHistory(runtime, projectUri, 50, { secretStore: this.secretStore, runner: this.runner });
  }

  readGitDirtyFiles(runtime: IpcRuntimeLike, projectUri: string): Promise<GitDirtyFile[]> {
    return readRemoteGitDirtyFiles(runtime, projectUri, { secretStore: this.secretStore, runner: this.runner });
  }

  async createMachineProbeContext(runtime: IpcRuntimeLike, targetId: string): Promise<MachineProbeContext> {
    const target = await this.resolveTarget(runtime, targetId);
    return {
      target,
      run: (command, options) => this.runCommand(runtime, targetId, command, options),
      which: async (command) => {
        const result = await this.runCommand(runtime, targetId, `command -v ${shellQuote(command)}`, { timeoutMs: 3000 });
        return result.stdout.trim().split(/\r?\n/u)[0] || null;
      },
      readTextFile: async (filePath, options) => {
        const result = await this.runCommand(runtime, targetId, `if [ -f ${shellQuote(filePath)} ]; then cat -- ${shellQuote(filePath)}; fi`);
        if (options?.maxBytes && Buffer.byteLength(result.stdout, "utf8") > options.maxBytes) return null;
        return result.stdout || null;
      },
    };
  }

  async createProjectProbeContext(runtime: IpcRuntimeLike, projectUri: string): Promise<ProjectProbeContext> {
    const parsed = parseProjectUri(projectUri);
    if (parsed.kind !== "ssh") throw new Error("Project URI is not SSH");
    const target = await this.resolveTarget(runtime, parsed.machineId);
    return {
      projectUri,
      target,
      projectPath: parsed.path,
      listFiles: async (relativePath) => {
        const result = await this.listProjectFiles(runtime, { projectUri, directoryPath: relativePath });
        if (!result.ok) throw new Error(result.message);
        return result.files.map((file) => ({ name: file.name, path: file.path, kind: file.kind }));
      },
      readTextFile: async (relativePath, options) => {
        const result = await this.readProjectFile(runtime, { projectUri, relativePath });
        if (!result.ok) return null;
        if (options?.maxBytes && result.size > options.maxBytes) return null;
        return result.content;
      },
      run: (command, options) => this.runCommand(runtime, projectUri, command, options),
    };
  }

  async readMachineProfile(runtime: IpcRuntimeLike, targetId: string, _options?: ProfileReadOptions): Promise<MachineProfile> {
    const target = await this.resolveTarget(runtime, targetId);
    return {
      targetId: target.id,
      targetKind: "ssh",
      detectedAt: new Date().toISOString(),
      hostname: null,
      os: { platform: "unknown", name: null, version: null, arch: null, kernel: null },
      shell: { path: null, name: null },
      tools: [],
      languages: [],
      packageManagers: [],
      agents: [],
      warnings: [],
    };
  }

  async readProjectProfile(runtime: IpcRuntimeLike, projectUri: string, _options?: ProfileReadOptions): Promise<ProjectProfile> {
    const parsed = parseProjectUri(projectUri);
    if (parsed.kind !== "ssh") throw new Error("Project URI is not SSH");
    const git = await readRemoteGitMetadata(runtime, projectUri, { secretStore: this.secretStore, runner: this.runner });
    return {
      projectUri,
      targetId: parsed.machineId,
      targetKind: "ssh",
      detectedAt: new Date().toISOString(),
      name: path.posix.basename(parsed.path) || parsed.machineId,
      displayPath: `${parsed.machineId}:${parsed.path}`,
      vcs: {
        type: git.isGitRepository ? "git" : "none",
        root: git.gitRoot,
        branch: git.currentBranch,
        remoteOrigin: git.remoteOrigin,
        dirty: git.dirtyWorktree,
      },
      languages: [],
      frameworks: [],
      packageManagers: [],
      commands: {},
      services: [],
      env: { files: [], exampleFiles: [] },
      structure: { monorepo: false, workspaces: [], importantFiles: [] },
      warnings: [],
    };
  }

  async pathExistsOnTarget(runtime: IpcRuntimeLike, input: PathExistsInput): Promise<PathExistsResult> {
    const result = await this.runCommand(runtime, input.targetId, `if [ -d ${shellQuote(input.path)} ]; then echo dir; elif [ -e ${shellQuote(input.path)} ]; then echo file; else echo missing; fi`, { timeoutMs: 8000 });
    const stdout = result.stdout.trim();
    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim();
      return { ok: false, reason: "unreachable", message: stderr || `ssh exited with code ${result.exitCode}` };
    }
    if (stdout === "dir") return { ok: true, kind: "directory" };
    if (stdout === "file") return { ok: true, kind: "file" };
    return { ok: false, reason: "not-found", message: `Path does not exist on remote: ${input.path}` };
  }

  async runCommand(runtime: IpcRuntimeLike, uriOrTargetId: string, command: string, options: RunCommandOptions = {}): Promise<CommandResult> {
    const parsed = uriOrTargetId.startsWith("ssh://") ? parseProjectUri(uriOrTargetId) : null;
    const machine = await this.resolveMachine(runtime, parsed?.targetId ?? uriOrTargetId);
    const password = await this.loadPassword(machine);
    const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
    if (!sshArgs.length) throw new Error("Remote machine SSH connection details are incomplete");
    const remoteCommand = parsed?.kind === "ssh"
      ? `cd ${shellQuote(parsed.path)} && ${command}`
      : command;
    const args = [
      "-o", password ? "BatchMode=no" : "BatchMode=yes",
      "-o", "ConnectTimeout=5",
      ...sshArgs,
      "--",
      remoteShellCommand(remoteCommand),
    ];
    const startedAt = Date.now();
    try {
      const result = await this.runner(args, options.timeoutMs ?? 8000, password ? { password } : undefined);
      this.diagnostics?.recordSshLatency(Date.now() - startedAt, true);
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
      this.diagnostics?.recordSshLatency(Date.now() - startedAt, false);
      const detail = error as { stdout?: unknown; stderr?: unknown; code?: unknown };
      return {
        stdout: String(detail.stdout ?? ""),
        stderr: String(detail.stderr ?? (error instanceof Error ? error.message : String(error))),
        exitCode: typeof detail.code === "number" ? detail.code : 1,
      };
    }
  }

  createTerminal(runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession> {
    return this.terminalManager.create(runtime, input);
  }

  inputTerminal(input: TerminalInput): TerminalSession {
    return this.terminalManager.input(input);
  }

  resizeTerminal(input: TerminalResizeInput): TerminalSession {
    return this.terminalManager.resize(input);
  }

  closeTerminal(input: TerminalCloseInput): TerminalSession {
    return this.terminalManager.close(input);
  }

  closeAllTerminalSessions(): void {
    this.terminalManager.closeAll();
  }

  private async resolveMachine(runtime: IpcRuntimeLike, machineId: string): Promise<RemoteMachine> {
    const config = await getConfiguredRoots(runtime);
    const machine = config.configuredRemoteMachines.find((item) => item.id === machineId);
    if (!machine) throw new Error(`Remote machine "${machineId}" is not configured`);
    return machine;
  }

  private async loadPassword(machine: RemoteMachine): Promise<string | null> {
    if (machine.authMode !== "password" || !machine.passwordSecretId) return null;
    return (await this.secretStore.get(machine.passwordSecretId)) ?? null;
  }
}

function targetFromMachine(machine: RemoteMachine): ExecutionTarget {
  return {
    id: machine.id,
    kind: "ssh",
    label: machine.label,
    status: "unknown",
    uri: `ssh://${encodeURIComponent(machine.id)}`,
    displayPath: machine.sshConfigHost ?? machine.host,
    machineId: machine.id,
    createdAt: machine.createdAt,
    updatedAt: machine.updatedAt,
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
