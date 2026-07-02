import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  const views: any[] = [];
  const openExternal = vi.fn();
  const BrowserView = vi.fn(function BrowserView() {
    let currentUrl = "";
    const view = {
      webContents: {
        windowOpenHandler: undefined as ((details: { url: string }) => { action: "deny" }) | undefined,
        setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }) {
          view.webContents.windowOpenHandler = handler;
        },
        on: vi.fn(),
        loadURL: vi.fn((url: string) => {
          currentUrl = url;
          return Promise.resolve();
        }),
        getURL: () => currentUrl,
        getTitle: () => "",
        canGoBack: () => false,
        canGoForward: () => false,
        isDestroyed: () => false,
        focus: vi.fn(),
      },
      setBounds: vi.fn(),
    };
    views.push(view);
    return view;
  });
  return { BrowserView, openExternal, views };
});

vi.mock("electron", () => ({
  BrowserView: electronMock.BrowserView,
  BrowserWindow: vi.fn(),
  shell: { openExternal: electronMock.openExternal },
}));

import { BrowserManager, isPrivateBrowserHttpsUrl, normalizeBrowserUrl, scaleBrowserBounds } from "../src/main/browser-tabs.js";

beforeEach(() => {
  electronMock.BrowserView.mockClear();
  electronMock.openExternal.mockClear();
  electronMock.views.length = 0;
});

describe("browser tab URL normalization", () => {
  it("keeps web and file URLs and falls back to blank for unsafe schemes", () => {
    expect(normalizeBrowserUrl("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173/");
    expect(normalizeBrowserUrl("example.com")).toBe("https://example.com/");
    expect(normalizeBrowserUrl("file:///Users/test/.sharkbay/site/index.html")).toBe("file:///Users/test/.sharkbay/site/index.html");
    expect(normalizeBrowserUrl("javascript:alert(1)")).toBe("about:blank");
    expect(normalizeBrowserUrl("")).toBe("about:blank");
  });
});

describe("browser tab bounds scaling", () => {
  it("scales renderer CSS bounds to BrowserView bounds", () => {
    expect(scaleBrowserBounds({ x: 200, y: 100, width: 800, height: 600 }, 1.25)).toEqual({
      x: 250,
      y: 125,
      width: 1000,
      height: 750,
    });
  });

  it("falls back to unscaled bounds for invalid zoom factors", () => {
    expect(scaleBrowserBounds({ x: 20, y: 10, width: 0, height: Number.NaN }, 0)).toEqual({
      x: 20,
      y: 10,
      width: 1,
      height: 1,
    });
  });
});

describe("browser tab new windows", () => {
  it("opens requested new windows as internal browser sessions", () => {
    const manager = new BrowserManager();
    const updates: Array<{ browser: { url: string }; reason?: string }> = [];
    const window = {
      isDestroyed: () => false,
      isFocused: () => true,
      focus: vi.fn(),
      addBrowserView: vi.fn(),
      removeBrowserView: vi.fn(),
      setTopBrowserView: vi.fn(),
      webContents: {
        isDestroyed: () => false,
        getZoomFactor: () => 1,
      },
    };

    manager.on("update", (event) => updates.push(event));
    manager.create(window as never, { initialUrl: "https://example.test", bounds: { x: 0, y: 0, width: 1, height: 1 } });

    const handler = electronMock.views[0]?.webContents.windowOpenHandler;
    expect(handler?.({ url: "https://docs.example.test/page" })).toEqual({ action: "deny" });

    expect(electronMock.openExternal).not.toHaveBeenCalled();
    expect(electronMock.BrowserView).toHaveBeenCalledTimes(2);
    expect(updates).toContainEqual({
      browser: expect.objectContaining({ url: "https://docs.example.test/page" }),
      reason: "created",
    });
  });
});

describe("browser tab certificate error policy", () => {
  it("allows certificate errors only for private or local HTTPS hosts", () => {
    expect(isPrivateBrowserHttpsUrl("https://10.0.0.13:5001/")).toBe(true);
    expect(isPrivateBrowserHttpsUrl("https://192.168.1.10/")).toBe(true);
    expect(isPrivateBrowserHttpsUrl("https://172.16.0.2/")).toBe(true);
    expect(isPrivateBrowserHttpsUrl("https://172.31.255.255/")).toBe(true);
    expect(isPrivateBrowserHttpsUrl("https://localhost:5173/")).toBe(true);
    expect(isPrivateBrowserHttpsUrl("https://nas.local/")).toBe(true);
    expect(isPrivateBrowserHttpsUrl("https://[::1]:5001/")).toBe(true);
    expect(isPrivateBrowserHttpsUrl("https://[fd12::1]/")).toBe(true);

    expect(isPrivateBrowserHttpsUrl("http://10.0.0.13:5001/")).toBe(false);
    expect(isPrivateBrowserHttpsUrl("https://172.32.0.1/")).toBe(false);
    expect(isPrivateBrowserHttpsUrl("https://8.8.8.8/")).toBe(false);
    expect(isPrivateBrowserHttpsUrl("https://example.com/")).toBe(false);
  });

  it("allows certificate errors only from managed browser views", () => {
    const manager = new BrowserManager();
    const window = {
      isDestroyed: () => false,
      isFocused: () => true,
      focus: vi.fn(),
      addBrowserView: vi.fn(),
      removeBrowserView: vi.fn(),
      setTopBrowserView: vi.fn(),
      webContents: {
        isDestroyed: () => false,
        getZoomFactor: () => 1,
      },
    };

    manager.create(window as never, { initialUrl: "https://10.0.0.13:5001/", bounds: { x: 0, y: 0, width: 1, height: 1 } });

    expect(manager.shouldAllowCertificateError(electronMock.views[0].webContents, "https://10.0.0.13:5001/")).toBe(true);
    expect(manager.shouldAllowCertificateError(electronMock.views[0].webContents, "https://example.com/")).toBe(false);
    expect(manager.shouldAllowCertificateError({} as never, "https://10.0.0.13:5001/")).toBe(false);
  });
});
