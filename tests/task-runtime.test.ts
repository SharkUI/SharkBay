import { expect, it, vi } from "vitest";

const instances = vi.hoisted(() => new Map<string, { syncOnce(): Promise<unknown> }>());
vi.mock("../src/main/git.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/main/git.js")>(),
  readOriginUrls: async (repo: string) => {
    const url = `https://github.com/fixture/${repo.slice(1)}`;
    return { fetch: url, push: [url] };
  },
}));
vi.mock("../src/main/teamwork-sync.js", () => ({
  deleteTeamContextBranch: vi.fn(),
  TeamworkSync: class {
    ensureContextBranch = vi.fn(async () => "abcdef");
    syncOnce = vi.fn(async () => ({ error: null }));
    constructor(repo: string) { instances.set(repo, this); }
    getStatus() { return { lastSyncAt: "2026-07-01T00:00:00Z", pendingCount: 0 }; }
  },
}));
vi.mock("../src/main/harness.js", () => ({
  isHarnessInstalled: async () => true, isGitWorktree: async () => false,
  getLocalHarnessIdentity: async () => ({}), getHarnessUpdateStatus: async () => ({ required: false, files: [] }),
  resolveGitHubIdentity: async () => ({ login: "fixture", id: 1 }), checkRepoPermission: async () => "write",
  updateHarnessProject: async () => {},
}));

import { createTaskRuntime } from "../src/runtime/task-runtime.js";

it("starts projects as they open and stops background sync with the host", async () => {
  vi.useFakeTimers();
  const runtime = createTaskRuntime(() => {});
  try {
    await runtime.trackProject("/project-a");
    await runtime.trackProject("/project-b");
    await vi.advanceTimersByTimeAsync(0);
    expect(instances.get("/project-a")!.syncOnce).toHaveBeenCalledOnce();
    expect(instances.get("/project-b")!.syncOnce).toHaveBeenCalledOnce();

    await runtime.syncNow("/project-a");
    expect(instances.get("/project-a")!.syncOnce).toHaveBeenCalledTimes(2);
    expect(instances.get("/project-b")!.syncOnce).toHaveBeenCalledOnce();

    await runtime.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(instances.get("/project-a")!.syncOnce).toHaveBeenCalledTimes(2);
    expect(instances.get("/project-b")!.syncOnce).toHaveBeenCalledOnce();
  } finally {
    await runtime.stop();
    vi.useRealTimers();
  }
});
