import { BrowserView, BrowserWindow, shell } from "electron";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type {
  BrowserActionInput,
  BrowserBounds,
  BrowserCloseInput,
  BrowserCreateInput,
  BrowserNavigateInput,
  BrowserResizeInput,
  BrowserSession,
  BrowserUpdateEvent,
} from "../shared/types.js";

type BrowserRecord = {
  id: string;
  view: BrowserView;
  window: BrowserWindow;
  title: string;
  url: string;
  faviconUrl: string | null;
  loading: boolean;
  attached: boolean;
};

type BrowserManagerEvents = {
  update: [BrowserUpdateEvent];
};

const blankUrl = "about:blank";

export class BrowserManager extends EventEmitter<BrowserManagerEvents> {
  private readonly records = new Map<string, BrowserRecord>();

  create(window: BrowserWindow, input: BrowserCreateInput): BrowserSession {
    const id = randomUUID();
    const view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: "persist:sharkbay-browser",
      },
    });
    const record: BrowserRecord = {
      id,
      view,
      window,
      title: "Browser",
      url: normalizeBrowserUrl(input.initialUrl),
      faviconUrl: null,
      loading: false,
      attached: false,
    };

    this.records.set(id, record);
    view.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
    view.webContents.on("page-title-updated", (_event, title) => {
      record.title = title.trim() || titleForUrl(record.url);
      this.emitUpdate(record);
    });
    view.webContents.on("page-favicon-updated", (_event, favicons) => {
      record.faviconUrl = firstUsableFaviconUrl(favicons);
      this.emitUpdate(record);
    });
    view.webContents.on("did-start-loading", () => {
      record.loading = true;
      record.faviconUrl = null;
      this.emitUpdate(record);
    });
    view.webContents.on("did-stop-loading", () => {
      record.loading = false;
      record.url = view.webContents.getURL() || record.url;
      record.title = view.webContents.getTitle().trim() || titleForUrl(record.url);
      this.emitUpdate(record);
    });
    view.webContents.on("did-navigate", (_event, url) => {
      record.url = normalizeBrowserUrl(url);
      record.title = view.webContents.getTitle().trim() || titleForUrl(record.url);
      this.emitUpdate(record);
    });
    view.webContents.on("did-navigate-in-page", (_event, url) => {
      record.url = normalizeBrowserUrl(url);
      record.title = view.webContents.getTitle().trim() || titleForUrl(record.url);
      this.emitUpdate(record);
    });

    void view.webContents.loadURL(record.url);
    return publicBrowserSession(record);
  }

  navigate(input: BrowserNavigateInput): BrowserSession {
    const record = this.requireRecord(input.browserId);
    const url = normalizeBrowserUrl(input.url);
    record.url = url;
    record.title = titleForUrl(url);
    record.faviconUrl = null;
    void record.view.webContents.loadURL(url);
    this.emitUpdate(record);
    return publicBrowserSession(record);
  }

  resize(input: BrowserResizeInput): BrowserSession {
    const record = this.records.get(input.browserId);
    if (!record) {
      return missingBrowserSession(input.browserId);
    }
    if (input.active) {
      this.hideOtherViews(record);
      this.attach(record);
      setBrowserBounds(record.view, input.bounds);
      if (!record.window.isDestroyed()) {
        record.window.setTopBrowserView(record.view);
      }
    } else {
      this.detach(record);
    }
    return publicBrowserSession(record);
  }

  close(input: BrowserCloseInput): BrowserSession {
    const record = this.records.get(input.browserId);
    if (!record) {
      return missingBrowserSession(input.browserId);
    }
    const session = publicBrowserSession(record);
    this.records.delete(record.id);
    if (record.attached && !record.window.isDestroyed()) {
      record.window.removeBrowserView(record.view);
    }
    if (!record.view.webContents.isDestroyed()) {
      record.view.webContents.close();
    }
    return session;
  }

  goBack(input: BrowserActionInput): BrowserSession {
    const record = this.requireRecord(input.browserId);
    if (record.view.webContents.canGoBack()) {
      record.view.webContents.goBack();
    }
    return publicBrowserSession(record);
  }

  goForward(input: BrowserActionInput): BrowserSession {
    const record = this.requireRecord(input.browserId);
    if (record.view.webContents.canGoForward()) {
      record.view.webContents.goForward();
    }
    return publicBrowserSession(record);
  }

  reload(input: BrowserActionInput): BrowserSession {
    const record = this.requireRecord(input.browserId);
    record.view.webContents.reload();
    return publicBrowserSession(record);
  }

  closeAll(): void {
    for (const id of [...this.records.keys()]) {
      this.close({ browserId: id });
    }
  }

  private requireRecord(browserId: string): BrowserRecord {
    const record = this.records.get(browserId);
    if (!record) {
      throw new Error("Browser session not found");
    }
    return record;
  }

  private emitUpdate(record: BrowserRecord): void {
    this.emit("update", { browser: publicBrowserSession(record) });
  }

  private hideOtherViews(activeRecord: BrowserRecord): void {
    for (const record of this.records.values()) {
      if (record.id === activeRecord.id || record.window !== activeRecord.window) continue;
      this.detach(record);
    }
  }

  private attach(record: BrowserRecord): void {
    if (record.attached || record.window.isDestroyed()) return;
    record.window.addBrowserView(record.view);
    record.attached = true;
  }

  private detach(record: BrowserRecord): void {
    if (!record.attached || record.window.isDestroyed()) return;
    record.window.removeBrowserView(record.view);
    record.attached = false;
  }
}

export function normalizeBrowserUrl(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === blankUrl) return blankUrl;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : blankUrl;
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return blankUrl;
    }
  }
}

function setBrowserBounds(view: BrowserView, bounds: BrowserBounds): void {
  view.setBounds({
    x: integer(bounds.x),
    y: integer(bounds.y),
    width: positiveDimension(bounds.width),
    height: positiveDimension(bounds.height),
  });
}

function integer(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function positiveDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
}

function publicBrowserSession(record: BrowserRecord): BrowserSession {
  const currentUrl = record.view.webContents.isDestroyed() ? record.url : record.view.webContents.getURL() || record.url;
  return {
    id: record.id,
    title: record.title || titleForUrl(currentUrl),
    url: currentUrl,
    faviconUrl: record.faviconUrl,
    canGoBack: !record.view.webContents.isDestroyed() && record.view.webContents.canGoBack(),
    canGoForward: !record.view.webContents.isDestroyed() && record.view.webContents.canGoForward(),
    loading: record.loading,
  };
}

function titleForUrl(url: string): string {
  if (!url || url === blankUrl) return "Browser";
  try {
    return new URL(url).hostname;
  } catch {
    return "Browser";
  }
}

function firstUsableFaviconUrl(favicons: string[]): string | null {
  return favicons.find((favicon) => {
    try {
      const parsed = new URL(favicon);
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "data:";
    } catch {
      return false;
    }
  }) ?? null;
}

function missingBrowserSession(id: string): BrowserSession {
  return {
    id,
    title: "Browser",
    url: blankUrl,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loading: false,
  };
}
