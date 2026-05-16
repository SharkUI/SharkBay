import { BrowserWindow, dialog, ipcMain } from "electron";
import {
  addConfiguredRoot,
  addConfiguredProject,
  getConfiguredRoots,
  removeConfiguredRoot,
  removeConfiguredProject,
  setAppearanceTheme
} from "../src/main/config.js";
import { listProjectFiles } from "../src/main/project-files.js";
import { scanProjects } from "../src/main/scanner.js";
import { readGitMetadata, readGitHistory, readGitDirtyFiles } from "../src/main/git.js";
import { TerminalManager } from "../src/main/terminal.js";
import { assertHarnessInstallable, getMachineId, installHarness, isHarnessInstalled, resolveGitHubIdentity, generateMachineId, checkRepoPermission, uninstallHarness } from "../src/main/teamwork-harness.js";
import { scanTasks, watchTasks } from "../src/main/teamwork-tasks.js";
import { deleteTeamContextBranch, hasLocalContextBranch, TeamworkSync } from "../src/main/teamwork-sync.js";
import type {
  AgentCli,
  AgentProjectStatusEvent,
  AppConfig,
  AppearanceTheme,
  AppearanceThemeInput,
  BrowserActionInput,
  BrowserCloseInput,
  BrowserCreateInput,
  BrowserNavigateInput,
  BrowserResizeInput,
  BrowserSession,
  BrowserUpdateEvent,
  ProjectConfigInput,
  ProjectScanInput,
  ProjectDetail,
  ProjectFilesInput,
  ProjectFilesResult,
  RemoveProjectInput,
  RemoveRootInput,
  RootConfigInput,
  GitHubIdentity,
  ScanProjectsResult,
  TaskViewModel,
  TeamworkGetTasksInput,
  TeamworkInstallInput,
  TeamworkStatus,
  TeamworkTasksChangedEvent,
  TeamworkUninstallInput,
  TeamworkUninstallResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent
} from "../src/shared/types.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import { AgentSessionWatcher, listAvailableAgentClis } from "../src/main/agent-clis.js";
import { BrowserManager } from "../src/main/browser-tabs.js";
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
const agentSessionWatcher = new AgentSessionWatcher();
const browserManager = new BrowserManager();
const teamworkSyncInstances = new Map<string, TeamworkSync>();
const teamworkWatcherCleanups = new Map<string, () => void>();

async function syncForStatus(repoPath: string, installed: boolean): Promise<TeamworkSync | null> {
  const existing = teamworkSyncInstances.get(repoPath);
  if (existing) return existing;
  if (!installed || !await hasLocalContextBranch(repoPath)) return null;

  const sync = new TeamworkSync(repoPath);
  sync.start();
  teamworkSyncInstances.set(repoPath, sync);
  return sync;
}

async function getTeamworkStatus(repoPath: string): Promise<TeamworkStatus> {
  const harnessInstalled = await isHarnessInstalled(repoPath);
  const contextAvailable = await hasLocalContextBranch(repoPath);
  const installed = harnessInstalled && contextAvailable;
  const sync = await syncForStatus(repoPath, installed);
  const syncStatus = sync?.getStatus();
  return {
    installed,
    harnessInstalled,
    syncEnabled: syncStatus?.enabled ?? false,
    lastSyncAt: syncStatus?.lastSyncAt ?? null,
    pendingCount: syncStatus?.pendingCount ?? 0,
    lastError: syncStatus?.lastError ?? null,
  };
}

async function installTeamwork(repoPath: string): Promise<TeamworkStatus> {
  await assertHarnessInstallable(repoPath);
  const identity = await resolveGitHubIdentity();
  const gitMeta = await readGitMetadata(repoPath);
  const repo = githubRepoFromRemote(gitMeta.remoteOrigin);
  if (!repo) {
    throw new Error("Teamwork requires a GitHub origin remote. Configure remote.origin.url before installing Teamwork.");
  }

  const permission = await checkRepoPermission(repo, identity.login);
  if (permission !== "admin" && permission !== "write") {
    throw new Error(`Insufficient permission: ${permission}. Need at least write.`);
  }

  const sync = teamworkSyncInstances.get(repoPath) ?? new TeamworkSync(repoPath);
  await sync.ensureContextBranch(repo, identity.login);

  const machineId = await getMachineId(repoPath) ?? generateMachineId();
  await installHarness(repoPath, {
    githubLogin: identity.login,
    githubUserId: identity.id,
    machineId,
    agent: "",
    repo,
  });

  sync.start();
  teamworkSyncInstances.set(repoPath, sync);
  const syncStatus = sync.getStatus();
  return {
    installed: true,
    harnessInstalled: true,
    syncEnabled: syncStatus.enabled,
    lastSyncAt: syncStatus.lastSyncAt,
    pendingCount: syncStatus.pendingCount,
    lastError: syncStatus.lastError,
    githubLogin: identity.login,
    repo,
    branch: gitMeta.currentBranch ?? undefined,
    permission,
  };
}

async function assertContextCleanupOwner(repoPath: string): Promise<void> {
  const identity = await resolveGitHubIdentity();
  const gitMeta = await readGitMetadata(repoPath);
  const repo = githubRepoFromRemote(gitMeta.remoteOrigin);
  const owner = repo?.split("/")[0] ?? "";
  if (!repo || owner.toLowerCase() !== identity.login.toLowerCase()) {
    throw new Error("Only the repository owner can clean all Teamwork task records.");
  }
}

function githubRepoFromRemote(remoteOrigin: string | null): string | null {
  const match = remoteOrigin?.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

export function closeAllTerminalSessions(): void {
  terminalManager.closeAll();
  browserManager.closeAll();
  for (const sync of teamworkSyncInstances.values()) sync.stop();
  teamworkSyncInstances.clear();
  for (const cleanup of teamworkWatcherCleanups.values()) cleanup();
  teamworkWatcherCleanups.clear();
}

async function getProjectDetail(runtime: IpcRuntime, input: { repoPath?: string }): Promise<ProjectDetail> {
  const config = await getConfiguredRoots(runtime);
  const configuredRoots = config.configuredRoots;
  const configuredProjects = config.configuredProjects;
  const safeRepo = await resolveRepoPath(input.repoPath ?? "", configuredRoots, configuredProjects);
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
  agentSessionWatcher.removeAllListeners("status");
  browserManager.removeAllListeners("update");
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
  agentSessionWatcher.on("status", (event: AgentProjectStatusEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.agentStatus, event);
    });
  });
  agentSessionWatcher.start();
  browserManager.on("update", (event: BrowserUpdateEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.browserUpdate, event);
    });
  });

  handle<void, AppConfig>(channels.listRoots, () => getConfiguredRoots(runtime));
  handle<RootConfigInput, AppConfig>(channels.addRoot, (payload) => addConfiguredRoot(runtime, payload));
  handle<RemoveRootInput, AppConfig>(channels.removeRoot, (payload) => removeConfiguredRoot(runtime, payload));
  handle<ProjectConfigInput, AppConfig>(channels.addProject, (payload) => addConfiguredProject(runtime, payload));
  handle<RemoveProjectInput, AppConfig>(channels.removeProject, (payload) => removeConfiguredProject(runtime, payload));
  ipcMain.removeHandler(channels.pickProjectFolder);
  ipcMain.handle(channels.pickProjectFolder, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { cancelled: true, paths: [] };
    const result = await dialog.showOpenDialog(window, {
      title: "Select project folder",
      properties: ["openDirectory", "multiSelections"],
      message: "Choose one or more project directories to add",
    });
    return { cancelled: result.canceled, paths: result.filePaths };
  });
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
    const config = await getConfiguredRoots(runtime);
    return listProjectFiles(runtime, { ...payload, configuredRoots: config.configuredRoots, configuredProjects: config.configuredProjects });
  });
  handle<void, AgentCli[]>(channels.listAgentClis, () => listAvailableAgentClis());
  ipcMain.removeHandler(channels.createBrowser);
  ipcMain.handle(channels.createBrowser, (event, payload: BrowserCreateInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("Browser window not found");
    }
    return browserManager.create(window, payload);
  });
  handle<BrowserNavigateInput, BrowserSession>(channels.browserNavigate, (payload) =>
    Promise.resolve(browserManager.navigate(payload))
  );
  handle<BrowserResizeInput, BrowserSession>(channels.browserResize, (payload) =>
    Promise.resolve(browserManager.resize(payload))
  );
  handle<BrowserCloseInput, BrowserSession>(channels.browserClose, (payload) =>
    Promise.resolve(browserManager.close(payload))
  );
  handle<BrowserActionInput, BrowserSession>(channels.browserGoBack, (payload) =>
    Promise.resolve(browserManager.goBack(payload))
  );
  handle<BrowserActionInput, BrowserSession>(channels.browserGoForward, (payload) =>
    Promise.resolve(browserManager.goForward(payload))
  );
  handle<BrowserActionInput, BrowserSession>(channels.browserReload, (payload) =>
    Promise.resolve(browserManager.reload(payload))
  );
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

  // Teamwork handlers
  handle<TeamworkGetTasksInput, TaskViewModel[]>(channels.teamworkGetTasks, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    const safe = await resolveRepoPath(payload.repoPath, config.configuredRoots, config.configuredProjects);
    const repoPath = safe.repoPath;
    const tasks = await scanTasks(repoPath);
    // Start watcher if not already running
    if (!teamworkWatcherCleanups.has(repoPath)) {
      const cleanup = watchTasks(repoPath, (updated) => {
        const event: TeamworkTasksChangedEvent = { repoPath, tasks: updated };
        BrowserWindow.getAllWindows().forEach((w) => {
          w.webContents.send(channels.teamworkTasksChanged, event);
        });
      });
      teamworkWatcherCleanups.set(repoPath, cleanup);
    }
    return tasks;
  });

  handle<{ repoPath: string }, TeamworkStatus>(channels.teamworkGetStatus, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    const safe = await resolveRepoPath(payload.repoPath, config.configuredRoots, config.configuredProjects);
    return getTeamworkStatus(safe.repoPath);
  });

  handle<void, GitHubIdentity>(channels.teamworkResolveIdentity, async () => {
    return resolveGitHubIdentity();
  });

  handle<TeamworkInstallInput, TeamworkStatus>(channels.teamworkInstall, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    const safe = await resolveRepoPath(payload.repoPath, config.configuredRoots, config.configuredProjects);
    return installTeamwork(safe.repoPath);
  });

  handle<{ repoPath: string }, TeamworkStatus>(channels.teamworkEnable, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    const safe = await resolveRepoPath(payload.repoPath, config.configuredRoots, config.configuredProjects);
    return installTeamwork(safe.repoPath);
  });

  handle<TeamworkUninstallInput, TeamworkUninstallResult>(channels.teamworkUninstall, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    const safe = await resolveRepoPath(payload.repoPath, config.configuredRoots, config.configuredProjects);
    const repoPath = safe.repoPath;
    const sync = teamworkSyncInstances.get(repoPath);
    sync?.stop();
    teamworkSyncInstances.delete(repoPath);

    let contextBranchDeleted = false;
    if (payload.cleanTeamContext) {
      await assertContextCleanupOwner(repoPath);
      contextBranchDeleted = await deleteTeamContextBranch(repoPath);
    }

    const result = await uninstallHarness(repoPath);
    const cleanup = teamworkWatcherCleanups.get(repoPath);
    cleanup?.();
    teamworkWatcherCleanups.delete(repoPath);
    const event: TeamworkTasksChangedEvent = { repoPath, tasks: [] };
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send(channels.teamworkTasksChanged, event);
    });
    return { ...result, contextBranchDeleted };
  });

  handle<{ repoPath: string }, void>(channels.teamworkSyncNow, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    const safe = await resolveRepoPath(payload.repoPath, config.configuredRoots, config.configuredProjects);
    const repoPath = safe.repoPath;
    let sync = teamworkSyncInstances.get(repoPath);
    if (!sync) {
      sync = new TeamworkSync(repoPath);
      sync.start();
      teamworkSyncInstances.set(repoPath, sync);
    }
    await sync.syncOnce();
  });
}
