import { app, BrowserWindow, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type { FindPopoverAnchor, FindPopoverResult } from "../src/shared/types.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const WIDTH = 300;
const HEIGHT = 40;

let popover: BrowserWindow | null = null;

function htmlPath(): string {
  return join(app.getAppPath(), "src/find-popover/find-popover.html");
}

function positionPopover(win: BrowserWindow, anchor: FindPopoverAnchor): void {
  const display = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
  const area = display.workArea;
  let x = anchor.x + anchor.width - WIDTH - 8;
  let y = anchor.y + 8;
  x = Math.max(area.x, Math.min(x, area.x + area.width - WIDTH));
  y = Math.max(area.y, Math.min(y, area.y + area.height - HEIGHT));
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: HEIGHT });
}

export function showFindPopover(parent: BrowserWindow, input: { anchor: FindPopoverAnchor; theme?: string }): void {
  const firstOpen = !popover || popover.isDestroyed();
  if (!popover || popover.isDestroyed()) {
    popover = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      parent,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      hasShadow: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: join(currentDir, "find-popover-preload.mjs"),
      },
    });
    popover.setAlwaysOnTop(true, "floating");
    popover.on("closed", () => { popover = null; });
  }

  const win = popover;
  const theme = input.theme ?? "day";
  positionPopover(win, input.anchor);
  if (firstOpen) {
    win.webContents.on("did-finish-load", () => {
      if (win.isDestroyed()) return;
      win.webContents.send(channels.findPopoverInit, { theme });
      win.show();
      win.focus();
    });
    void win.loadFile(htmlPath());
  } else {
    // Already loaded — just re-init theme, reposition, and refocus.
    win.webContents.send(channels.findPopoverInit, { theme });
    win.show();
    win.focus();
  }
}

export function sendFindResult(result: FindPopoverResult): void {
  if (popover && !popover.isDestroyed()) {
    popover.webContents.send(channels.findPopoverResult, result);
  }
}

export function focusFindPopover(): void {
  if (popover && !popover.isDestroyed()) {
    popover.focus();
  }
}

export function isFindPopoverOpen(): boolean {
  return Boolean(popover) && !popover!.isDestroyed();
}

export function closeFindPopover(): void {
  if (popover && !popover.isDestroyed()) popover.close();
  popover = null;
}
