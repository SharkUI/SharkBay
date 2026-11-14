import { expect, it, vi } from "vitest";
const instances = vi.hoisted(() => new Map<string, { start(): void; stop(): void }>());
vi.mock("../src/main/teamwork-sync.js", () => ({
  hasLocalContextBranch: async () => true,
  deleteTeamContextBranch: vi.fn(),
  TeamworkSync: class {
    start = vi.fn(); stop = vi.fn(); syncOnce = vi.fn(async () => {});
    constructor(repo: string) { instances.set(repo, this); }
    getStatus() { return { enabled: true, lastSyncAt: null, pendingCount: 0, lastError: null }; }
  },
}));
vi.mock("../src/main/harness.js", () => ({
  isHarnessInstalled: async () => true, isGitWorktree: async () => false,
  getLocalHarnessIdentity: async () => ({}), getHarnessUpdateStatus: async () => ({ required: false, files: [] }),
}));
import { createTaskRuntime } from "../src/runtime/task-runtime.js";
it("keeps project sync independent across views and stops all instances with the host", async () => {
  const runtime = createTaskRuntime(() => {});
  try {
    await runtime.getStatus("/project-a"); await runtime.getStatus("/project-b");
    await runtime.syncNow("/project-a");
    expect(instances.get("/project-a")!.start).toHaveBeenCalledOnce();
    expect(instances.get("/project-a")!.stop).not.toHaveBeenCalled();
    expect(instances.get("/project-b")!.stop).not.toHaveBeenCalled();
  } finally { runtime.stop(); }
  expect(instances.get("/project-a")!.stop).toHaveBeenCalledOnce(); expect(instances.get("/project-b")!.stop).toHaveBeenCalledOnce();
});
