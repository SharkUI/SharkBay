import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFile, mkdir } from "node:fs/promises";
import { openRuntimeInBrowser, registerIpcHandlers, shouldAllowBrowserCertificateError, disconnectRuntime } from "./ipc.js";
import { createApplicationMenuTemplate } from "../src/main/application-menu.js";
import electronUpdater from "electron-updater";
import { AppUpdates } from "../src/main/app-updates.js";
import { ensureRuntime } from "./runtime-client.js";
import { appChannels } from "../src/shared/app-events.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type { AppConfig, AppearanceTheme } from "../src/shared/types.js";
import { createStartupTimer } from "../src/main/startup-timing.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5184";

let mainWindow: BrowserWindow | null = null;
let islandWindow: BrowserWindow | null = null;
let islandEnabled = true;
let appearanceTheme: AppearanceTheme = "morning";
let isQuitting = false;
let appUpdates: AppUpdates | null = null;
let installUpdateOnQuit = false;
let startupLogDirectory: Promise<unknown> | undefined;
const startup = createStartupTimer("desktop", (line) => {
  console.info(line);
  const directory = app.getPath("userData");
  startupLogDirectory ??= mkdir(directory, { recursive: true });
  void startupLogDirectory.then(() => appendFile(join(directory, "startup.log"), `${line}\n`)).catch(() => {});
});

if (!app.isPackaged || app.getName() === "sharkbay") app.setName("SharkBay");
if (process.env.SHARKBAY_ELECTRON_DATA_DIR) app.setPath("userData", process.env.SHARKBAY_ELECTRON_DATA_DIR);
const ownsWindow = app.requestSingleInstanceLock();
if (!ownsWindow) app.quit();
app.on("second-instance", () => { mainWindow?.show(); mainWindow?.focus(); });

app.on("certificate-error", (event, webContents, url, _error, _certificate, callback) => {
  if (shouldAllowBrowserCertificateError(webContents, url)) {
    event.preventDefault();
    callback(true);
    return;
  }
  callback(false);
});

// In development `concurrently -k` sends SIGTERM (and Ctrl+C sends SIGINT) to the
// Electron process. The normal before-quit path defers quitting until CodeGraph /
// core cleanup finishes, which can hang and leave an orphaned Electron process that
// must be killed with `kill -9`. On a terminal signal, exit immediately so dev
// restarts never strand a process.
function forceQuitOnSignal(): void {
  try {
    app.exit(0);
  } catch {
    process.exit(0);
  }
}
process.once("SIGTERM", forceQuitOnSignal);
process.once("SIGINT", forceQuitOnSignal);

function getResourcePath(fileName: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, "resources", fileName)
    : join(app.getAppPath(), "resources", fileName);
}

function getAppIconPath(theme = appearanceTheme): string {
  if (theme === "morning") return getResourcePath("shark-morning.png");
  return getResourcePath(theme === "night" ? "shark-night.png" : "shark-day.png");
}

function installDockIcon(theme = appearanceTheme): void {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const icon = nativeImage.createFromPath(getAppIconPath(theme));
  if (!icon.isEmpty()) {
    app.dock.setIcon(icon);
  }
}

function setAppearanceTheme(theme: AppearanceTheme): void {
  appearanceTheme = theme;
  installDockIcon(theme);
}

function sendAppEvent(window: BrowserWindow, channel: string): void {
  const send = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel);
    }
  };

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", send);
    return;
  }

  send();
}

function sendOpenSettings(window: BrowserWindow): void {
  sendAppEvent(window, appChannels.openSettings);
}

function sendNewTerminalTab(window: BrowserWindow): void {
  sendAppEvent(window, appChannels.newTerminalTab);
}

function sendOpenFind(window: BrowserWindow): void {
  sendAppEvent(window, appChannels.openFind);
}

function openSettingsFromApplicationMenu(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  sendOpenSettings(mainWindow);
}

function newTerminalTabFromApplicationMenu(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  sendNewTerminalTab(mainWindow);
}

function openFindFromApplicationMenu(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  sendOpenFind(mainWindow);
}

function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate({
    appName: "SharkBay",
    isMac: process.platform === "darwin",
    openSettings: openSettingsFromApplicationMenu,
    newTerminalTab: newTerminalTabFromApplicationMenu,
    openFind: openFindFromApplicationMenu,
    openInBrowser: () => { void openRuntimeInBrowser().catch(console.error); },
    checkForUpdates: () => {
      if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      void appUpdates?.check(true);
    },
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow(loading = false): BrowserWindow {
  const preload = join(currentDir, "preload.mjs");
  const icon = getAppIconPath();
  const window = new BrowserWindow({
    width: 1500,
    height: 860,
    minWidth: 1180,
    minHeight: 680,
    title: "SharkBay",
    icon,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    backgroundColor: appearanceTheme === "night" ? "#101719" : "#f7f8fa",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload
    }
  });
  startup("main-window-created");

  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) window.show();
    startup("main-window-shown");
  });
  const onContentReady = (event: Electron.IpcMainEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
    startup("initial-project-scan-finished");
    ipcMain.removeListener(channels.contentReady, onContentReady);
  };
  ipcMain.on(channels.contentReady, onContentReady);
  window.once("closed", () => ipcMain.removeListener(channels.contentReady, onContentReady));

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.on("close", (event) => {
    if (process.platform !== "darwin" || isQuitting) return;
    event.preventDefault();
    window.hide();
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (loading) {
    const text = app.getLocale().startsWith("zh") ? "正在准备工作区…" : "Preparing your workspace…";
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>SharkBay</title><style>
      :root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;font:15px system-ui;color:#526168;background:#f7f8fa}h1{font-size:28px;font-weight:600;color:#22363d}p{margin:0}@media(prefers-color-scheme:dark){body{color:#9cadb4;background:#101719}h1{color:#e3ecee}}
      </style></head><body><h1>SharkBay</h1><p role="status">${text}</p></body></html>`;
    // A fast connection may replace this document with the workspace mid-load.
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
  } else {
    void loadMainWindowContent(window).catch(() => startup("main-renderer-failed"));
  }

  return window;
}

async function loadMainWindowContent(window: BrowserWindow): Promise<void> {
  if (app.isPackaged) {
    await window.loadFile(join(currentDir, "../../dist/renderer/index.html"));
  } else {
    await window.loadURL(devServerUrl);
    if (process.env.SHARKBAY_OPEN_DEVTOOLS === "1") {
      window.webContents.openDevTools({ mode: "detach" });
    }
  }
  startup("main-renderer-loaded");
}

function setIslandEnabled(enabled: boolean): void {
  if (islandEnabled === enabled) return;
  islandEnabled = enabled;
  if (!islandWindow || islandWindow.isDestroyed()) return;
  islandWindow.webContents.send("island:collapse");
  islandWindow.setIgnoreMouseEvents(true, { forward: true });
  if (enabled) islandWindow.show();
  else islandWindow.hide();
}

function createIslandWindow(config: Pick<AppConfig, "statusChangeNotificationsEnabled" | "agentStatusCompletionSoundEnabled" | "agentStatusApprovalSoundEnabled">): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.size;
  // On notch Macs, workArea.y gives the menu bar / notch height.
  // We position the window at the very top of the screen (bounds.y)
  // and let the HTML content handle vertical offset so the pill
  // visually merges with the notch's black area.
  const menuBarHeight = primaryDisplay.workArea.y - primaryDisplay.bounds.y;
  const panelWidth = 520;
  const panelHeight = 360 + menuBarHeight;
  const x = Math.round((screenWidth - panelWidth) / 2) + primaryDisplay.bounds.x;
  const y = primaryDisplay.bounds.y;

  const preload = join(currentDir, "island-preload.mjs");
  const window = new BrowserWindow({
    x,
    y,
    width: panelWidth,
    height: panelHeight,
    frame: false,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    // macOS: a `panel` window with `focusable: false` becomes a non-activating
    // NSPanel, so clicking the island does NOT activate SharkBay or bring the main
    // window to the front. Opening + locating a session is still explicit via the
    // islandFocusSession IPC (mainWin.show()/focus()) on a session-card click.
    type: process.platform === "darwin" ? "panel" : undefined,
    show: false,
    enableLargerThanScreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload,
    },
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  window.setAlwaysOnTop(true, "screen-saver");

  const islandPath = join(app.getAppPath(), "src/island/island.html");

  void window.loadFile(islandPath);
  window.once("ready-to-show", () => {
    window.setSize(panelWidth, menuBarHeight + 32);
    window.webContents.send("island:preferences", {
      statusChangeNotificationsEnabled: config.statusChangeNotificationsEnabled !== false,
      agentStatusCompletionSoundEnabled: config.agentStatusCompletionSoundEnabled !== false,
      agentStatusApprovalSoundEnabled: config.agentStatusApprovalSoundEnabled !== false,
    });
    if (islandEnabled) window.show();
  });

  ipcMain.on("island:setExpanded", (_event, expanded: boolean, height?: number) => {
    if (window.isDestroyed()) return;
    const h = expanded && height ? height : menuBarHeight + 32;
    window.setSize(panelWidth, h);
  });

  ipcMain.on("island:setIgnoreMouseEvents", (_event, ignore: boolean) => {
    if (window.isDestroyed()) return;
    if (ignore) {
      window.setIgnoreMouseEvents(true, { forward: true });
    } else {
      window.setIgnoreMouseEvents(false);
    }
  });

  // --- Auto-collapse after an auto-expand --------------------------------
  // When the island auto-expands on an attention state, collapse it again if
  // the user is active but ignores it: a mouse move without hovering the island
  // -> 3s; any keyboard input in the main window -> 1s. Hovering the island (or
  // a manual collapse) cancels the pending auto-collapse. Only auto-expands arm
  // this; hover/click opens do not.
  let autoCollapseActive = false;
  let cursorPollTimer: NodeJS.Timeout | null = null;
  let collapseTimer: NodeJS.Timeout | null = null;
  let collapseDelay = Number.POSITIVE_INFINITY;
  let lastCursorPoint: { x: number; y: number } | null = null;

  function stopAutoCollapse(): void {
    autoCollapseActive = false;
    if (cursorPollTimer) { clearInterval(cursorPollTimer); cursorPollTimer = null; }
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    collapseDelay = Number.POSITIVE_INFINITY;
    lastCursorPoint = null;
  }

  function requestCollapse(delay: number): void {
    if (!autoCollapseActive) return;
    // Keep the soonest pending collapse; ignore later/equal requests.
    if (collapseTimer && delay >= collapseDelay) return;
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseDelay = delay;
    collapseTimer = setTimeout(() => {
      stopAutoCollapse();
      if (!window.isDestroyed()) window.webContents.send("island:collapse");
    }, delay);
  }

  function startAutoCollapse(): void {
    stopAutoCollapse();
    autoCollapseActive = true;
    lastCursorPoint = screen.getCursorScreenPoint();
    cursorPollTimer = setInterval(() => {
      if (!autoCollapseActive || window.isDestroyed()) return;
      const point = screen.getCursorScreenPoint();
      const b = window.getBounds();
      const insideIsland =
        point.x >= b.x && point.x <= b.x + b.width &&
        point.y >= b.y && point.y <= b.y + b.height;
      if (insideIsland) {
        // Cursor over the island counts as hovering: user is attending, cancel.
        stopAutoCollapse();
        return;
      }
      const moved = !lastCursorPoint || point.x !== lastCursorPoint.x || point.y !== lastCursorPoint.y;
      lastCursorPoint = point;
      if (moved) requestCollapse(3000);
    }, 250);
  }

  ipcMain.on("island:beginAutoCollapse", () => {
    if (window.isDestroyed()) return;
    startAutoCollapse();
  });
  ipcMain.on("island:cancelAutoCollapse", () => {
    stopAutoCollapse();
  });
  ipcMain.on(channels.islandUserKeyboardActivity, () => {
    if (autoCollapseActive) requestCollapse(1000);
  });
  window.on("closed", () => stopAutoCollapse());

  window.setIgnoreMouseEvents(true, { forward: true });

  return window;
}

if (ownsWindow) app.whenReady().then(async () => {
  process.env.SHARKBAY_LOCALE = app.getLocale();
  startup("app-ready");
  mainWindow = createMainWindow(true);

  const runtime = await ensureRuntime(startup);
  if (isQuitting) { runtime.dispose(); return; }
  startup("runtime-connected");
  const config = await runtime.call<AppConfig>("config.get");
  startup("config-loaded");
  appearanceTheme = config.appearanceTheme;
  islandEnabled = config.islandEnabled !== false;

  await registerIpcHandlers(runtime, {
    reconnectRuntime: app.isPackaged ? () => ensureRuntime() : undefined,
    onIslandEnabledChanged: setIslandEnabled,
    onAppearanceThemeChanged: setAppearanceTheme,
    onStatusChangeNotificationsChanged: (preferences) => {
      if (!islandWindow || islandWindow.isDestroyed()) return;
      islandWindow.webContents.send("island:preferences", {
        statusChangeNotificationsEnabled: preferences.statusChangeNotificationsEnabled !== false,
        agentStatusCompletionSoundEnabled: preferences.agentStatusCompletionSoundEnabled !== false,
        agentStatusApprovalSoundEnabled: preferences.agentStatusApprovalSoundEnabled !== false,
      });
    },
  });
  startup("ipc-ready");

  appUpdates = new AppUpdates(electronUpdater.autoUpdater, app.isPackaged, (state) => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channels.appUpdateChanged, state);
    }
    if (isQuitting && cleanupComplete && state.status === "error") app.quit();
  });
  const assertUpdateSender = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error("Application updates are only available from the main window.");
    }
  };
  ipcMain.handle(channels.appUpdateGetState, (event) => {
    assertUpdateSender(event);
    return appUpdates!.getState();
  });
  ipcMain.handle(channels.appUpdateCheck, (event) => {
    assertUpdateSender(event);
    return appUpdates!.check(true);
  });
  ipcMain.handle(channels.appUpdateInstall, (event) => {
    assertUpdateSender(event);
    if (appUpdates!.getState().status !== "ready" || isQuitting) return;
    installUpdateOnQuit = true;
    app.quit();
  });

  installApplicationMenu();
  installDockIcon();

  // Dock badge/bounce disabled — island provides sufficient notification.
  // ipcMain.on(channels.dockBadgeUpdate, (_event, count: number) => {
  //   if (process.platform !== "darwin" || !app.dock) return;
  //   const badge = count > 0 ? String(count) : "";
  //   app.dock.setBadge(badge);
  //   if (count > 0) app.dock.bounce("informational");
  // });

  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
  else await loadMainWindowContent(mainWindow);
  islandWindow = createIslandWindow(config);
  appUpdates.start();

  mainWindow.on("focus", () => {
    if (process.platform === "darwin" && app.dock) app.dock.setBadge("");
  });

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}).catch((error) => {
  dialog.showErrorBox("Unable to connect to SharkBay runtime", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  mainWindow = null;

  if (process.platform !== "darwin") {
    app.quit();
  }
});

let cleanupComplete = false;
let cleanupStarted = false;

app.on("before-quit", (event) => {
  isQuitting = true;

  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.destroy();
    islandWindow = null;
  }

  if (cleanupComplete) return;

  // Only desktop resources and the client connection are closed here.
  // The independent runtime and its PTYs remain available to browser clients.
  event.preventDefault();
  if (cleanupStarted) return;
  cleanupStarted = true;
  appUpdates?.stop();
  const cleanupDone = disconnectRuntime().catch(() => {
    // Best-effort: fall through to quit even if cleanup failed.
  });
  const cleanupTimeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
  void Promise.race([cleanupDone, cleanupTimeout]).finally(() => {
    cleanupComplete = true;
    if (installUpdateOnQuit && appUpdates?.getState().status === "ready") {
      void appUpdates.install();
    } else {
      app.quit();
    }
  });
});
