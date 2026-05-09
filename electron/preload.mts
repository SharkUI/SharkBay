import { contextBridge, ipcRenderer } from "electron";
import { appChannels } from "../src/shared/app-events.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type {
  AppConfig,
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
    setAppearanceTheme: (input: AppearanceThemeInput) => invoke<AppConfig>(channels.setAppearanceTheme, input)
  },
  projects: {
    scan: (input?: ProjectScanInput) => invoke<ScanProjectsResult>(channels.scanProjects, input),
    getDetail: (input: { repoPath: string }) => invoke<ProjectDetail>(channels.getProjectDetail, input),
    listFiles: (input: ProjectFilesInput) => invoke<ProjectFilesResult>(channels.listProjectFiles, input)
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
  }
};

contextBridge.exposeInMainWorld("sharkBay", sharkBayApi);

export type SharkBayApi = typeof sharkBayApi;
