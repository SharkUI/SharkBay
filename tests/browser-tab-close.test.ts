import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile("App.tsx", readFileSync(new URL("../src/renderer/App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map<string, string>();
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(source));
  ts.forEachChild(node, collect);
}
collect(source);
// Execute the renderer's real handlers without mounting Electron or xterm.
const script = ts.transpileModule(["closeTab", "removeTab", "findTabWithSpace", "tabIdForTab"].map((name) => {
  const declaration = functions.get(name);
  if (!declaration) throw new Error(`Missing renderer function: ${name}`);
  return declaration;
}).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

type Space = { projectId: string; activeId: string | null; tabs: Array<{ kind: "browser"; browser: { id: string } }> };
function harness(ids: string[], activeId: string) {
  const spacesRef = { current: { project: { projectId: "project", activeId, tabs: ids.map((id) => ({ kind: "browser" as const, browser: { id } })) } } };
  const closeBrowser = vi.fn().mockResolvedValue(undefined);
  const closeTerminal = vi.fn();
  const setToast = vi.fn();
  const closeTab = runInNewContext(`${script}\ncloseTab`, {
    spacesRef, closeBrowser, closeTerminal, setToast,
    getBridge: () => ({}),
    asMessage: (error: Error) => error.message,
    setSpaces: (update: (spaces: Record<string, Space>) => Record<string, Space>) => { spacesRef.current = update(spacesRef.current) as typeof spacesRef.current; },
  }) as (id: string) => Promise<void>;
  return { closeTab, closeBrowser, closeTerminal, setToast, space: () => spacesRef.current.project };
}

describe("renderer browser tab closing", () => {
  it.each([
    { ids: ["a", "b", "c"], active: "b", closing: "b", remaining: ["a", "c"], next: "c" },
    { ids: ["a", "b"], active: "b", closing: "b", remaining: ["a"], next: "a" },
    { ids: ["a"], active: "a", closing: "a", remaining: [], next: null },
    { ids: ["a", "b"], active: "a", closing: "b", remaining: ["a"], next: "a" },
  ])("removes $closing from $ids and selects $next", async ({ ids, active, closing, remaining, next }) => {
    const app = harness(ids, active);
    await app.closeTab(closing);
    expect(app.closeBrowser).toHaveBeenCalledWith(closing);
    expect(app.closeTerminal).not.toHaveBeenCalled();
    expect(app.space().tabs.map((tab) => tab.browser.id)).toEqual(remaining);
    expect(app.space().activeId).toBe(next);
  });

  it("waits for browser close to finish before removing the tab", async () => {
    const app = harness(["a"], "a");
    let finish!: () => void;
    app.closeBrowser.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const closing = app.closeTab("a");
    expect(app.space().tabs).toHaveLength(1);
    finish();
    await closing;
    expect(app.space().tabs).toHaveLength(0);
  });

  it("reports close errors and still removes a stale tab", async () => {
    const app = harness(["a"], "a");
    app.closeBrowser.mockRejectedValueOnce(new Error("Browser already closed"));
    await app.closeTab("a");
    expect(app.setToast).toHaveBeenCalledWith({ tone: "error", message: "Browser already closed" });
    expect(app.space().tabs).toHaveLength(0);
    expect(app.space().activeId).toBeNull();
  });
});
