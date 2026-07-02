import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flushPromptStore, registerIpcHandlers, shouldAllowBrowserCertificateError, shutdownCore } from "./ipc.js";
import { createApplicationMenuTemplate } from "../src/main/application-menu.js";
import { getRuntimeConfigPath, loadAppConfig } from "../src/main/config.js";
import { appChannels } from "../src/shared/app-events.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type { AppConfig, AppearanceTheme } from "../src/shared/types.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
let islandWindow: BrowserWindow | null = null;
let appearanceTheme: AppearanceTheme = "morning";
let isQuitting = false;

app.setName("SharkBay");

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
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow(): BrowserWindow {
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

  window.once("ready-to-show", () => {
    const showWindow = () => { if (!window.isDestroyed()) window.show(); };
    const timeout = setTimeout(showWindow, 5000);
    ipcMain.once(channels.contentReady, () => { clearTimeout(timeout); showWindow(); });
  });

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

  if (app.isPackaged) {
    void window.loadFile(join(currentDir, "../../dist/renderer/index.html"));
  } else {
    void window.loadURL(devServerUrl);
    if (process.env.SHARKBAY_OPEN_DEVTOOLS === "1") {
      window.webContents.openDevTools({ mode: "detach" });
    }
  }

  return window;
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
    window.show();
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

app.whenReady().then(async () => {
  process.env.SHARKBAY_LOCALE = app.getLocale();

  const runtime = {
    userDataPath: app.getPath("userData"),
    configPath: process.env.SHARKBAY_CONFIG_PATH,
  };
  const config = await loadAppConfig(getRuntimeConfigPath(runtime));
  appearanceTheme = config.appearanceTheme;

  await registerIpcHandlers(runtime, {
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

  installApplicationMenu();
  installDockIcon();

  // Dock badge/bounce disabled — island provides sufficient notification.
  // ipcMain.on(channels.dockBadgeUpdate, (_event, count: number) => {
  //   if (process.platform !== "darwin" || !app.dock) return;
  //   const badge = count > 0 ? String(count) : "";
  //   app.dock.setBadge(badge);
  //   if (count > 0) app.dock.bounce("informational");
  // });

  mainWindow = createMainWindow();
  islandWindow = createIslandWindow(config);

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
});

app.on("window-all-closed", () => {
  mainWindow = null;

  if (process.platform !== "darwin") {
    app.quit();
  }
});

let cleanupComplete = false;

app.on("before-quit", (event) => {
  isQuitting = true;

  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.destroy();
    islandWindow = null;
  }
  flushPromptStore();

  if (cleanupComplete) return;

  // Defer the actual quit until background CodeGraph jobs are cancelled and the
  // core utility process has been shut down cleanly, so no codegraph process
  // group is orphaned (issue #15).
  event.preventDefault();
  const cleanupDone = shutdownCore().catch(() => {
    // Best-effort: fall through to quit even if cleanup failed.
  });
  const cleanupTimeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
  void Promise.race([cleanupDone, cleanupTimeout]).finally(() => {
    cleanupComplete = true;
    app.quit();
  });
});
