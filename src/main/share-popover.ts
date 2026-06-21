import { BrowserWindow, clipboard, screen } from "electron";
import { ipcChannels as channels } from "../shared/ipc-channels.js";

export type SharePopoverAnchor = { x: number; y: number; width: number; height: number };
export type SharePopoverState =
  | { status: "loading" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

export type ShowSharePopoverInput = {
  anchor: SharePopoverAnchor;
  state: SharePopoverState;
  theme?: string;
};

const CARD_WIDTH = 320;
const MARGIN = 0; // no shadow, so the window hugs the card exactly

let popover: BrowserWindow | null = null;
let parentContents: Electron.WebContents | null = null;
let currentUrl: string | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function palette(theme: string | undefined) {
  if (theme === "night") {
    return {
      bg: "#182426",
      border: "#32474b",
      text: "#d9e5df",
      muted: "#9fb1ac",
      link: "#7fd1c4",
      error: "#f0a6a0",
      btnBg: "#2d5860",
      btnText: "#ffffff",
      closeText: "#c4d0cb",
      closeBorder: "#32474b",
    };
  }
  return {
    bg: "#ffffff",
    border: "#cfc8ba",
    text: "#2b3338",
    muted: "#5a6469",
    link: "#1f4d54",
    error: "#b0322a",
    btnBg: "#2d5860",
    btnText: "#ffffff",
    closeText: "#3a4348",
    closeBorder: "#cfc8ba",
  };
}

function bodyHtml(state: SharePopoverState): { body: string; height: number } {
  if (state.status === "loading") {
    return { body: `<div class="status">Creating share link…</div>`, height: 64 };
  }
  if (state.status === "error") {
    return {
      body:
        `<div class="status err">${escapeHtml(state.message)}</div>` +
        `<div class="actions"><a class="btn" href="https://sharkbay.popover/retry">Retry</a>` +
        `<a class="btn ghost" href="https://sharkbay.popover/close">Close</a></div>`,
      height: 132,
    };
  }
  return {
    body:
      `<a class="link" href="https://sharkbay.popover/open">${escapeHtml(state.url)}</a>` +
      `<div class="actions"><a class="btn" href="https://sharkbay.popover/copy">Copy link</a>` +
      `<a class="btn" href="https://sharkbay.popover/open">Open</a>` +
      `<a class="btn ghost" href="https://sharkbay.popover/close">Close</a></div>`,
    height: 148,
  };
}

function renderHtml(state: SharePopoverState, theme: string | undefined): { html: string; height: number } {
  const c = palette(theme);
  const { body, height } = bodyHtml(state);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; background: transparent; }
    body { padding: ${MARGIN}px; font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif; }
    .card { display: flex; flex-direction: column; gap: 10px; padding: 12px;
      background: ${c.bg}; color: ${c.text};
      border: 1px solid ${c.border}; border-radius: 10px; }
    .status { color: ${c.text}; }
    .status.err { color: ${c.error}; }
    .link { font: 600 12px/1.5 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      color: ${c.link}; word-break: break-all; text-decoration: underline; cursor: pointer; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    .btn { min-height: 30px; display: inline-flex; align-items: center; padding: 6px 12px;
      font-weight: 700; font-size: 12px; color: ${c.btnText}; background: ${c.btnBg};
      border: 1px solid ${c.btnBg}; border-radius: 6px; text-decoration: none; cursor: pointer; }
    .btn.ghost { color: ${c.closeText}; background: transparent; border-color: ${c.closeBorder}; }
  </style></head><body><div class="card">${body}</div></body></html>`;
  return { html, height: height + MARGIN * 2 };
}

function positionPopover(win: BrowserWindow, anchor: SharePopoverAnchor, width: number, height: number): void {
  const display = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
  const area = display.workArea;
  // Right-align the card (minus its transparent margin) under the button.
  let x = anchor.x + anchor.width - (width - MARGIN);
  let y = anchor.y + anchor.height - MARGIN + 6;
  x = Math.max(area.x, Math.min(x, area.x + area.width - width));
  y = Math.max(area.y, Math.min(y, area.y + area.height - height));
  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

function handleAction(action: string): void {
  if (action === "copy" && currentUrl) clipboard.writeText(currentUrl);
  else if (action === "open" && currentUrl && parentContents && !parentContents.isDestroyed()) {
    parentContents.send(channels.shareOpenUrl, currentUrl);
  }
  closeSharePopover();
}

export function showSharePopover(parent: BrowserWindow, input: ShowSharePopoverInput): void {
  parentContents = parent.webContents;
  currentUrl = input.state.status === "done" ? input.state.url : currentUrl;
  const { html, height } = renderHtml(input.state, input.theme);
  const width = CARD_WIDTH + MARGIN * 2;

  if (!popover || popover.isDestroyed()) {
    popover = new BrowserWindow({
      width,
      height,
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
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    popover.setAlwaysOnTop(true, "floating");
    popover.webContents.on("will-navigate", (event, url) => {
      event.preventDefault();
      let action = "";
      try {
        action = new URL(url).pathname.replace(/\//g, "");
      } catch {
        action = "";
      }
      handleAction(action);
    });
    popover.on("blur", () => closeSharePopover());
    popover.on("closed", () => {
      popover = null;
    });
  }

  positionPopover(popover, input.anchor, width, height);
  void popover.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  popover.show();
}

export function closeSharePopover(): void {
  if (popover && !popover.isDestroyed()) popover.close();
  popover = null;
  currentUrl = null;
}
