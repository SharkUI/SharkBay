import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectCandidate, TaskViewModel, TasksChangedEvent } from "../src/shared/types.js";

const source = ts.createSourceFile("App.tsx", readFileSync(new URL("../src/renderer/App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["ProjectDetailPane", "TasksDetailTab", "localPathFromCandidate", "localPathFromProjectUri", "taskPill"];
const declarations = source.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && Boolean(node.name && names.includes(node.name.text)));
// Mount the real detail pane and Tasks component without loading xterm or Electron.
const script = ts.transpileModule(declarations.map((node) => node.getText(source)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); tree = undefined!; });
const task = (title: string): TaskViewModel => ({
  taskId: "A1B2C3-u1-mtest", taskTag: "A1B2C3", title, mode: "task", status: "active", sync: "local",
  owner: { githubLogin: "fixture" }, sourceKind: "local-md", sourcePath: "task.md", readOnly: false,
  frontmatter: {}, bodyMarkdown: "", rawMarkdown: "",
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const listeners = new Set<(event: TasksChangedEvent) => void>();
  const api = {
    getTasks: vi.fn(async ({ repoPath }: { repoPath: string }) => [task(repoPath)]),
    getStatus: vi.fn(async () => ({ installed: false })),
    onTasksChanged: (callback: (event: TasksChangedEvent) => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
  };
  const empty = () => null;
  const Pane = runInNewContext(`${script}\nProjectDetailPane`, {
    React, ...React, getBridge: () => ({ protocol: api }),
    detailTabs: [{ id: "git", label: "Git" }, { id: "tasks", label: "Tasks" }],
    startVisibleRefreshInterval: () => () => {}, taskDetailRefreshIntervalMs: 15000,
    cx: (...values: unknown[]) => values.filter(Boolean).join(" "), asMessage: (error: Error) => error.message,
    taskRestoreCommand: () => null, taskDetailCommits: () => [], inferAgentSessionRestoreAgent: () => null,
    formatTaskDetailTime: () => undefined,
    GitDetailTab: empty, SessionsDetailTab: empty, FilesDetailTab: empty,
    TaskDetailSummarySection: empty, TaskDetailFact: empty, TaskDetailFilesSection: empty,
    TaskDetailWorkSection: empty, TaskDetailListSection: empty, TaskDetailArtifactsSection: empty, TaskDetailReviewsSection: empty,
  }) as React.ComponentType<any>;
  const setToast = vi.fn();
  const render = async (name: string) => {
    const candidate = { id: name, uri: `local:/${name}`, providerKind: "local" } as ProjectCandidate;
    await act(async () => {
      const pane = React.createElement(Pane, { candidate, detail: null, agentClis: [], setToast });
      if (tree) tree.update(pane); else tree = create(pane);
    });
  };
  const selectTasks = async () => { await act(async () => tree.root.findByProps({ id: "project-detail-tab-tasks" }).props.onClick()); };
  const titles = () => tree.root.findAllByProps({ className: "task-title" }).map((entry) => entry.children.join(""));
  return { api, render, selectTasks, titles, setToast, listeners };
}

describe("project Tasks identity", () => {
  it("clears the previous task detail and protocol status while the new project loads", async () => {
    const f = fixture(); await f.render("A"); await f.selectTasks();
    expect(f.titles()).toEqual(["/A"]);
    act(() => tree.root.findByProps({ className: "queue-item" }).props.onClick());
    expect(tree.root.findByType("h3").children).toEqual(["/A"]);
    const next = deferred<TaskViewModel[]>();
    f.api.getTasks.mockReturnValueOnce(next.promise);
    f.api.getStatus.mockReturnValueOnce(new Promise(() => {}));
    await f.render("B");
    expect(tree.root.findAllByType("h3")).toHaveLength(0);
    expect(f.titles()).toEqual([]);
    expect(tree.root.findAllByType("h4")).toHaveLength(0);
    expect(tree.root.findByProps({ id: "project-detail-tab-tasks" }).props["aria-selected"]).toBe(true);
    await act(async () => { next.resolve([task("/B")]); });
    expect(f.titles()).toEqual(["/B"]);
    expect(f.api.getTasks.mock.calls.map(([input]) => input.repoPath)).toEqual(["/A", "/B"]);
  });

  it("does not retain old tasks when switching with Tasks hidden and the next request fails", async () => {
    const f = fixture(); await f.render("A"); await f.selectTasks();
    await act(async () => tree.root.findByProps({ id: "project-detail-tab-git" }).props.onClick());
    await f.render("B");
    f.api.getTasks.mockRejectedValueOnce(new Error("B unavailable"));
    await f.selectTasks();
    expect(f.titles()).toEqual([]);
    expect(f.setToast).toHaveBeenCalledWith({ tone: "error", message: "B unavailable" });
  });

  it("ignores requests and task events from a project left during rapid A/B/A switching", async () => {
    const f = fixture(), oldA = deferred<TaskViewModel[]>(), oldB = deferred<TaskViewModel[]>();
    f.api.getTasks.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(oldB.promise);
    await f.render("A"); await f.selectTasks(); await f.render("B"); await f.render("A");
    expect(f.titles()).toEqual(["/A"]);
    await act(async () => { oldA.resolve([task("stale A")]); oldB.resolve([task("stale B")]); });
    expect(f.titles()).toEqual(["/A"]);
    expect(f.listeners.size).toBe(1);
    act(() => { for (const callback of f.listeners) callback({ repoPath: "/B", tasks: [task("B event")] }); });
    expect(f.titles()).toEqual(["/A"]);
    act(() => { for (const callback of f.listeners) callback({ repoPath: "/A", tasks: [task("A updated")] }); });
    expect(f.titles()).toEqual(["A updated"]);
  });
});
