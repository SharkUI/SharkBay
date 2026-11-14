import { BrowserWindow, dialog, ipcMain, shell, type WebContents } from "electron";
import { BrowserManager } from "../src/main/browser-tabs.js";
import { CaffeinateController } from "../src/main/caffeinate.js";
import { shareLocalArtifact, type ShareArtifactInput, type ShareArtifactResult } from "../src/main/share-artifact.js";
import { showSharePopover, type ShowSharePopoverInput } from "../src/main/share-popover.js";
import { closeFindPopover, focusFindPopover, isFindPopoverOpen, sendFindResult, showFindPopover } from "./find-popover.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import { appChannels } from "../src/shared/app-events.js";
import type { AppConfig, AppearanceTheme, BrowserActionInput, BrowserCloseInput, BrowserCreateInput, BrowserFindInput, BrowserFoundInPageEvent, BrowserNavigateInput, BrowserResizeInput, BrowserSession, BrowserStopFindInput, BrowserUpdateEvent, CloneProjectInput, CloneProjectResult, FindPopoverOpenInput } from "../src/shared/types.js";
import type { RuntimeClient } from "../src/runtime/control-client.js";

export type IpcCallbacks = {
  onAppearanceThemeChanged?: (theme: AppearanceTheme) => void;
  onStatusChangeNotificationsChanged?: (config: Pick<AppConfig, "statusChangeNotificationsEnabled" | "agentStatusCompletionSoundEnabled" | "agentStatusApprovalSoundEnabled">) => void;
};
const browserManager = new BrowserManager();
const caffeinate = new CaffeinateController();
let activeFindBrowserId: string | null = null;
let lastFindQuery = "";
let refocusPopoverOnResult = false;
let runtimeClient: RuntimeClient | undefined;
export function shouldAllowBrowserCertificateError(webContents: WebContents, url: string): boolean { return browserManager.shouldAllowCertificateError(webContents, url); }
export async function openRuntimeInBrowser(): Promise<void> { if (!runtimeClient) throw new Error("Runtime is not connected"); await shell.openExternal(await runtimeClient.call<string>("connect")); }
export async function disconnectRuntime(): Promise<void> { runtimeClient?.dispose(); await caffeinate.setActive(false); }
function handle<P, R>(channel: string, callback: (payload: P) => Promise<R>): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (event, payload: P) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Main frame required");
    return callback(payload);
  });
}
export async function registerIpcHandlers(client: RuntimeClient, callbacks: IpcCallbacks = {}): Promise<void> {
  runtimeClient = client;
  client.on("event", (name, payload) => {
    if (name === "runtime:config") {
      callbacks.onAppearanceThemeChanged?.((payload as AppConfig).appearanceTheme);
      callbacks.onStatusChangeNotificationsChanged?.(payload as AppConfig);
    }
    const channel = name === "desktop:restoreAgentSession" ? appChannels.restoreAgentSession : name === "desktop:launchAgentSession" ? appChannels.launchAgentSession : name;
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(channel, payload);
  });
  client.on("disconnected", () => { for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(channels.runtimeConnection, "disconnected"); });
  const methods: Record<string, string> = {
    [channels.listRoots]: "config.get", [channels.addProject]: "config.addProject", [channels.removeProject]: "config.removeProject", [channels.renameProject]: "config.renameProject", [channels.createWorktree]: "config.createWorktree",
    [channels.setAppearanceTheme]: "config.setAppearanceTheme", [channels.setStatusChangeNotifications]: "config.setStatusChangeNotifications", [channels.setCaffeinateMode]: "config.setCaffeinateMode", [channels.setTerminalAppearance]: "config.setTerminalAppearance",
    [channels.scanProjects]: "projects.scan", [channels.getProjectDetail]: "projects.getDetail", [channels.projectSetupStatus]: "projects.getSetupStatus", [channels.readProjectGitHub]: "projects.getGitHub", [channels.listProjectFiles]: "projects.listFiles", [channels.readProjectFile]: "projects.readFile", [channels.writeProjectFile]: "projects.writeFile", [channels.deleteProjectFile]: "projects.deleteFile", [channels.renameProjectFile]: "projects.renameFile",
    [channels.codeGraphGetStatus]: "codeGraph.getStatus", [channels.codeGraphEnsureStatus]: "codeGraph.ensureStatus", [channels.listAgentClis]: "agents.listClis", [channels.listInstallRecipes]: "agents.listInstallRecipes", [channels.installTool]: "agents.installTool", [channels.setHooksEnabled]: "agents.setHooksEnabled", [channels.hookGetSessions]: "hooks.getSessions", [channels.pathExistsOnTarget]: "targets.pathExists", [channels.listPlugins]: "plugins.list", [channels.setPluginEnabled]: "plugins.setEnabled", [channels.readDiagnostics]: "diagnostics.read",
    [channels.createTerminal]: "terminal.create", [channels.terminalInput]: "terminal.input", [channels.resizeTerminal]: "terminal.resize", [channels.closeTerminal]: "terminal.close", [channels.startReview]: "reviews.start", [channels.cancelReview]: "reviews.cancel", [channels.recordSessionPrompt]: "terminal.recordPrompt", [channels.recordPromptHistoryEntry]: "terminal.recordPromptHistoryEntry", [channels.loadSessionPromptHistory]: "terminal.loadPromptHistory",
    [channels.protocolGetTasks]: "protocol.getTasks", [channels.protocolGetStatus]: "protocol.getStatus", [channels.protocolInstall]: "protocol.install", [channels.protocolEnable]: "protocol.enable", [channels.protocolUninstall]: "protocol.uninstall", [channels.protocolResolveIdentity]: "protocol.resolveIdentity", [channels.protocolSyncNow]: "protocol.syncNow", [channels.protocolUpdateHarness]: "protocol.updateHarness", [channels.usageGetSummary]: "usage.getSummary", [channels.usageGetReport]: "usage.getReport",
    [channels.telegramGetConfig]: "telegram.getConfig", [channels.telegramSetToken]: "telegram.setToken", [channels.telegramSetEnabled]: "telegram.setEnabled", [channels.telegramGeneratePairCode]: "telegram.generatePairCode", [channels.telegramRevokeUser]: "telegram.revokeUser",
  };
  const command = (method: string, input: any) => {
    if (method === "projects.scan") input = undefined;
    if (method === "projects.listFiles") input = { projectUri: input.projectUri, directoryPath: input.directoryPath };
    if (method === "protocol.install" || method === "protocol.enable") input = { repoPath: input.repoPath };
    return client.call(method, input);
  };
  for (const [channel, method] of Object.entries(methods)) handle(channel, (input) => command(method, input));
  for (const [channel, method] of [[channels.terminalInput, "terminal.input"], [channels.recordSessionPrompt, "terminal.recordPrompt"], [channels.recordPromptHistoryEntry, "terminal.recordPromptHistoryEntry"]]) {
    ipcMain.on(channel!, (_event, input) => { void command(method!, input).catch((error) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channels.runtimeNotice, error.message); }); });
  }
  handle(channels.runtimeHello, () => client.call("hello", { protocol: 1 }));
  handle(channels.runtimeList, () => client.call("terminal.list"));
  handle(channels.runtimeAttach, (input) => client.call("terminal.attach", input));
  handle(channels.runtimeClaim, (input) => client.call("terminal.claim", input));
  handle(channels.runtimeConnect, () => client.call("connect"));
  handle(channels.setCaffeinateActive, async (input: { active: boolean }) => { await caffeinate.setActive(input.active === true); });
  browserManager.on("update", (event: BrowserUpdateEvent, ownerWindow) => {
    const windows = event.reason === "created" ? [ownerWindow] : BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      window.webContents.send(channels.browserUpdate, event);
    });
  });
  browserManager.on("foundInPage", (event: BrowserFoundInPageEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.browserFoundInPage, event);
    });
    if (isFindPopoverOpen() && activeFindBrowserId) {
      sendFindResult({ current: event.matches === 0 ? 0 : event.activeMatchOrdinal, total: event.matches });
      if (refocusPopoverOnResult) {
        refocusPopoverOnResult = false;
        focusFindPopover();
      }
    }
  });

  ipcMain.removeHandler(channels.cloneProject);
  ipcMain.handle(channels.cloneProject, async (event, payload: CloneProjectInput): Promise<CloneProjectResult> => {
    let parentPath = payload.parentPath?.trim();
    if (!parentPath) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return { cancelled: true };
      const result = await dialog.showOpenDialog(window, {
        title: "Select clone destination",
        properties: ["openDirectory"],
        message: "Choose where to clone the remote repository",
      });
      if (result.canceled || !result.filePaths[0]) return { cancelled: true };
      parentPath = result.filePaths[0];
    }
    return client.call("config.cloneProject", { ...payload, parentPath });
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
  handle<BrowserFindInput, void>(channels.browserFind, (payload) => {
    browserManager.find(payload);
    return Promise.resolve();
  });
  handle<BrowserStopFindInput, void>(channels.browserStopFind, (payload) => {
    browserManager.stopFind(payload);
    return Promise.resolve();
  });
  ipcMain.removeHandler(channels.findPopoverOpen);
  ipcMain.handle(channels.findPopoverOpen, (event, payload: FindPopoverOpenInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    activeFindBrowserId = payload.browserId;
    lastFindQuery = "";
    browserManager.stopFind({ browserId: payload.browserId });
    showFindPopover(window, { anchor: payload.anchor, theme: payload.theme });
  });
  handle<void, void>(channels.findPopoverClose, () => {
    closeFindPopover();
    if (activeFindBrowserId) browserManager.stopFind({ browserId: activeFindBrowserId });
    activeFindBrowserId = null;
    lastFindQuery = "";
    return Promise.resolve();
  });
  ipcMain.on(channels.findPopoverQuery, (_event, text: string) => {
    if (!activeFindBrowserId) return;
    lastFindQuery = typeof text === "string" ? text : "";
    if (!lastFindQuery) {
      browserManager.stopFind({ browserId: activeFindBrowserId });
      sendFindResult({ current: 0, total: 0 });
      return;
    }
    // Use findNext:true even for the initial search: Electron reliably emits
    // `found-in-page` (with the match count) for findNext:true, whereas a
    // findNext:false request often does not. For a freshly-changed term this
    // still starts a new search and selects the first match.
    refocusPopoverOnResult = true;
    browserManager.find({ browserId: activeFindBrowserId, text: lastFindQuery, findNext: true, forward: true });
  });
  ipcMain.on(channels.findPopoverStep, (_event, forward: boolean) => {
    if (!activeFindBrowserId || !lastFindQuery) return;
    refocusPopoverOnResult = true;
    browserManager.find({ browserId: activeFindBrowserId, text: lastFindQuery, findNext: true, forward: forward !== false });
  });
  ipcMain.on(channels.findPopoverDismiss, () => {
    closeFindPopover();
    if (activeFindBrowserId) browserManager.stopFind({ browserId: activeFindBrowserId });
    activeFindBrowserId = null;
    lastFindQuery = "";
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(appChannels.findClosed);
    });
  });
  handle<{ url: string }, void>(channels.openExternal, async (payload) => {
    await shell.openExternal(payload.url);
  });

  handle<ShareArtifactInput, ShareArtifactResult>(channels.shareArtifact, async (payload) => {
    return shareLocalArtifact(payload);
  });

  ipcMain.removeHandler(channels.sharePopover);
  ipcMain.handle(channels.sharePopover, (event, payload: ShowSharePopoverInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) showSharePopover(window, payload);
  });

  ipcMain.on(channels.islandFocusSession, (_event, terminalSessionId: string) => {
    const allWindows = BrowserWindow.getAllWindows();
    const mainWin = allWindows.find((w) => !w.isAlwaysOnTop());
    const islandWin = allWindows.find((w) => w.isAlwaysOnTop());
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
      mainWin.webContents.send("app:focusTerminalSession", terminalSessionId);
    }
    if (islandWin && !islandWin.isDestroyed()) {
      islandWin.webContents.send("island:collapse");
    }
  });


  handle(channels.islandGetAllSessions, () => client.call("desktop.sessions"));
  ipcMain.on(channels.islandTabsSync, (_event, tabs: unknown) => {
    if (!Array.isArray(tabs)) return;
    void client.call("desktop.tabs", tabs).catch(() => {});
    const island = BrowserWindow.getAllWindows().find((window) => window.isAlwaysOnTop());
    if (island && !island.isDestroyed()) island.webContents.send("island:tabs", tabs);
  });
}
