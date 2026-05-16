import { contextBridge, ipcRenderer } from "electron";
import { appChannels } from "../src/shared/app-events.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type {
  AgentCli,
  AgentProjectStatusEvent,
  AppConfig,
  AppearanceThemeInput,
  BrowserActionInput,
  BrowserCloseInput,
  BrowserCreateInput,
  BrowserNavigateInput,
  BrowserResizeInput,
  BrowserSession,
  BrowserUpdateEvent,
  CreatePortForwardInput,
  InstallToolInput,
  InstallToolResult,
  InstallRecipe,
  ListInstallRecipesInput,
  ListPortForwardsInput,
  MachineProfile,
  PortForwardEvent,
  ProfileReadOptions,
  ProjectConfigInput,
  ProjectProfile,
  ProjectScanInput,
  ProjectDetail,
  ProjectFilesInput,
  ProjectFilesResult,
  ReadFileInput,
  ReadFileResult,
  WriteFileInput,
  WriteFileResult,
  RemoteMachineInput,
  RemoteMachineTestResult,
  RemotePortForward,
  RemoveProjectInput,
  RemovePortForwardInput,
  RemoveRemoteMachineInput,
  RemoveRootInput,
  RootConfigInput,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent
} from "../src/shared/types.js";

const openSettingsListeners = new Set<() => void>();
let openSettingsPending = false;

ipcRenderer.on(appChannels.openSettings, () => {
  if (!openSettingsListeners.size) {
    openSettingsPending = true;
    return;
  }
  openSettingsListeners.forEach((callback) => callback());
});

function invoke<Result>(channel: string, payload?: unknown): Promise<Result> {
  return ipcRenderer.invoke(channel, payload) as Promise<Result>;
}

const sharkBayApi = {
  app: {
    onOpenSettings: (callback: () => void) => {
      openSettingsListeners.add(callback);
      if (openSettingsPending) {
        openSettingsPending = false;
        queueMicrotask(callback);
      }
      return () => openSettingsListeners.delete(callback);
    }
  },
  config: {
    listRoots: () => invoke<AppConfig>(channels.listRoots),
    addRoot: (input: RootConfigInput) => invoke<AppConfig>(channels.addRoot, input),
    removeRoot: (input: RemoveRootInput) => invoke<AppConfig>(channels.removeRoot, input),
    addProject: (input: ProjectConfigInput) => invoke<AppConfig>(channels.addProject, input),
    removeProject: (input: RemoveProjectInput) => invoke<AppConfig>(channels.removeProject, input),
    addRemoteMachine: (input: RemoteMachineInput) => invoke<AppConfig>(channels.addRemoteMachine, input),
    removeRemoteMachine: (input: RemoveRemoteMachineInput) => invoke<AppConfig>(channels.removeRemoteMachine, input),
    testRemoteMachine: (input: { id: string } | RemoteMachineInput) => invoke<RemoteMachineTestResult>(channels.testRemoteMachine, input),
    pickProjectFolder: () => invoke<{ cancelled: boolean; paths: string[] }>(channels.pickProjectFolder),
    setAppearanceTheme: (input: AppearanceThemeInput) => invoke<AppConfig>(channels.setAppearanceTheme, input)
  },
  projects: {
    scan: (input?: ProjectScanInput) => invoke<ScanProjectsResult>(channels.scanProjects, input),
    getDetail: (input: { projectUri: string }) => invoke<ProjectDetail>(channels.getProjectDetail, input),
    listFiles: (input: ProjectFilesInput) => invoke<ProjectFilesResult>(channels.listProjectFiles, input),
    readFile: (input: ReadFileInput) => invoke<ReadFileResult>(channels.readProjectFile, input),
    writeFile: (input: WriteFileInput) => invoke<WriteFileResult>(channels.writeProjectFile, input)
  },
  terminal: {
    create: (input: TerminalCreateInput) => invoke<TerminalSession>(channels.createTerminal, input),
    input: (input: TerminalInput) => invoke<TerminalSession>(channels.terminalInput, input),
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
    onStatus: (callback: (event: AgentProjectStatusEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AgentProjectStatusEvent) => callback(payload);
      ipcRenderer.on(channels.agentStatus, listener);
      return () => ipcRenderer.removeListener(channels.agentStatus, listener);
    }
  },
  profiles: {
    readMachine: (input: { targetId: string; options?: ProfileReadOptions }) =>
      invoke<MachineProfile>(channels.readMachineProfile, input),
    readProject: (input: { projectUri: string; options?: ProfileReadOptions }) =>
      invoke<ProjectProfile>(channels.readProjectProfile, input)
  },
  portForwards: {
    list: (input?: ListPortForwardsInput) => invoke<RemotePortForward[]>(channels.listPortForwards, input),
    create: (input: CreatePortForwardInput) => invoke<RemotePortForward>(channels.createPortForward, input),
    remove: (input: RemovePortForwardInput) => invoke<{ ok: true }>(channels.removePortForward, input),
    onUpdate: (callback: (event: PortForwardEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PortForwardEvent) => callback(payload);
      ipcRenderer.on(channels.portForwardUpdate, listener);
      return () => ipcRenderer.removeListener(channels.portForwardUpdate, listener);
    }
  }
};

contextBridge.exposeInMainWorld("sharkBay", sharkBayApi);

export type SharkBayApi = typeof sharkBayApi;
