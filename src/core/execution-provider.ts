import type {
  CreateWorktreeResult,
  ExecutionTarget,
  ExecutionTargetKind,
  GitBranchSummary,
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
  RemoveWorktreeResult,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  WorktreeInfoResult,
  WorktreeStatus,
  WriteFileInput,
  WriteFileResult,
} from "../shared/types.js";

export const FINGERPRINT_MANIFEST_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "pyproject.toml",
  "requirements.txt",
  "uv.lock",
  "poetry.lock",
  "Pipfile",
  "Pipfile.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
] as const;

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type RunCommandOptions = {
  timeoutMs?: number;
  cwdUri?: string;
  env?: Record<string, string>;
};

export type FileEntry = {
  name: string;
  path: string;
  kind: "directory" | "file";
};

export type ListOptions = {
  maxDepth?: number;
  limit?: number;
};

export type ReadOptions = {
  maxBytes?: number;
};

export type MachineProbeContext = {
  target: ExecutionTarget;
  run(command: string, options?: RunCommandOptions): Promise<CommandResult>;
  which(command: string): Promise<string | null>;
  readTextFile(path: string, options?: ReadOptions): Promise<string | null>;
};

export type ProjectProbeContext = {
  projectUri: string;
  target: ExecutionTarget;
  projectPath: string;
  listFiles(relativePath?: string, options?: ListOptions): Promise<FileEntry[]>;
  readTextFile(relativePath: string, options?: ReadOptions): Promise<string | null>;
  run(command: string, options?: RunCommandOptions): Promise<CommandResult>;
};

export interface ExecutionProvider {
  readonly id: string;
  readonly kind: ExecutionTargetKind;
  readonly label: string;

  resolveTarget(runtime: IpcRuntimeLike, uriOrTargetId: string): Promise<ExecutionTarget>;
  scanProjects(runtime: IpcRuntimeLike, input?: ProjectScanInput): Promise<ScanProjectsResult>;

  listProjectFiles(runtime: IpcRuntimeLike, input: ProjectFilesInput): Promise<ProjectFilesResult>;
  readProjectFile(runtime: IpcRuntimeLike, input: ReadFileInput): Promise<ReadFileResult>;
  writeProjectFile(runtime: IpcRuntimeLike, input: WriteFileInput): Promise<WriteFileResult>;

  readGitMetadata(runtime: IpcRuntimeLike, projectUri: string): Promise<GitMetadata>;
  readGitHistory(runtime: IpcRuntimeLike, projectUri: string): Promise<GitEvent[]>;
  readGitDirtyFiles(runtime: IpcRuntimeLike, projectUri: string): Promise<GitDirtyFile[]>;
  readGitBranches(runtime: IpcRuntimeLike, projectUri: string): Promise<GitBranchSummary>;
  readGitWorktreeInfo(runtime: IpcRuntimeLike, projectUri: string): Promise<WorktreeInfoResult>;
  readGitWorktreeStatus(runtime: IpcRuntimeLike, projectUri: string): Promise<WorktreeStatus>;
  createGitWorktree(runtime: IpcRuntimeLike, projectUri: string, input: { branch: string; base: string; targetPath: string }): Promise<CreateWorktreeResult>;
  removeGitWorktree(runtime: IpcRuntimeLike, projectUri: string, options: { force?: boolean }): Promise<RemoveWorktreeResult>;

  createMachineProbeContext(runtime: IpcRuntimeLike, targetId: string): Promise<MachineProbeContext>;
  createProjectProbeContext(runtime: IpcRuntimeLike, projectUri: string): Promise<ProjectProbeContext>;
  readMachineProfile(runtime: IpcRuntimeLike, targetId: string, options?: ProfileReadOptions): Promise<MachineProfile>;
  readProjectProfile(runtime: IpcRuntimeLike, projectUri: string, options?: ProfileReadOptions): Promise<ProjectProfile>;
  readProjectFingerprint?(runtime: IpcRuntimeLike, projectUri: string): Promise<ProjectFingerprint>;
  pathExistsOnTarget(runtime: IpcRuntimeLike, input: PathExistsInput): Promise<PathExistsResult>;

  runCommand(runtime: IpcRuntimeLike, uriOrTargetId: string, command: string, options?: RunCommandOptions): Promise<CommandResult>;
  createTerminal(runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession>;
  inputTerminal(input: TerminalInput): TerminalSession;
  resizeTerminal(input: TerminalResizeInput): TerminalSession;
  closeTerminal(input: TerminalCloseInput): TerminalSession;
  closeAllTerminalSessions(): void;
}
