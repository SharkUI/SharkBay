import { execFile } from "node:child_process";
import { BrowserWindow, dialog, ipcMain } from "electron";
import {
  addConfiguredProject,
  getConfiguredRoots,
  removeConfiguredProject,
  renameProject,
  setAppearanceTheme,
} from "../src/main/config.js";
import type {
  AgentCli,
  AgentProjectStatusEvent,
  AppConfig,
  AppearanceTheme,
  AppearanceThemeInput,
  CodeGraphProjectStatus,
  UsageReportFilter,
  UsageReportResult,
  UsageSummary,
  BrowserActionInput,
  BrowserCloseInput,
  BrowserCreateInput,
  BrowserNavigateInput,
  BrowserResizeInput,
  BrowserSession,
  BrowserUpdateEvent,
  InstallToolInput,
  InstallToolResult,
  InstallRecipe,
  KnowledgeSiteResult,
  ListInstallRecipesInput,
  DiagnosticsSnapshot,
  PathExistsInput,
  PathExistsResult,
  ProjectConfigInput,
  ProjectScanInput,
  ProjectDetail,
  ProjectFilesInput,
  ProjectFilesResult,
  ReadFileInput,
  ReadFileResult,
  WriteFileInput,
  WriteFileResult,
  RenameProjectInput,
  RemoveProjectInput,
  ScanProjectsResult,
  GitHubIdentity,
  TaskViewModel,
  TasksGetInput,
  ProtocolInstallInput,
  ProtocolStatus,
  TasksChangedEvent,
  ProtocolUninstallInput,
  ProtocolUninstallResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent
} from "../src/shared/types.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { CODEGRAPH_PLUGIN_ID } from "../src/plugins/bundled/codegraph-detector.js";
import { AgentSessionWatcher } from "../src/main/agent-clis.js";
import { TokenUsageDb } from "../src/main/token-usage-db.js";
import { TokenUsageCollector } from "../src/main/token-usage-collector.js";
import { BrowserManager } from "../src/main/browser-tabs.js";
import { readGitMetadata } from "../src/main/git.js";
import { resolveRepoPath } from "../src/main/path-safety.js";
import { assertHarnessInstallable, checkRepoPermission, generateMachineId, getHarnessUpdateStatus, getLocalHarnessIdentity, getMachineId, installHarness, isHarnessInstalled, resolveGitHubIdentity, uninstallHarness, updateHarnessFiles } from "../src/main/harness.js";
import { deleteTeamContextBranch, hasLocalContextBranch, TeamworkSync } from "../src/main/teamwork-sync.js";
import { scanTasks, watchTasks } from "../src/main/tasks.js";
import { generateKnowledgeSite, getKnowledgeSitePath } from "../src/main/knowledge-site.js";
import { spawnCoreClient, type CoreClient } from "./core-client.js";
import { setPluginEnabledConfig } from "../src/main/config.js";
import type { PluginSummary } from "../src/plugins/plugin-host.js";
import { HookBridge } from "../src/main/hooks/bridge.js";
import { AgentHookStateManager } from "../src/main/hooks/state-manager.js";
import { ClaudeConnector, CodexConnector, QwenConnector } from "../src/main/hooks/connectors/claude-family.js";
import { GeminiConnector } from "../src/main/hooks/connectors/gemini.js";
import { KiroConnector } from "../src/main/hooks/connectors/kiro.js";
import { CodeWhaleConnector } from "../src/main/hooks/connectors/codewhale.js";
import { OpenCodeConnector } from "../src/main/hooks/connectors/opencode.js";
import type { AgentConnector } from "../src/main/hooks/types.js";
import { parseHookSessions } from "../src/main/hooks/sessions.js";

export type IpcRuntime = {
  userDataPath: string;
  configPath?: string;
};

export type IpcCallbacks = {
  onAppearanceThemeChanged?: (theme: AppearanceTheme) => void;
};

let core: CoreClient | null = null;
let tokenUsageDb: TokenUsageDb | null = null;
const agentSessionWatcher = new AgentSessionWatcher();
const browserManager = new BrowserManager();

const hookBridge = new HookBridge();
const hookStateManager = new AgentHookStateManager();
const hookConnectors = new Map<string, AgentConnector>([
  ["claude", new ClaudeConnector()],
  ["codex", new CodexConnector()],
  ["qwen", new QwenConnector()],
  ["codewhale", new CodeWhaleConnector()],
  ["gemini", new GeminiConnector()],
  ["kiro", new KiroConnector()],
  ["opencode", new OpenCodeConnector()],
]);
for (const connector of hookConnectors.values()) {
  hookStateManager.registerConnector(connector);
}
const syncInstances = new Map<string, TeamworkSync>();
const taskWatcherCleanups = new Map<string, () => void>();

// Terminal PID → terminal session ID cache (for hook→tab matching)
const terminalPidToId = new Map<number, string>();
// Agent hook sessionId → resolved terminal session ID
const hookSessionToTerminal = new Map<string, string>();
// Hook sessions pending PID resolution (pid → hookSessionId)
const pendingHookResolutions = new Map<string, number>();

function resolveTerminalForPid(agentPid: number): Promise<string | null> {
  return new Promise((resolve) => {
    let currentPid = agentPid;
    let steps = 0;
    const walk = () => {
      if (steps++ > 5 || currentPid <= 1) { resolve(null); return; }
      execFile("ps", ["-o", "ppid=", "-p", String(currentPid)], { timeout: 2000 }, (err, stdout) => {
        if (err) { resolve(null); return; }
        const ppid = parseInt(stdout.trim(), 10);
        if (isNaN(ppid) || ppid <= 1) { resolve(null); return; }
        const terminalId = terminalPidToId.get(ppid);
        if (terminalId) { resolve(terminalId); return; }
        currentPid = ppid;
        walk();
      });
    };
    walk();
  });
}

function requireCore(): CoreClient {
  if (!core) throw new Error("Core client is not initialized; registerIpcHandlers must complete first");
  return core;
}

export function closeAllTerminalSessions(): void {
  void core?.dispose();
  browserManager.closeAll();
  for (const sync of syncInstances.values()) sync.stop();
  syncInstances.clear();
  for (const cleanup of taskWatcherCleanups.values()) cleanup();
  taskWatcherCleanups.clear();
}

async function resolveProtocolRepoPath(runtime: IpcRuntime, repoPath: string): Promise<string> {
  const config = await getConfiguredRoots(runtime);
  const safe = await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects);
  return safe.repoPath;
}

async function syncForStatus(repoPath: string, installed: boolean): Promise<TeamworkSync | null> {
  const existing = syncInstances.get(repoPath);
  if (existing) return existing;
  if (!installed || !await hasLocalContextBranch(repoPath)) return null;

  const sync = new TeamworkSync(repoPath);
  sync.start();
  syncInstances.set(repoPath, sync);
  return sync;
}

async function getProtocolStatus(repoPath: string): Promise<ProtocolStatus> {
  const harnessInstalled = await isHarnessInstalled(repoPath);
  const contextAvailable = await hasLocalContextBranch(repoPath);
  const installed = harnessInstalled && contextAvailable;
  const identity = harnessInstalled ? await getLocalHarnessIdentity(repoPath) : {};
  const sync = await syncForStatus(repoPath, installed);
  const syncStatus = sync?.getStatus();
  const harnessUpdate = harnessInstalled ? await getHarnessUpdateStatus(repoPath) : { required: false, files: [] };
  return {
    installed,
    harnessInstalled,
    harnessUpdate,
    syncEnabled: syncStatus?.enabled ?? false,
    lastSyncAt: syncStatus?.lastSyncAt ?? null,
    pendingCount: syncStatus?.pendingCount ?? 0,
    lastError: syncStatus?.lastError ?? null,
    githubLogin: identity.githubLogin,
    githubUserId: identity.githubUserId,
    machineId: identity.machineId,
  };
}

async function installProtocol(repoPath: string): Promise<ProtocolStatus> {
  await assertHarnessInstallable(repoPath);
  const identity = await resolveGitHubIdentity();
  const gitMeta = await readGitMetadata(repoPath);
  const repo = githubRepoFromRemote(gitMeta.remoteOrigin);
  if (!repo) {
    throw new Error("Protocol requires a GitHub origin remote. Configure remote.origin.url before installing.");
  }

  const permission = await checkRepoPermission(repo, identity.login);
  if (permission !== "admin" && permission !== "write") {
    throw new Error(`Insufficient permission: ${permission}. Need at least write.`);
  }

  const sync = syncInstances.get(repoPath) ?? new TeamworkSync(repoPath);
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
  syncInstances.set(repoPath, sync);
  const syncStatus = sync.getStatus();
  return {
    installed: true,
    harnessInstalled: true,
    harnessUpdate: { required: false, files: [] },
    syncEnabled: syncStatus.enabled,
    lastSyncAt: syncStatus.lastSyncAt,
    pendingCount: syncStatus.pendingCount,
    lastError: syncStatus.lastError,
    githubLogin: identity.login,
    githubUserId: identity.id,
    machineId,
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
    throw new Error("Only the repository owner can clean all task records.");
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
  core.on("terminalData", (event) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalData, event);
    });
  });
  core.on("terminalUpdate", (event: TerminalUpdateEvent) => {
    if (event.session.pid != null && event.session.agentId) {
      terminalPidToId.set(event.session.pid, event.session.id);
      // Retry pending hook resolutions now that a new terminal PID is registered
      for (const [sessionId, pid] of pendingHookResolutions) {
        resolveTerminalForPid(pid).then((terminalId) => {
          if (!terminalId) return;
          hookSessionToTerminal.set(sessionId, terminalId);
          pendingHookResolutions.delete(sessionId);
          const state = hookStateManager.getStatus(null, sessionId);
          if (state) {
            const statusEvent: AgentProjectStatusEvent = {
              agentId: state.agent,
              projectPath: state.projectPath,
              sessionId: state.sessionId,
              text: state.action,
              timestamp: state.timestamp,
              hookState: state.state,
              pid: state.pid,
              terminalSessionId: terminalId,
            };
            BrowserWindow.getAllWindows().forEach((window) => {
              window.webContents.send(channels.agentStatus, statusEvent);
            });
          }
        });
      }
    }
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalUpdate, event);
    });
  });
  core.on("terminalExit", (event) => {
    for (const [pid, id] of terminalPidToId) {
      if (id === event.sessionId) { terminalPidToId.delete(pid); break; }
    }
    for (const [sid, tid] of hookSessionToTerminal) {
      if (tid === event.sessionId) { hookSessionToTerminal.delete(sid); break; }
    }
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

  if (!tokenUsageDb) {
    tokenUsageDb = new TokenUsageDb(runtime.userDataPath);
    const collector = new TokenUsageCollector(tokenUsageDb);
    agentSessionWatcher.setUsageCollector(collector);
    collector.backfill().catch(() => {});
  }

  agentSessionWatcher.start();

  // Hook-based agent status system
  hookBridge.removeAllListeners("event");
  hookBridge.on("event", (msg) => hookStateManager.handleMessage(msg));
  hookStateManager.removeAllListeners("stateChange");
  hookStateManager.on("stateChange", (event) => {
    const cached = hookSessionToTerminal.get(event.sessionId);
    const sendStatus = (terminalSessionId?: string) => {
      const statusEvent: AgentProjectStatusEvent = {
        agentId: event.agent,
        projectPath: event.projectPath,
        sessionId: event.sessionId,
        text: event.action,
        timestamp: event.timestamp,
        hookState: event.state,
        pid: event.pid,
        terminalSessionId,
      };
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(channels.agentStatus, statusEvent);
      });
    };

    if (cached) {
      sendStatus(cached);
    } else if (event.pid != null) {
      resolveTerminalForPid(event.pid).then((terminalId) => {
        if (terminalId) {
          hookSessionToTerminal.set(event.sessionId, terminalId);
          pendingHookResolutions.delete(event.sessionId);
        } else {
          pendingHookResolutions.set(event.sessionId, event.pid!);
        }
        sendStatus(terminalId ?? undefined);
      });
    } else {
      sendStatus(undefined);
    }
  });
  hookBridge.start(runtime.userDataPath).catch(() => {});

  browserManager.on("update", (event: BrowserUpdateEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.browserUpdate, event);
    });
  });

  handle<void, AppConfig>(channels.listRoots, () => getConfiguredRoots(runtime));
  handle<ProjectConfigInput, AppConfig>(channels.addProject, (payload) => addConfiguredProject(runtime, payload));
  handle<RemoveProjectInput, AppConfig>(channels.removeProject, (payload) => removeConfiguredProject(runtime, payload));
  handle<RenameProjectInput, AppConfig>(channels.renameProject, (payload) => renameProject(runtime, payload));
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
  handle<{ projectUri: string }, CodeGraphProjectStatus>(channels.codeGraphGetStatus, (payload) =>
    requireCore().call("readCodeGraphStatus", [runtime, payload])
  );
  handle<{ projectUri: string }, CodeGraphProjectStatus>(channels.codeGraphEnsureStatus, (payload) =>
    requireCore().call("ensureCodeGraphStatus", [runtime, payload])
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
  handle<{ agentId: string; enabled: boolean }, void>(channels.setHooksEnabled, async (payload) => {
    const connector = hookConnectors.get(payload.agentId);
    if (!connector) return;
    if (payload.enabled) {
      const { join } = await import("node:path");
      const hookCliPath = join(runtime.userDataPath, "bin", "sharkbay-hook");
      await connector.install(hookCliPath, hookBridge.path);
    } else {
      await connector.uninstall();
    }
  });
  handle<{ repoPath: string }, import("../src/shared/types.js").HookSessionViewModel[]>(channels.hookGetSessions, async (payload) => {
    return parseHookSessions(payload.repoPath);
  });
  handle<PathExistsInput, PathExistsResult>(channels.pathExistsOnTarget, (payload) =>
    requireCore().call("pathExistsOnTarget", [runtime, payload])
  );
  handle<void, PluginSummary[]>(channels.listPlugins, () =>
    requireCore().call("listPlugins", [])
  );
  handle<{ pluginId: string; enabled: boolean }, PluginSummary[]>(channels.setPluginEnabled, async (payload) => {
    const config = await setPluginEnabledConfig(runtime, payload.pluginId, payload.enabled);
    const plugins = await requireCore().call("setPluginEnabled", [payload.pluginId, payload.enabled]);
    if (payload.pluginId === CODEGRAPH_PLUGIN_ID && !payload.enabled) {
      const projectUris = config.configuredProjects.map((projectPath) => toLocalProjectUri(projectPath));
      await requireCore().call("removeCodeGraphIndexes", [runtime, { projectUris }]);
    }
    return plugins;
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
  handle<TerminalCreateInput, TerminalSession>(channels.createTerminal, async (payload) => {
    const session = await requireCore().call("createTerminal", [runtime, payload]);
    if (session.pid != null && session.agentId) {
      terminalPidToId.set(session.pid, session.id);
    }
    return session;
  });
  handle<TerminalInput, TerminalSession | null>(channels.terminalInput, (payload) =>
    requireCore().call("inputTerminal", [payload])
  );
  ipcMain.on(channels.terminalInput, (_event, payload: TerminalInput) => {
    void requireCore().call("inputTerminal", [payload]);
  });
  handle<TerminalResizeInput, TerminalSession | null>(channels.resizeTerminal, (payload) =>
    requireCore().call("resizeTerminal", [payload])
  );
  handle<TerminalCloseInput, TerminalSession | null>(channels.closeTerminal, (payload) =>
    requireCore().call("closeTerminal", [payload])
  );

  handle<TasksGetInput, TaskViewModel[]>(channels.protocolGetTasks, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    const tasks = await scanTasks(repoPath);
    if (!taskWatcherCleanups.has(repoPath)) {
      const cleanup = watchTasks(repoPath, (updated) => {
        const event: TasksChangedEvent = { repoPath, tasks: updated };
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send(channels.protocolTasksChanged, event);
        });
      });
      taskWatcherCleanups.set(repoPath, cleanup);
    }
    return tasks;
  });

  handle<{ repoPath: string }, ProtocolStatus>(channels.protocolGetStatus, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return getProtocolStatus(repoPath);
  });

  handle<void, GitHubIdentity>(channels.protocolResolveIdentity, async () => resolveGitHubIdentity());

  handle<ProtocolInstallInput, ProtocolStatus>(channels.protocolInstall, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return installProtocol(repoPath);
  });

  handle<{ repoPath: string }, ProtocolStatus>(channels.protocolEnable, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return installProtocol(repoPath);
  });

  handle<ProtocolUninstallInput, ProtocolUninstallResult>(channels.protocolUninstall, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    const sync = syncInstances.get(repoPath);
    sync?.stop();
    syncInstances.delete(repoPath);

    let contextBranchDeleted = false;
    if (payload.cleanTeamContext) {
      await assertContextCleanupOwner(repoPath);
      contextBranchDeleted = await deleteTeamContextBranch(repoPath);
    }

    const result = await uninstallHarness(repoPath);
    const cleanup = taskWatcherCleanups.get(repoPath);
    cleanup?.();
    taskWatcherCleanups.delete(repoPath);
    const event: TasksChangedEvent = { repoPath, tasks: [] };
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.protocolTasksChanged, event);
    });
    return { ...result, contextBranchDeleted };
  });

  handle<{ repoPath: string }, void>(channels.protocolSyncNow, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    let sync = syncInstances.get(repoPath);
    if (!sync) {
      sync = new TeamworkSync(repoPath);
      sync.start();
      syncInstances.set(repoPath, sync);
    }
    await sync.syncOnce();
  });

  handle<{ repoPath: string }, ProtocolStatus>(channels.protocolUpdateHarness, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    await updateHarnessFiles(repoPath);
    return getProtocolStatus(repoPath);
  });

  handle<{ repoPath: string }, KnowledgeSiteResult>(channels.knowledgeSiteGenerate, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return generateKnowledgeSite(repoPath);
  });

  handle<{ repoPath: string }, string>(channels.knowledgeSiteGetPath, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return getKnowledgeSitePath(repoPath);
  });

  handle<{ periodDays?: number } | undefined, UsageSummary>(channels.usageGetSummary, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    return tokenUsageDb!.getSummary(payload?.periodDays ?? 1, config.configuredProjects);
  });

  handle<UsageReportFilter, UsageReportResult>(channels.usageGetReport, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    return tokenUsageDb!.getReport(payload ?? {}, config.configuredProjects);
  });
}
