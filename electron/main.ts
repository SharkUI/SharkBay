import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeAllTerminalSessions, flushPromptStore, registerIpcHandlers } from "./ipc.js";
import { createApplicationMenuTemplate } from "../src/main/application-menu.js";
import { getRuntimeConfigPath, loadAppConfig } from "../src/main/config.js";
import { appChannels } from "../src/shared/app-events.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type { AppearanceTheme } from "../src/shared/types.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
let islandWindow: BrowserWindow | null = null;
let appearanceTheme: AppearanceTheme = "day";

app.setName("SharkBay");

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

function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate({
    appName: "SharkBay",
    isMac: process.platform === "darwin",
    openSettings: openSettingsFromApplicationMenu,
    newTerminalTab: newTerminalTabFromApplicationMenu,
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

function createIslandWindow(): BrowserWindow {
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
  islandWindow = createIslandWindow();

  mainWindow.on("focus", () => {
    if (process.platform === "darwin" && app.dock) app.dock.setBadge("");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  mainWindow = null;

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.destroy();
    islandWindow = null;
  }
  flushPromptStore();
  closeAllTerminalSessions();
});
