import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getConfiguredRoots } from "../../main/config.js";
import { readLocalProjectFile, writeLocalProjectFile } from "../../main/file-content.js";
import { readGitDirtyFiles, readGitHistory, readGitMetadata } from "../../main/git.js";
import { listProjectFiles } from "../../main/project-files.js";
import { scanProjects } from "../../main/scanner.js";
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
  ProjectFingerprint,
  ProjectProfile,
  ProjectScanInput,
  ReadFileInput,
  ReadFileResult,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  WriteFileInput,
  WriteFileResult,
} from "../../shared/types.js";
import {
  FINGERPRINT_MANIFEST_FILES,
  type CommandResult,
  type ExecutionProvider,
  type MachineProbeContext,
  type ProjectProbeContext,
  type ReadOptions,
  type RunCommandOptions,
} from "../../core/execution-provider.js";
import { parseProjectUri } from "../../core/project-uri.js";

const execFileAsync = promisify(execFile);

export class LocalProvider extends EventEmitter implements ExecutionProvider {
  readonly id = "local";
  readonly kind = "local" as const;
  readonly label = "Local computer";

  private readonly terminalManager: TerminalManager;

  constructor(terminalManager = new TerminalManager()) {
    super();
    this.terminalManager = terminalManager;
    this.terminalManager.on("data", (event) => this.emit("terminalData", event));
    this.terminalManager.on("update", (event) => this.emit("terminalUpdate", event));
    this.terminalManager.on("exit", (event) => this.emit("terminalExit", event));
  }

  resolveTarget(_runtime: IpcRuntimeLike, _uriOrTargetId: string): Promise<ExecutionTarget> {
    const timestamp = new Date().toISOString();
    return Promise.resolve({
      id: "local",
      kind: "local",
      label: "Local computer",
      status: "available",
      uri: "local:",
      displayPath: os.hostname() || "Local computer",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  scanProjects(runtime: IpcRuntimeLike, input?: ProjectScanInput): Promise<ScanProjectsResult> {
    return scanProjects(runtime, input);
  }

  async listProjectFiles(runtime: IpcRuntimeLike, input: ProjectFilesInput): Promise<ProjectFilesResult> {
    const config = await getConfiguredRoots(runtime);
    return listProjectFiles(runtime, {
      ...input,
      configuredRoots: config.configuredRoots,
      configuredProjects: config.configuredProjects,
    });
  }

  readProjectFile(runtime: IpcRuntimeLike, input: ReadFileInput): Promise<ReadFileResult> {
    return readLocalProjectFile(runtime, input);
  }

  writeProjectFile(runtime: IpcRuntimeLike, input: WriteFileInput): Promise<WriteFileResult> {
    return writeLocalProjectFile(runtime, input);
  }

  readGitMetadata(_runtime: IpcRuntimeLike, projectUri: string): Promise<GitMetadata> {
    return readGitMetadata(localPathFromUri(projectUri));
  }

  readGitHistory(_runtime: IpcRuntimeLike, projectUri: string): Promise<GitEvent[]> {
    return readGitHistory(localPathFromUri(projectUri));
  }

  readGitDirtyFiles(_runtime: IpcRuntimeLike, projectUri: string): Promise<GitDirtyFile[]> {
    return readGitDirtyFiles(localPathFromUri(projectUri));
  }

  async createMachineProbeContext(runtime: IpcRuntimeLike, targetId: string): Promise<MachineProbeContext> {
    const target = await this.resolveTarget(runtime, targetId);
    return {
      target,
      run: (command, options) => this.runCommand(runtime, targetId, command, options),
      which: async (command) => {
        const result = await this.runCommand(runtime, targetId, `command -v ${shellQuote(command)}`, { timeoutMs: 3000 }).catch(() => null);
        return result?.stdout.trim().split(/\r?\n/u)[0] || null;
      },
      readTextFile: (filePath, options) => readTextFile(filePath, options),
    };
  }

  async createProjectProbeContext(runtime: IpcRuntimeLike, projectUri: string): Promise<ProjectProbeContext> {
    const parsed = parseProjectUri(projectUri);
    if (parsed.kind !== "local") throw new Error("Project URI is not local");
    const target = await this.resolveTarget(runtime, "local");
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
      run: (command, options) => this.runCommand(runtime, projectUri, command, { ...options, cwdUri: projectUri }),
    };
  }

  async readMachineProfile(runtime: IpcRuntimeLike, targetId: string, _options?: ProfileReadOptions): Promise<MachineProfile> {
    const target = await this.resolveTarget(runtime, targetId);
    return {
      targetId: target.id,
      targetKind: target.kind,
      detectedAt: new Date().toISOString(),
      hostname: os.hostname() || null,
      os: {
        platform: process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : process.platform === "win32" ? "windows" : "unknown",
        name: os.type() || null,
        version: os.release() || null,
        arch: os.arch() || null,
        kernel: os.release() || null,
      },
      shell: {
        path: process.env.SHELL ?? null,
        name: process.env.SHELL ? path.basename(process.env.SHELL) : null,
      },
      tools: [],
      languages: [],
      packageManagers: [],
      agents: [],
      warnings: [],
    };
  }

  async readProjectProfile(runtime: IpcRuntimeLike, projectUri: string, _options?: ProfileReadOptions): Promise<ProjectProfile> {
    const parsed = parseProjectUri(projectUri);
    if (parsed.kind !== "local") throw new Error("Project URI is not local");
    const git = await this.readGitMetadata(runtime, projectUri);
    return {
      projectUri,
      targetId: "local",
      targetKind: "local",
      detectedAt: new Date().toISOString(),
      name: path.basename(parsed.path),
      displayPath: parsed.path,
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

  async pathExistsOnTarget(_runtime: IpcRuntimeLike, input: PathExistsInput): Promise<PathExistsResult> {
    try {
      const stat = await fs.stat(input.path);
      return { ok: true, kind: stat.isDirectory() ? "directory" : "file" };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { ok: false, reason: "not-found", message: `Path does not exist: ${input.path}` };
      return { ok: false, reason: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  async readProjectFingerprint(_runtime: IpcRuntimeLike, projectUri: string): Promise<ProjectFingerprint> {
    const projectPath = localPathFromUri(projectUri);
    const manifestMtimes: Record<string, number | null> = {};
    await Promise.all(FINGERPRINT_MANIFEST_FILES.map(async (file) => {
      const stat = await fs.stat(path.join(projectPath, file)).catch(() => null);
      manifestMtimes[file] = stat?.isFile() ? stat.mtimeMs : null;
    }));
    const headPath = path.join(projectPath, ".git", "HEAD");
    const head = await fs.readFile(headPath, "utf8").catch(() => null);
    const gitHead = await resolveGitHead(projectPath, head);
    return { manifestMtimes, gitHead };
  }

  async runCommand(_runtime: IpcRuntimeLike, uriOrTargetId: string, command: string, options: RunCommandOptions = {}): Promise<CommandResult> {
    const cwd = options.cwdUri ? localPathFromUri(options.cwdUri) : uriOrTargetId.startsWith("local:") ? localPathFromUri(uriOrTargetId) : os.homedir();
    try {
      const result = await execFileAsync("/bin/sh", ["-lc", command], {
        cwd,
        timeout: options.timeoutMs ?? 8000,
        env: { ...process.env, ...options.env },
        maxBuffer: 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
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
}

function localPathFromUri(projectUri: string): string {
  const parsed = parseProjectUri(projectUri);
  if (parsed.kind !== "local") throw new Error("Project URI is not local");
  return parsed.path;
}

async function readTextFile(filePath: string, options?: ReadOptions): Promise<string | null> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return null;
  if (options?.maxBytes && stat.size > options.maxBytes) return null;
  return fs.readFile(filePath, "utf8").catch(() => null);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function resolveGitHead(projectPath: string, headContent: string | null): Promise<string | null> {
  if (!headContent) return null;
  const trimmed = headContent.trim();
  if (trimmed.startsWith("ref:")) {
    const ref = trimmed.slice("ref:".length).trim();
    const refPath = path.join(projectPath, ".git", ref);
    const sha = await fs.readFile(refPath, "utf8").catch(() => null);
    return sha?.trim() || trimmed;
  }
  return trimmed || null;
}
