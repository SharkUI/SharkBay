import { BrowserWindow, dialog, ipcMain } from "electron";
import {
  addConfiguredRoot,
  addConfiguredProject,
  getConfiguredRoots,
  removeConfiguredRoot,
  removeConfiguredProject,
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
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent
} from "../src/shared/types.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import { AgentSessionWatcher, listAgentClisForUri } from "../src/main/agent-clis.js";
import { BrowserManager } from "../src/main/browser-tabs.js";
import { SharkBayCore } from "../src/main/core/sharkbay-core.js";
import { PortForwardManager } from "../src/main/port-forwards.js";
import { testRemoteMachineConnection } from "../src/main/remote-machines.js";
import { createDefaultSecretStore } from "../src/main/secrets.js";

export type IpcRuntime = {
  userDataPath: string;
  configPath?: string;
};

export type IpcCallbacks = {
  onAppearanceThemeChanged?: (theme: AppearanceTheme) => void;
};

const core = new SharkBayCore();
const agentSessionWatcher = new AgentSessionWatcher();
const browserManager = new BrowserManager();
const secretStore = createDefaultSecretStore();
const portForwardManager = new PortForwardManager({ secretStore });

export function closeAllTerminalSessions(): void {
  core.closeAllTerminalSessions();
  browserManager.closeAll();
  void portForwardManager.closeAll();
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
  core.removeAllListeners("terminalData");
  core.removeAllListeners("terminalUpdate");
  core.removeAllListeners("terminalExit");
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
  handle<RootConfigInput, AppConfig>(channels.addRoot, (payload) => addConfiguredRoot(runtime, payload));
  handle<RemoveRootInput, AppConfig>(channels.removeRoot, (payload) => removeConfiguredRoot(runtime, payload));
  handle<ProjectConfigInput, AppConfig>(channels.addProject, (payload) => addConfiguredProject(runtime, payload));
  handle<RemoveProjectInput, AppConfig>(channels.removeProject, (payload) => removeConfiguredProject(runtime, payload));
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
    core.scanProjects(runtime, payload)
  );
  handle<{ projectUri: string }, ProjectDetail>(channels.getProjectDetail, (payload) =>
    core.getProjectDetail(runtime, payload)
  );
  handle<ProjectFilesInput, ProjectFilesResult>(channels.listProjectFiles, (payload) =>
    core.listProjectFiles(runtime, payload)
  );
  handle<ReadFileInput, ReadFileResult>(channels.readProjectFile, (payload) =>
    core.readProjectFile(runtime, payload)
  );
  handle<WriteFileInput, WriteFileResult>(channels.writeProjectFile, (payload) =>
    core.writeProjectFile(runtime, payload)
  );
  handle<{ cwdUri?: string } | undefined, AgentCli[]>(channels.listAgentClis, (payload) =>
    listAgentClisForUri(runtime, payload?.cwdUri, { secretStore })
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
    core.createTerminal(runtime, payload)
  );
  handle<TerminalInput, TerminalSession>(channels.terminalInput, (payload) =>
    Promise.resolve(core.inputTerminal(payload))
  );
  handle<TerminalResizeInput, TerminalSession>(channels.resizeTerminal, (payload) =>
    Promise.resolve(core.resizeTerminal(payload))
  );
  handle<TerminalCloseInput, TerminalSession>(channels.closeTerminal, (payload) =>
    Promise.resolve(core.closeTerminal(payload))
  );
}
