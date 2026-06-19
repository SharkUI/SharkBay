import { contextBridge, ipcRenderer } from "electron";
import { appChannels } from "../src/shared/app-events.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type { PluginSummary } from "../src/plugins/plugin-host.js";
import type {
  AgentCli,
  AgentProjectStatusEvent,
  AppConfig,
  AppearanceThemeInput,
  StatusChangeNotificationsInput,
  BrowserActionInput,
  BrowserCloseInput,
  BrowserCreateInput,
  BrowserNavigateInput,
  BrowserResizeInput,
  BrowserSession,
  BrowserUpdateEvent,
  CodeGraphProjectStatus,
  DeleteFileInput,
  DeleteFileResult,
  InstallToolInput,
  InstallToolResult,
  InstallRecipe,
  KnowledgeSiteResult,
  ListInstallRecipesInput,
  DiagnosticsSnapshot,
  InstallLogEvent,
  PathExistsInput,
  PathExistsResult,
  CloneProjectInput,
  CloneProjectResult,
  ProjectConfigInput,
  ProjectScanInput,
  ProjectDetail,
  GitHubInfo,
  ProjectFilesInput,
  ProjectFilesResult,
  ReadFileInput,
  ReadFileResult,
  RenameFileInput,
  RenameFileResult,
  WriteFileInput,
  WriteFileResult,
  RenameProjectInput,
  RemoveProjectInput,
  CreateWorktreeInput,
  CreateWorktreeResult,
  ScanProjectsResult,
  TaskViewModel,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent,
  ArtifactReadyEvent,
  TasksGetInput,
  ProtocolInstallInput,
  ProtocolStatus,
  TasksChangedEvent,
  ProtocolUninstallInput,
  ProtocolUninstallResult,
  GitHubIdentity,
  UsageReportFilter,
  UsageReportResult,
  UsageSummary,
  HookSessionViewModel
} from "../src/shared/types.js";

function createAppEventSubscription(channel: string) {
  const listeners = new Set<() => void>();
  let pending = false;
  ipcRenderer.on(channel, () => {
    if (!listeners.size) {
      pending = true;
      return;
    }
    listeners.forEach((callback) => callback());
  });
  return (callback: () => void) => {
    listeners.add(callback);
    if (pending) {
      pending = false;
      queueMicrotask(callback);
    }
    return () => listeners.delete(callback);
  };
}

const onOpenSettings = createAppEventSubscription(appChannels.openSettings);
const onNewTerminalTab = createAppEventSubscription(appChannels.newTerminalTab);

const focusTerminalSessionListeners = new Set<(id: string) => void>();
ipcRenderer.on(appChannels.focusTerminalSession, (_ev, id: string) => {
  focusTerminalSessionListeners.forEach((cb) => cb(id));
});
const onFocusTerminalSession = (callback: (id: string) => void) => {
  focusTerminalSessionListeners.add(callback);
  return () => focusTerminalSessionListeners.delete(callback);
};

function invoke<Result>(channel: string, payload?: unknown): Promise<Result> {
  return ipcRenderer.invoke(channel, payload) as Promise<Result>;
}

const sharkBayApi = {
  app: {
    onOpenSettings,
    onNewTerminalTab,
    onFocusTerminalSession,
  },
  config: {
    listRoots: () => invoke<AppConfig>(channels.listRoots),
    addProject: (input: ProjectConfigInput) => invoke<AppConfig>(channels.addProject, input),
    cloneProject: (input: CloneProjectInput) => invoke<CloneProjectResult>(channels.cloneProject, input),
    removeProject: (input: RemoveProjectInput) => invoke<AppConfig>(channels.removeProject, input),
    renameProject: (input: RenameProjectInput) => invoke<AppConfig>(channels.renameProject, input),
    pickProjectFolder: () => invoke<{ cancelled: boolean; paths: string[] }>(channels.pickProjectFolder),
    createWorktree: (input: CreateWorktreeInput) => invoke<CreateWorktreeResult>(channels.createWorktree, input),
    setAppearanceTheme: (input: AppearanceThemeInput) => invoke<AppConfig>(channels.setAppearanceTheme, input),
    setStatusChangeNotifications: (input: StatusChangeNotificationsInput) => invoke<AppConfig>(channels.setStatusChangeNotifications, input)
  },
  projects: {
    scan: (input?: ProjectScanInput) => invoke<ScanProjectsResult>(channels.scanProjects, input),
    getDetail: (input: { projectUri: string }) => invoke<ProjectDetail>(channels.getProjectDetail, input),
    getGitHub: (input: { projectUri: string }) => invoke<GitHubInfo>(channels.readProjectGitHub, input),
    listFiles: (input: ProjectFilesInput) => invoke<ProjectFilesResult>(channels.listProjectFiles, input),
    readFile: (input: ReadFileInput) => invoke<ReadFileResult>(channels.readProjectFile, input),
    writeFile: (input: WriteFileInput) => invoke<WriteFileResult>(channels.writeProjectFile, input),
    deleteFile: (input: DeleteFileInput) => invoke<DeleteFileResult>(channels.deleteProjectFile, input),
    renameFile: (input: RenameFileInput) => invoke<RenameFileResult>(channels.renameProjectFile, input)
  },
  codeGraph: {
    getStatus: (input: { projectUri: string }) => invoke<CodeGraphProjectStatus>(channels.codeGraphGetStatus, input),
    ensureStatus: (input: { projectUri: string }) => invoke<CodeGraphProjectStatus>(channels.codeGraphEnsureStatus, input)
  },
  terminal: {
    create: (input: TerminalCreateInput) => invoke<TerminalSession>(channels.createTerminal, input),
    input: (input: TerminalInput) => invoke<TerminalSession>(channels.terminalInput, input),
    inputFire: (input: TerminalInput) => { ipcRenderer.send(channels.terminalInput, input); },
    recordPrompt: (input: { terminalSessionId: string; text: string }) => { ipcRenderer.send(channels.recordSessionPrompt, input); },
    recordPromptHistoryEntry: (input: { key: string; text: string }) => { ipcRenderer.send(channels.recordPromptHistoryEntry, input); },
    loadPromptHistory: (input: { sessionId: string }) => invoke<string[]>(channels.loadSessionPromptHistory, input),
    resize: (input: TerminalResizeInput) => invoke<TerminalSession>(channels.resizeTerminal, input),
    close: (input: TerminalCloseInput) => invoke<TerminalSession>(channels.closeTerminal, input),
    onData: (callback: (event: TerminalDataEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent) => callback(payload);
      ipcRenderer.on(channels.terminalData, listener);
      return () => ipcRenderer.removeListener(channels.terminalData, listener);
    },
    onExit: (callback: (event: TerminalExitEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent) => callback(payload);
      ipcRenderer.on(channels.terminalExit, listener);
      return () => ipcRenderer.removeListener(channels.terminalExit, listener);
    },
    onUpdate: (callback: (event: TerminalUpdateEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TerminalUpdateEvent) => callback(payload);
      ipcRenderer.on(channels.terminalUpdate, listener);
      return () => ipcRenderer.removeListener(channels.terminalUpdate, listener);
    },
    onArtifactReady: (callback: (event: ArtifactReadyEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ArtifactReadyEvent) => callback(payload);
      ipcRenderer.on(channels.openArtifact, listener);
      return () => ipcRenderer.removeListener(channels.openArtifact, listener);
    }
  },
  browser: {
    create: (input: BrowserCreateInput) => invoke<BrowserSession>(channels.createBrowser, input),
    navigate: (input: BrowserNavigateInput) => invoke<BrowserSession>(channels.browserNavigate, input),
    resize: (input: BrowserResizeInput) => invoke<BrowserSession>(channels.browserResize, input),
    close: (input: BrowserCloseInput) => invoke<BrowserSession>(channels.browserClose, input),
    goBack: (input: BrowserActionInput) => invoke<BrowserSession>(channels.browserGoBack, input),
    goForward: (input: BrowserActionInput) => invoke<BrowserSession>(channels.browserGoForward, input),
    reload: (input: BrowserActionInput) => invoke<BrowserSession>(channels.browserReload, input),
    onUpdate: (callback: (event: BrowserUpdateEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: BrowserUpdateEvent) => callback(payload);
      ipcRenderer.on(channels.browserUpdate, listener);
      return () => ipcRenderer.removeListener(channels.browserUpdate, listener);
    }
  },
  agents: {
    listClis: (input?: { cwdUri?: string }) => invoke<AgentCli[]>(channels.listAgentClis, input),
    listInstallRecipes: (input: ListInstallRecipesInput) => invoke<InstallRecipe[]>(channels.listInstallRecipes, input),
    installTool: (input: InstallToolInput) => invoke<InstallToolResult>(channels.installTool, input),
    setHooksEnabled: (input: { agentId: string; enabled: boolean }) => invoke<void>(channels.setHooksEnabled, input),
    onStatus: (callback: (event: AgentProjectStatusEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AgentProjectStatusEvent) => callback(payload);
      ipcRenderer.on(channels.agentStatus, listener);
      return () => ipcRenderer.removeListener(channels.agentStatus, listener);
    },
    onInstallLog: (callback: (event: InstallLogEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: InstallLogEvent) => callback(payload);
      ipcRenderer.on(channels.installLog, listener);
      return () => ipcRenderer.removeListener(channels.installLog, listener);
    }
  },
  targets: {
    pathExists: (input: PathExistsInput) => invoke<PathExistsResult>(channels.pathExistsOnTarget, input)
  },
  plugins: {
    list: () => invoke<PluginSummary[]>(channels.listPlugins),
    setEnabled: (input: { pluginId: string; enabled: boolean }) => invoke<PluginSummary[]>(channels.setPluginEnabled, input)
  },
  diagnostics: {
    read: () => invoke<DiagnosticsSnapshot>(channels.readDiagnostics)
  },
  protocol: {
    getTasks: (input: TasksGetInput) => invoke<TaskViewModel[]>(channels.protocolGetTasks, input),
    getStatus: (input: { repoPath: string }) => invoke<ProtocolStatus>(channels.protocolGetStatus, input),
    install: (input: ProtocolInstallInput) => invoke<ProtocolStatus>(channels.protocolInstall, input),
    enable: (input: { repoPath: string }) => invoke<ProtocolStatus>(channels.protocolEnable, input),
    uninstall: (input: ProtocolUninstallInput) => invoke<ProtocolUninstallResult>(channels.protocolUninstall, input),
    resolveIdentity: () => invoke<GitHubIdentity>(channels.protocolResolveIdentity),
    syncNow: (input: { repoPath: string }) => invoke<void>(channels.protocolSyncNow, input),
    updateHarness: (input: { repoPath: string }) => invoke<ProtocolStatus>(channels.protocolUpdateHarness, input),
    onTasksChanged: (callback: (event: TasksChangedEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TasksChangedEvent) => callback(payload);
      ipcRenderer.on(channels.protocolTasksChanged, listener);
      return () => ipcRenderer.removeListener(channels.protocolTasksChanged, listener);
    }
  },
  hooks: {
    getSessions: (input: { repoPath: string }) => invoke<HookSessionViewModel[]>(channels.hookGetSessions, input),
  },
  knowledgeSite: {
    generate: (input: { repoPath: string }) => invoke<KnowledgeSiteResult>(channels.knowledgeSiteGenerate, input),
    getPath: (input: { repoPath: string }) => invoke<string>(channels.knowledgeSiteGetPath, input)
  },
  usage: {
    getSummary: (input?: { periodDays?: number }) => invoke<UsageSummary>(channels.usageGetSummary, input),
    getReport: (input: UsageReportFilter) => invoke<UsageReportResult>(channels.usageGetReport, input),
  },
  dock: {
    updateBadge: (count: number) => { ipcRenderer.send(channels.dockBadgeUpdate, count); },
    contentReady: () => { ipcRenderer.send(channels.contentReady); },
    syncIslandTabs: (tabs: Array<{ sessionId: string; title: string; projectName: string; agentId?: string; state: string; lastPrompt?: string }>) => { ipcRenderer.send(channels.islandTabsSync, tabs); },
  },
  shell: {
    openExternal: (input: { url: string }) => invoke<void>(channels.openExternal, input),
  }
};

contextBridge.exposeInMainWorld("sharkBay", sharkBayApi);

export type SharkBayApi = typeof sharkBayApi;
