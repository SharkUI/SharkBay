import { app, BrowserWindow, Menu, nativeImage, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeAllTerminalSessions, registerIpcHandlers } from "./ipc.js";
import { createApplicationMenuTemplate } from "../src/main/application-menu.js";
import { getRuntimeConfigPath, loadAppConfig } from "../src/main/config.js";
import { appChannels } from "../src/shared/app-events.js";
import type { AppearanceTheme } from "../src/shared/types.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
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

function sendOpenSettings(window: BrowserWindow): void {
  const send = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(appChannels.openSettings);
    }
  };

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", send);
    return;
  }

  send();
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

function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate({
    appName: "SharkBay",
    isMac: process.platform === "darwin",
    openSettings: openSettingsFromApplicationMenu,
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
    window.show();
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

app.whenReady().then(async () => {
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
  mainWindow = createMainWindow();

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
  closeAllTerminalSessions();
});
