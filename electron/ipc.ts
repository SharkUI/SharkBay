import { BrowserWindow, ipcMain } from "electron";
import {
  addConfiguredRoot,
  getConfiguredRoots,
  removeConfiguredRoot,
  setAppearanceTheme
} from "../src/main/config.js";
import { listProjectFiles } from "../src/main/project-files.js";
import { scanProjects } from "../src/main/scanner.js";
import { readGitMetadata, readGitHistory, readGitDirtyFiles } from "../src/main/git.js";
import { TerminalManager } from "../src/main/terminal.js";
import type {
  AppConfig,
  AppearanceTheme,
  AppearanceThemeInput,
  ProjectDetail,
  ProjectFilesInput,
  ProjectFilesResult,
  ProjectScanInput,
  RemoveRootInput,
  RootConfigInput,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent
} from "../src/shared/types.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import { resolveProjectIconSources } from "../src/main/project-icons.js";
import { resolveRepoPath } from "../src/main/path-safety.js";
import path from "node:path";

export type IpcRuntime = {
  userDataPath: string;
};

export type IpcCallbacks = {
  onAppearanceThemeChanged?: (theme: AppearanceTheme) => void;
};

const terminalManager = new TerminalManager();

export function closeAllTerminalSessions(): void {
  terminalManager.closeAll();
}

async function getProjectDetail(runtime: IpcRuntime, input: { repoPath?: string }): Promise<ProjectDetail> {
  const configuredRoots = (await getConfiguredRoots(runtime)).configuredRoots;
  const safeRepo = await resolveRepoPath(input.repoPath ?? "", configuredRoots);
  const repoPath = safeRepo.repoPath;
  const [gitMeta, gitHistory, gitDirtyFiles, iconSources] = await Promise.all([
    readGitMetadata(repoPath),
    readGitHistory(repoPath),
    readGitDirtyFiles(repoPath),
    resolveProjectIconSources(repoPath, configuredRoots),
  ]);
  return {
    id: repoPath,
    name: path.basename(repoPath),
    path: repoPath,
    iconSources,
    repoUrl: gitMeta.remoteOrigin,
    currentBranch: gitMeta.currentBranch,
    dirtyWorktree: gitMeta.dirtyWorktree,
    gitHistory,
    gitDirtyFiles,
  };
}

function handle<Payload, Result>(
  channel: string,
  callback: (payload: Payload) => Promise<Result>
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (_event, payload: Payload) => callback(payload));
}

export function registerIpcHandlers(
  runtime: IpcRuntime,
  callbacks: IpcCallbacks = {}
): void {
  terminalManager.removeAllListeners("data");
  terminalManager.removeAllListeners("update");
  terminalManager.removeAllListeners("exit");
  terminalManager.on("data", (event) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalData, event);
    });
  });
  terminalManager.on("update", (event: TerminalUpdateEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalUpdate, event);
    });
  });
  terminalManager.on("exit", (event) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalExit, event);
    });
  });

  handle<void, AppConfig>(channels.listRoots, () => getConfiguredRoots(runtime));
  handle<RootConfigInput, AppConfig>(channels.addRoot, (payload) => addConfiguredRoot(runtime, payload));
  handle<RemoveRootInput, AppConfig>(channels.removeRoot, (payload) => removeConfiguredRoot(runtime, payload));
  handle<AppearanceThemeInput, AppConfig>(channels.setAppearanceTheme, (payload) =>
    setAppearanceTheme(runtime, payload).then((config) => {
      callbacks.onAppearanceThemeChanged?.(config.appearanceTheme);
      return config;
    })
  );
  handle<ProjectScanInput | undefined, ScanProjectsResult>(channels.scanProjects, (payload) =>
    scanProjects(runtime, payload)
  );
  handle<{ repoPath?: string }, ProjectDetail>(channels.getProjectDetail, (payload) =>
    getProjectDetail(runtime, payload)
  );
  handle<ProjectFilesInput, ProjectFilesResult>(channels.listProjectFiles, async (payload) => {
    const configuredRoots = (await getConfiguredRoots(runtime)).configuredRoots;
    return listProjectFiles(runtime, { ...payload, configuredRoots });
  });
  handle<TerminalCreateInput, TerminalSession>(channels.createTerminal, (payload) =>
    terminalManager.create(runtime, payload)
  );
  handle<TerminalInput, TerminalSession>(channels.terminalInput, (payload) =>
    Promise.resolve(terminalManager.input(payload))
  );
  handle<TerminalResizeInput, TerminalSession>(channels.resizeTerminal, (payload) =>
    Promise.resolve(terminalManager.resize(payload))
  );
  handle<TerminalCloseInput, TerminalSession>(channels.closeTerminal, (payload) =>
    Promise.resolve(terminalManager.close(payload))
  );
}
