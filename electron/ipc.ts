import { BrowserWindow, dialog, ipcMain } from "electron";
import {
  addConfiguredProject,
  getConfiguredRoots,
  removeConfiguredProject,
  renameProject,
  removeConfiguredRemoteMachine,
  setAppearanceTheme,
  upsertConfiguredRemoteMachine
} from "../src/main/config.js";
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
  CreatePortForwardInput,
  DetectRemotePortsInput,
  InstallToolInput,
  InstallToolResult,
  InstallRecipe,
  KnowledgeSiteResult,
  ListInstallRecipesInput,
  DiagnosticsSnapshot,
  MachineProfile,
  PathExistsInput,
  PathExistsResult,
  ProfileReadOptions,
  ProjectProfile,
  ListPortForwardsInput,
  PortForwardEvent,
  ProjectConfigInput,
  ProjectScanInput,
  ProjectDetail,
  ProjectFilesInput,
  ProjectFilesResult,
  ReadFileInput,
  ReadFileResult,
  WriteFileInput,
  WriteFileResult,
  RemoteDetectedPort,
  RemoteMachineInput,
  RemoteMachineTestResult,
  RemotePortForward,
  RenameProjectInput,
  RemoveProjectInput,
  RemovePortForwardInput,
  RemoveRemoteMachineInput,
  ScanProjectsResult,
  GitHubIdentity,
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
import { AgentSessionWatcher } from "../src/main/agent-clis.js";
import { BrowserManager } from "../src/main/browser-tabs.js";
import { PortForwardManager } from "../src/main/port-forwards.js";
import { readGitMetadata } from "../src/main/git.js";
import { resolveRepoPath } from "../src/main/path-safety.js";
import { testRemoteMachineConnection } from "../src/main/remote-machines.js";
import { createDefaultSecretStore } from "../src/main/secrets.js";
import { assertHarnessInstallable, checkRepoPermission, generateMachineId, getMachineId, installHarness, isHarnessInstalled, resolveGitHubIdentity, uninstallHarness } from "../src/main/teamwork-harness.js";
import { deleteTeamContextBranch, hasLocalContextBranch, TeamworkSync } from "../src/main/teamwork-sync.js";
import { scanTasks, watchTasks } from "../src/main/teamwork-tasks.js";
import { generateKnowledgeSite, getKnowledgeSitePath } from "../src/main/knowledge-site.js";
import { spawnCoreClient, type CoreClient } from "./core-client.js";
import { setPluginEnabledConfig } from "../src/main/config.js";
import type { PluginSummary } from "../src/plugins/plugin-host.js";

export type IpcRuntime = {
  userDataPath: string;
  configPath?: string;
};

export type IpcCallbacks = {
  onAppearanceThemeChanged?: (theme: AppearanceTheme) => void;
};

const secretStore = createDefaultSecretStore();
let core: CoreClient | null = null;
const agentSessionWatcher = new AgentSessionWatcher();
const browserManager = new BrowserManager();
const portForwardManager = new PortForwardManager({ secretStore });
const teamworkSyncInstances = new Map<string, TeamworkSync>();
const teamworkWatcherCleanups = new Map<string, () => void>();

function requireCore(): CoreClient {
  if (!core) throw new Error("Core client is not initialized; registerIpcHandlers must complete first");
  return core;
}

export function closeAllTerminalSessions(): void {
  void core?.dispose();
  browserManager.closeAll();
  void portForwardManager.closeAll();
  for (const sync of teamworkSyncInstances.values()) sync.stop();
  teamworkSyncInstances.clear();
  for (const cleanup of teamworkWatcherCleanups.values()) cleanup();
  teamworkWatcherCleanups.clear();
}

async function resolveTeamworkRepoPath(runtime: IpcRuntime, repoPath: string): Promise<string> {
  const config = await getConfiguredRoots(runtime);
  const safe = await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects);
  return safe.repoPath;
}

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

function handle<Payload, Result>(
  channel: string,
  callback: (payload: Payload) => Promise<Result>
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (_event, payload: Payload) => callback(payload));
}

export async function registerIpcHandlers(
  runtime: IpcRuntime,
  callbacks: IpcCallbacks = {}
): Promise<void> {
  if (!core) {
    core = await spawnCoreClient();
    const config = await getConfiguredRoots(runtime);
    await core.call("applyDisabledPlugins", [config.disabledPluginIds ?? []]);
  } else {
    core.removeAllListeners("terminalData");
    core.removeAllListeners("terminalUpdate");
    core.removeAllListeners("terminalExit");
  }
  agentSessionWatcher.removeAllListeners("status");
  browserManager.removeAllListeners("update");
  portForwardManager.removeAllListeners("update");
  core.on("terminalData", (event) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalData, event);
    });
  });
  core.on("terminalUpdate", (event: TerminalUpdateEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalUpdate, event);
    });
  });
  core.on("terminalExit", (event) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalExit, event);
    });
  });
  core.on("installLog", (event) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.installLog, event);
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
  portForwardManager.on("update", (event: PortForwardEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.portForwardUpdate, event);
    });
  });

  handle<void, AppConfig>(channels.listRoots, () => getConfiguredRoots(runtime));
  handle<ProjectConfigInput, AppConfig>(channels.addProject, (payload) => addConfiguredProject(runtime, payload));
  handle<RemoveProjectInput, AppConfig>(channels.removeProject, (payload) => removeConfiguredProject(runtime, payload));
  handle<RenameProjectInput, AppConfig>(channels.renameProject, (payload) => renameProject(runtime, payload));
  handle<RemoteMachineInput, AppConfig>(channels.addRemoteMachine, async (payload) => {
    const result = await upsertConfiguredRemoteMachine(runtime, payload);
    if (payload.password && result.machine.passwordSecretId) {
      await secretStore.set(result.machine.passwordSecretId, payload.password);
      result.machine.hasPassword = true;
    }
    return result.config;
  });
  handle<RemoveRemoteMachineInput, AppConfig>(channels.removeRemoteMachine, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    const machine = config.configuredRemoteMachines.find((item) => item.id === payload.id);
    const nextConfig = await removeConfiguredRemoteMachine(runtime, payload);
    if (machine?.passwordSecretId) await secretStore.delete(machine.passwordSecretId);
    return nextConfig;
  });
  handle<{ id: string } | RemoteMachineInput, RemoteMachineTestResult>(channels.testRemoteMachine, (payload) =>
    testRemoteMachineConnection(runtime, payload, undefined, secretStore)
  );
  handle<ListPortForwardsInput | undefined, RemotePortForward[]>(channels.listPortForwards, (payload) =>
    Promise.resolve(portForwardManager.list(payload?.machineId))
  );
  handle<DetectRemotePortsInput, RemoteDetectedPort[]>(channels.detectRemotePorts, (payload) =>
    portForwardManager.detect(runtime, payload)
  );
  handle<CreatePortForwardInput, RemotePortForward>(channels.createPortForward, (payload) =>
    portForwardManager.create(runtime, payload)
  );
  handle<RemovePortForwardInput, { ok: true }>(channels.removePortForward, async (payload) => {
    await portForwardManager.remove(payload);
    return { ok: true };
  });
  ipcMain.removeHandler(channels.pickProjectFolder);
  ipcMain.handle(channels.pickProjectFolder, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { cancelled: true, paths: [] };
    const result = await dialog.showOpenDialog(window, {
      title: "Select project folder",
      properties: ["openDirectory"],
      message: "Choose a project directory to add",
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
    requireCore().call("scanProjects", [runtime, payload])
  );
  handle<{ projectUri: string }, ProjectDetail>(channels.getProjectDetail, (payload) =>
    requireCore().call("getProjectDetail", [runtime, payload])
  );
  handle<ProjectFilesInput, ProjectFilesResult>(channels.listProjectFiles, (payload) =>
    requireCore().call("listProjectFiles", [runtime, payload])
  );
  handle<ReadFileInput, ReadFileResult>(channels.readProjectFile, (payload) =>
    requireCore().call("readProjectFile", [runtime, payload])
  );
  handle<WriteFileInput, WriteFileResult>(channels.writeProjectFile, (payload) =>
    requireCore().call("writeProjectFile", [runtime, payload])
  );
  handle<{ cwdUri?: string } | undefined, AgentCli[]>(channels.listAgentClis, (payload) =>
    requireCore().call("listAgentClis", [runtime, payload])
  );
  handle<ListInstallRecipesInput, InstallRecipe[]>(channels.listInstallRecipes, (payload) =>
    requireCore().call("listInstallRecipes", [runtime, payload])
  );
  handle<InstallToolInput, InstallToolResult>(channels.installTool, (payload) =>
    requireCore().call("installTool", [runtime, payload])
  );
  handle<{ targetId: string; options?: ProfileReadOptions }, MachineProfile>(channels.readMachineProfile, (payload) =>
    requireCore().call("readMachineProfile", [runtime, payload.targetId, payload.options])
  );
  handle<{ projectUri: string; options?: ProfileReadOptions }, ProjectProfile>(channels.readProjectProfile, (payload) =>
    requireCore().call("readProjectProfile", [runtime, payload.projectUri, payload.options])
  );
  handle<PathExistsInput, PathExistsResult>(channels.pathExistsOnTarget, (payload) =>
    requireCore().call("pathExistsOnTarget", [runtime, payload])
  );
  handle<void, PluginSummary[]>(channels.listPlugins, () =>
    requireCore().call("listPlugins", [])
  );
  handle<{ pluginId: string; enabled: boolean }, PluginSummary[]>(channels.setPluginEnabled, async (payload) => {
    await setPluginEnabledConfig(runtime, payload.pluginId, payload.enabled);
    return requireCore().call("setPluginEnabled", [payload.pluginId, payload.enabled]);
  });
  handle<void, DiagnosticsSnapshot>(channels.readDiagnostics, () =>
    requireCore().call("readDiagnostics", [])
  );
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
    requireCore().call("createTerminal", [runtime, payload])
  );
  handle<TerminalInput, TerminalSession | null>(channels.terminalInput, (payload) =>
    requireCore().call("inputTerminal", [payload])
  );
  handle<TerminalResizeInput, TerminalSession | null>(channels.resizeTerminal, (payload) =>
    requireCore().call("resizeTerminal", [payload])
  );
  handle<TerminalCloseInput, TerminalSession | null>(channels.closeTerminal, (payload) =>
    requireCore().call("closeTerminal", [payload])
  );

  handle<TeamworkGetTasksInput, TaskViewModel[]>(channels.teamworkGetTasks, async (payload) => {
    const repoPath = await resolveTeamworkRepoPath(runtime, payload.repoPath);
    const tasks = await scanTasks(repoPath);
    if (!teamworkWatcherCleanups.has(repoPath)) {
      const cleanup = watchTasks(repoPath, (updated) => {
        const event: TeamworkTasksChangedEvent = { repoPath, tasks: updated };
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send(channels.teamworkTasksChanged, event);
        });
      });
      teamworkWatcherCleanups.set(repoPath, cleanup);
    }
    return tasks;
  });

  handle<{ repoPath: string }, TeamworkStatus>(channels.teamworkGetStatus, async (payload) => {
    const repoPath = await resolveTeamworkRepoPath(runtime, payload.repoPath);
    return getTeamworkStatus(repoPath);
  });

  handle<void, GitHubIdentity>(channels.teamworkResolveIdentity, async () => resolveGitHubIdentity());

  handle<TeamworkInstallInput, TeamworkStatus>(channels.teamworkInstall, async (payload) => {
    const repoPath = await resolveTeamworkRepoPath(runtime, payload.repoPath);
    return installTeamwork(repoPath);
  });

  handle<{ repoPath: string }, TeamworkStatus>(channels.teamworkEnable, async (payload) => {
    const repoPath = await resolveTeamworkRepoPath(runtime, payload.repoPath);
    return installTeamwork(repoPath);
  });

  handle<TeamworkUninstallInput, TeamworkUninstallResult>(channels.teamworkUninstall, async (payload) => {
    const repoPath = await resolveTeamworkRepoPath(runtime, payload.repoPath);
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
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.teamworkTasksChanged, event);
    });
    return { ...result, contextBranchDeleted };
  });

  handle<{ repoPath: string }, void>(channels.teamworkSyncNow, async (payload) => {
    const repoPath = await resolveTeamworkRepoPath(runtime, payload.repoPath);
    let sync = teamworkSyncInstances.get(repoPath);
    if (!sync) {
      sync = new TeamworkSync(repoPath);
      sync.start();
      teamworkSyncInstances.set(repoPath, sync);
    }
    await sync.syncOnce();
  });

  handle<{ repoPath: string }, KnowledgeSiteResult>(channels.knowledgeSiteGenerate, async (payload) => {
    const repoPath = await resolveTeamworkRepoPath(runtime, payload.repoPath);
    return generateKnowledgeSite(repoPath);
  });

  handle<{ repoPath: string }, string>(channels.knowledgeSiteGetPath, async (payload) => {
    const repoPath = await resolveTeamworkRepoPath(runtime, payload.repoPath);
    return getKnowledgeSitePath(repoPath);
  });
}
