import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Exercise the actual renderer handlers without mounting xterm or the entire app.
const source = ts.createSourceFile("App.tsx", readFileSync(new URL("../src/renderer/App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string): string {
  let result = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!result) throw new Error(`Missing renderer handler: ${name}`);
  return result;
}
function deferred() {
  let reject!: (error: Error) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function fixture() {
  const resizing = deferred(), closing = deferred();
  const resize = vi.fn(() => resizing.promise), close = vi.fn(() => closing.promise);
  const toast = vi.fn();
  const tabs = new Map([["terminal", { tab: { kind: "terminal", session: { status: "running" } } }]]);
  const code = [handler("resizeTerminal"), handler("closeTerminal"), handler("closeTab"), handler("dismissTerminalTab")].join("\n");
  const handlers = runInNewContext(ts.transpile(code + "\n({ resizeTerminal, closeTab })", { target: ts.ScriptTarget.ES2022 }), {
    getBridge: () => ({ terminal: { resize, close }, runtime: { connection: () => "connected", canControl: () => true } }),
    validTerminalResizeDimensions: () => true,
    closingTerminalIds: { current: new Set() }, spacesRef: { current: {} },
    dismissedTerminalIds: { current: new Set() }, pendingTerminalOutput: { current: new Map() },
    findTabWithSpace: (_spaces: unknown, id: string) => tabs.get(id),
    findTerminalTab: (_spaces: unknown, id: string) => tabs.get(id)?.tab,
    removeTab: (id: string) => tabs.delete(id), setToast: toast, asMessage: String,
  }) as { resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>; closeTab: (id: string) => Promise<void> };
  return { ...handlers, resizing, closing, resize, toast, tabs };
}
describe("terminal close and resize race", () => {
  it("does not send a resize once closing starts", async () => {
    const f = fixture();
    const close = f.closeTab("terminal");
    f.resizing.resolve();
    await f.resizeTerminal("terminal", 100, 30);
    expect(f.resize).not.toHaveBeenCalled();
    f.closing.resolve(); await close;
  });
  it("ignores a queued resize rejection after closing starts", async () => {
    const f = fixture();
    const resize = f.resizeTerminal("terminal", 100, 30);
    const close = f.closeTab("terminal");
    f.resizing.reject(new Error("This terminal is controlled by another connection"));
    await expect(resize).resolves.toBeUndefined();
    f.closing.resolve(); await close;
    expect(f.toast).not.toHaveBeenCalled();
  });
  it("ignores a queued resize after another client removes the tab", async () => {
    const f = fixture();
    const resize = f.resizeTerminal("terminal", 100, 30);
    f.tabs.clear(); f.resizing.reject(new Error("Terminal session no longer exists"));
    await expect(resize).resolves.toBeUndefined();
  });
  it("reports resize failures for a terminal that remains open", async () => {
    const f = fixture();
    const resize = f.resizeTerminal("terminal", 100, 30);
    f.resizing.reject(new Error("resize failed"));
    await expect(resize).rejects.toThrow("resize failed");
  });
  it("still reports a failure of the close request itself", async () => {
    const f = fixture();
    const close = f.closeTab("terminal");
    f.closing.reject(new Error("close failed"));
    await close;
    expect(f.toast).toHaveBeenCalledWith({ tone: "error", message: "Error: close failed" });
  });
});
