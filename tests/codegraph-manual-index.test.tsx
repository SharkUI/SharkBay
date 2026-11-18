import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeGraphPanel } from "../src/renderer/codegraph-panel";
import type { CodeGraphProjectStatus } from "../src/renderer/types";

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { for (const tree of mounted.splice(0)) tree.unmount(); }); });
const status = (projectUri: string, state: CodeGraphProjectStatus["state"] = "uninitialized"): CodeGraphProjectStatus => ({ projectUri, state, summary: state, updatedAt: "fixture" });
function fixture() {
  const api = { getStatus: vi.fn(async ({ projectUri }: { projectUri: string }) => status(projectUri)), ensureStatus: vi.fn(async ({ projectUri }: { projectUri: string }) => status(projectUri, "indexed")) };
  const terminal = vi.fn().mockResolvedValue(undefined);
  let tree: ReactTestRenderer;
  const render = async (projectUri = "A") => {
    await act(async () => {
      const panel = <CodeGraphPanel projectUri={projectUri} api={api} onOpenTerminal={terminal} />;
      if (tree) tree.update(panel); else { tree = create(panel); mounted.push(tree); }
    });
    return tree!;
  };
  return { api, terminal, render };
}

describe("real React CodeGraph maintenance", () => {
  it("only reads status on mount, rerender and project switching; indexing requires a button action", async () => {
    const { api, render } = fixture();
    let tree = await render("A"); await render("A"); await render("B"); tree = await render("A");
    expect(api.getStatus.mock.calls.map(([input]) => input.projectUri)).toEqual(["A", "B", "A"]);
    expect(api.ensureStatus).not.toHaveBeenCalled();
    const button = tree.root.findByType("button"); expect(button.children).toEqual(["Build index"]);
    await act(async () => { await button.props.onClick(); });
    expect(api.ensureStatus).toHaveBeenCalledTimes(1); expect(api.ensureStatus).toHaveBeenCalledWith({ projectUri: "A" });
    expect(tree.root.findByType("button").children).toEqual(["Sync index"]);
  });
  it("disables repeat maintenance and does not project an old project's result after switching", async () => {
    const { api, render } = fixture(); let finish!: (value: CodeGraphProjectStatus) => void;
    api.ensureStatus.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let tree = await render("A"); const maintain = tree.root.findByType("button").props.onClick;
    let request: Promise<void>;
    act(() => { request = maintain(); void maintain(); });
    expect(api.ensureStatus).toHaveBeenCalledTimes(1); expect(tree.root.findByType("button").props.disabled).toBe(true);
    tree = await render("B"); await act(async () => { finish(status("A", "indexed")); await request; });
    expect(tree.root.findByType("button").children).toEqual(["Build index"]);
    expect(tree.root.findByProps({ className: "codegraph-status-line" }).children).toEqual(["uninitialized"]);
  });
  it("shows maintenance failure and permits a later explicit retry", async () => {
    const { api, render } = fixture(); const tree = await render();
    api.ensureStatus.mockRejectedValueOnce(new Error("fixture failure"));
    await act(async () => { await tree.root.findByType("button").props.onClick(); });
    expect(tree.root.findByProps({ className: "codegraph-status-line" }).children.join("")).toContain("fixture failure");
    await act(async () => { await tree.root.findByType("button").props.onClick(); });
    expect(tree.root.findByType("button").children).toEqual(["Sync index"]);
  });
  it.each(["disabled", "unsupported"] as const)("offers no indexing action for %s", async state => {
    const { api, render } = fixture(); api.getStatus.mockImplementation(async ({ projectUri }) => status(projectUri, state));
    const tree = await render(); expect(tree.root.findAllByType("button")).toHaveLength(0); expect(api.ensureStatus).not.toHaveBeenCalled();
  });
});
