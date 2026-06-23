import { BrowserWindow, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type { FindPopoverAnchor, FindPopoverResult } from "../src/shared/types.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const WIDTH = 300;
const HEIGHT = 40;

let popover: BrowserWindow | null = null;

function palette(theme: string | undefined) {
  // night and morning share the dark terminal chrome; everything else is light (day).
  if (theme === "night" || theme === "morning") {
    return { bg: "#0d1213", border: "#2c3c3f", text: "#d9e5df", inputBg: "#1a2325", muted: "#8fa09c", hover: "#1a2325", focus: "#93d7a4" };
  }
  return { bg: "#fffdfa", border: "#d7d2c8", text: "#263034", inputBg: "#f7f1e4", muted: "#6b7378", hover: "#eef5f3", focus: "#8aa6a0" };
}

function renderHtml(theme: string | undefined): string {
  const c = palette(theme);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;} html,body{margin:0;background:transparent;overflow:hidden;}
    body{font:12px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;}
    .bar{display:flex;align-items:center;gap:4px;height:${HEIGHT}px;padding:5px 8px;background:${c.bg};border:1px solid ${c.border};border-radius:8px;}
    input{flex:1;min-width:0;height:26px;padding:0 8px;color:${c.text};background:${c.inputBg};border:1px solid ${c.border};border-radius:6px;font-size:12px;outline:none;}
    input:focus{border-color:${c.focus};}
    .count{min-width:38px;text-align:right;font-size:11px;color:${c.muted};font-variant-numeric:tabular-nums;}
    button{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;color:${c.text};background:transparent;border:0;border-radius:6px;cursor:pointer;padding:0;}
    button:hover{background:${c.hover};}
    svg{pointer-events:none;}
  </style></head><body>
  <div class="bar">
    <input id="q" type="text" placeholder="Find" spellcheck="false" autocomplete="off"/>
    <span class="count" id="count"></span>
    <button id="prev" title="Previous (Shift+Enter)"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button id="next" title="Next (Enter)"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button id="close" title="Close (Esc)"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
  </div>
  <script>
    var api = window.findPopover;
    var input = document.getElementById('q');
    var countEl = document.getElementById('count');
    var lastSent = null, composing = false, timer = null;
    function clearTimer(){ if(timer){ clearTimeout(timer); timer = null; } }
    function commit(){ clearTimer(); var v = input.value; if(v !== lastSent){ lastSent = v; api.query(v); return true; } return false; }
    function schedule(){ clearTimer(); timer = setTimeout(function(){ timer = null; commit(); }, 1000); }
    input.addEventListener('input', function(){ if(composing) return; schedule(); });
    input.addEventListener('compositionstart', function(){ composing = true; });
    input.addEventListener('compositionend', function(){ composing = false; schedule(); });
    input.addEventListener('keydown', function(e){
      if(e.isComposing || e.keyCode === 229) return;
      if(e.key === 'Escape'){ e.preventDefault(); api.dismiss(); return; }
      if(e.key === 'Enter'){ e.preventDefault(); if(!commit()) api.step(!e.shiftKey); }
    });
    document.getElementById('prev').addEventListener('click', function(){ if(!commit()) api.step(false); });
    document.getElementById('next').addEventListener('click', function(){ if(!commit()) api.step(true); });
    document.getElementById('close').addEventListener('click', function(){ api.dismiss(); });
    api.onResult(function(r){ countEl.textContent = r.total ? (r.current + '/' + r.total) : (input.value ? '0/0' : ''); });
    api.onInit(function(){ input.focus(); input.select(); });
    setTimeout(function(){ input.focus(); }, 0);
  </script>
  </body></html>`;
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
  positionPopover(win, input.anchor);
  void win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(renderHtml(input.theme)));
  win.webContents.once("did-finish-load", () => {
    if (win.isDestroyed()) return;
    win.webContents.send(channels.findPopoverInit, { theme: input.theme ?? "day" });
    win.show();
    win.focus();
  });
}

export function sendFindResult(result: FindPopoverResult): void {
  if (popover && !popover.isDestroyed()) {
    popover.webContents.send(channels.findPopoverResult, result);
  }
}

export function isFindPopoverOpen(): boolean {
  return Boolean(popover) && !popover!.isDestroyed();
}

export function closeFindPopover(): void {
  if (popover && !popover.isDestroyed()) popover.close();
  popover = null;
}
