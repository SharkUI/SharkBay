import type {
  GitDirtyFile,
  GitEvent,
  GitMetadata,
  IpcRuntimeLike,
  ProjectFilesInput,
  ProjectFilesResult,
  ProjectScanInput,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent,
} from "../../shared/types.js";

export type ExecutionProviderKind = "local" | "ssh" | "container" | "wsl";

export type ExecutionProviderEvents = {
  terminalData: [TerminalDataEvent];
  terminalUpdate: [TerminalUpdateEvent];
  terminalExit: [TerminalExitEvent];
};

export interface ExecutionProvider {
  readonly id: string;
  readonly kind: ExecutionProviderKind;
  readonly label: string;

  scanProjects(runtime: IpcRuntimeLike, input?: ProjectScanInput): Promise<ScanProjectsResult>;
  listProjectFiles(runtime: IpcRuntimeLike, input: ProjectFilesInput): Promise<ProjectFilesResult>;

  readGitMetadata(projectUri: string): Promise<GitMetadata>;
  readGitHistory(projectUri: string): Promise<GitEvent[]>;
  readGitDirtyFiles(projectUri: string): Promise<GitDirtyFile[]>;

  createTerminal(runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession>;
  inputTerminal(input: TerminalInput): TerminalSession;
  resizeTerminal(input: TerminalResizeInput): TerminalSession;
  closeTerminal(input: TerminalCloseInput): TerminalSession;
  closeAllTerminalSessions(): void;
}
