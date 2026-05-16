import { EventEmitter } from "node:events";
import path from "node:path";
import { getConfiguredRoots } from "../config.js";
import { resolveProjectIconSources } from "../project-icons.js";
import { resolveProjectUri } from "../path-safety.js";
import { readLocalProjectFile, writeLocalProjectFile } from "../file-content.js";
import { readRemoteGitDirtyFiles, readRemoteGitHistory, readRemoteGitMetadata } from "../remote-git.js";
import { listRemoteProjectFiles, readRemoteProjectFile, writeRemoteProjectFile } from "../remote-files.js";
import type {
  IpcRuntimeLike,
  ProjectDetail,
  ProjectFilesInput,
  ProjectFilesResult,
  ProjectScanInput,
  ReadFileInput,
  ReadFileResult,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent,
  WriteFileInput,
  WriteFileResult,
} from "../../shared/types.js";
import type { ExecutionProvider } from "./execution-provider.js";
import { LocalExecutionProvider } from "./local-execution-provider.js";
import { parseProjectUri } from "./project-uri.js";

export type SharkBayCoreEvents = {
  terminalData: [TerminalDataEvent];
  terminalUpdate: [TerminalUpdateEvent];
  terminalExit: [TerminalExitEvent];
};

export class SharkBayCore extends EventEmitter<SharkBayCoreEvents> {
  private readonly localProvider: ExecutionProvider;

  constructor(localProvider: ExecutionProvider = new LocalExecutionProvider()) {
    super();
    this.localProvider = localProvider;

    if (localProvider instanceof EventEmitter) {
      localProvider.on("terminalData", (event) => this.emit("terminalData", event));
      localProvider.on("terminalUpdate", (event) => this.emit("terminalUpdate", event));
      localProvider.on("terminalExit", (event) => this.emit("terminalExit", event));
    }
  }

  scanProjects(runtime: IpcRuntimeLike, input?: ProjectScanInput): Promise<ScanProjectsResult> {
    return this.localProvider.scanProjects(runtime, input);
  }

  async getProjectDetail(runtime: IpcRuntimeLike, input: { projectUri: string }): Promise<ProjectDetail> {
    const parsed = parseProjectUri(input.projectUri);
    if (parsed.kind === "ssh") {
      const [gitMeta, gitHistory, gitDirtyFiles] = await Promise.all([
        readRemoteGitMetadata(runtime, input.projectUri),
        readRemoteGitHistory(runtime, input.projectUri),
        readRemoteGitDirtyFiles(runtime, input.projectUri),
      ]);
      return {
        id: input.projectUri,
        uri: input.projectUri,
        name: path.posix.basename(parsed.path) || parsed.machineId,
        providerId: parsed.machineId,
        providerKind: "ssh",
        displayPath: `${parsed.machineId}:${parsed.path}`,
        iconSources: [],
        repoUrl: gitMeta.remoteOrigin,
        currentBranch: gitMeta.currentBranch,
        dirtyWorktree: gitMeta.dirtyWorktree,
        gitHistory,
        gitDirtyFiles,
      };
    }
    const config = await getConfiguredRoots(runtime);
    const configuredRoots = config.configuredRoots;
    const configuredProjects = config.configuredProjects;
    const safeRepo = await resolveProjectUri(input.projectUri, configuredRoots, configuredProjects);
    const repoPath = safeRepo.repoPath;
    const projectUri = safeRepo.projectUri;
    const [gitMeta, gitHistory, gitDirtyFiles, iconSources] = await Promise.all([
      this.localProvider.readGitMetadata(projectUri),
      this.localProvider.readGitHistory(projectUri),
      this.localProvider.readGitDirtyFiles(projectUri),
      resolveProjectIconSources(repoPath, configuredRoots),
    ]);

    return {
      id: projectUri,
      uri: projectUri,
      name: path.basename(repoPath),
      providerId: "local",
      providerKind: "local",
      displayPath: repoPath,
      iconSources,
      repoUrl: gitMeta.remoteOrigin,
      currentBranch: gitMeta.currentBranch,
      dirtyWorktree: gitMeta.dirtyWorktree,
      gitHistory,
      gitDirtyFiles,
    };
  }

  listProjectFiles(runtime: IpcRuntimeLike, input: ProjectFilesInput): Promise<ProjectFilesResult> {
    if (input.projectUri?.startsWith("ssh://")) {
      return listRemoteProjectFiles(runtime, input);
    }
    return this.localProvider.listProjectFiles(runtime, input);
  }

  readProjectFile(runtime: IpcRuntimeLike, input: ReadFileInput): Promise<ReadFileResult> {
    if (input.projectUri?.startsWith("ssh://")) {
      return readRemoteProjectFile(runtime, input);
    }
    return readLocalProjectFile(runtime, input);
  }

  writeProjectFile(runtime: IpcRuntimeLike, input: WriteFileInput): Promise<WriteFileResult> {
    if (input.projectUri?.startsWith("ssh://")) {
      return writeRemoteProjectFile(runtime, input);
    }
    return writeLocalProjectFile(runtime, input);
  }

  createTerminal(runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession> {
    return this.localProvider.createTerminal(runtime, input);
  }

  inputTerminal(input: TerminalInput): TerminalSession {
    return this.localProvider.inputTerminal(input);
  }

  resizeTerminal(input: TerminalResizeInput): TerminalSession {
    return this.localProvider.resizeTerminal(input);
  }

  closeTerminal(input: TerminalCloseInput): TerminalSession {
    return this.localProvider.closeTerminal(input);
  }

  closeAllTerminalSessions(): void {
    this.localProvider.closeAllTerminalSessions();
  }
}
