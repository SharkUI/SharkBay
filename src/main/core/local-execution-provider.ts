import { EventEmitter } from "node:events";
import { getConfiguredRoots } from "../config.js";
import { readGitDirtyFiles, readGitHistory, readGitMetadata } from "../git.js";
import { listProjectFiles } from "../project-files.js";
import { scanProjects } from "../scanner.js";
import { TerminalManager } from "../terminal.js";
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
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
} from "../../shared/types.js";
import type { ExecutionProvider, ExecutionProviderEvents } from "./execution-provider.js";
import { localPathFromProjectUri } from "./project-uri.js";

export class LocalExecutionProvider
  extends EventEmitter<ExecutionProviderEvents>
  implements ExecutionProvider {
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

  readGitMetadata(projectUri: string): Promise<GitMetadata> {
    return readGitMetadata(localPathFromProjectUri(projectUri));
  }

  readGitHistory(projectUri: string): Promise<GitEvent[]> {
    return readGitHistory(localPathFromProjectUri(projectUri));
  }

  readGitDirtyFiles(projectUri: string): Promise<GitDirtyFile[]> {
    return readGitDirtyFiles(localPathFromProjectUri(projectUri));
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
