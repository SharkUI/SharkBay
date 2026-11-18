import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SharkBayCoreService } from "../src/core/core-service.js";
import type { ExecutionProvider } from "../src/core/execution-provider.js";
import { PluginHost } from "../src/plugins/plugin-host.js";
import type { MachineProfile } from "../src/shared/types.js";

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-plugin-cache-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
function setup(run: () => Promise<{ tools: MachineProfile["tools"] }> = async () => ({ tools: [{ id: "fixture", command: "fixture", available: true, path: "/fixture/tool", version: "1" }] })) {
  const host = new PluginHost();
  host.registerPlugin({ manifest: { id: "fixture", name: "Fixture", version: "1", publisher: "test", engines: { sharkbay: "*" } }, register: (api) => { api.registerMachineDetector({ id: "fixture", pluginId: "fixture", label: "Fixture", run }); api.registerProjectDetector({ id: "project", pluginId: "fixture", label: "Project", run: async () => ({ name: (await run()).tools[0]?.id }) }); } });
  const provider = {
    kind: "local", readMachineProfile: async () => ({ targetId: "local", tools: [], languages: [], packageManagers: [], agents: [], warnings: [], os: {}, shell: {} }),
    readProjectProfile: async () => ({ projectUri: "local:/fixture", name: "base", languages: [], frameworks: [], packageManagers: [], commands: {}, services: [], env: { files: [], exampleFiles: [] }, structure: { monorepo: false, workspaces: [], importantFiles: [] }, warnings: [] }),
    createProjectProbeContext: async () => ({}),
    createMachineProbeContext: async () => ({ run: async () => { throw new Error("No real commands allowed"); }, which: async () => null }),
  } as unknown as ExecutionProvider;
  return new SharkBayCoreService([provider], host);
}
it("invalidates a hot profile on disable/re-enable without new cache filenames", async () => {
  let runs = 0;
  const core = setup(async () => ({ tools: [{ id: `run-${++runs}`, command: "fixture", available: true, path: "/fixture/tool", version: "1" }] }));
  const runtime = { userDataPath: root };
  expect((await core.readMachineProfile(runtime, "local")).tools[0]?.id).toBe("run-1");
  core.setPluginEnabled("fixture", false);
  expect((await core.readMachineProfile(runtime, "local")).tools).toEqual([]);
  core.setPluginEnabled("fixture", true);
  expect((await core.readMachineProfile(runtime, "local")).tools[0]?.id).toBe("run-2");
  for (let i = 0; i < 10; i++) { core.setPluginEnabled("fixture", i % 2 === 0); await core.readMachineProfile(runtime, "local"); }
  expect(await fs.readdir(path.join(root, "cache", "machine-profiles"))).toHaveLength(1);
  await core.stopJobs();
});
it("does not publish or cache a detector result from before a toggle", async () => {
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const core = setup(async () => { entered(); await new Promise<void>((resolve) => { finish = resolve; }); return { tools: [{ id: "old", command: "old", available: true, path: "/fixture/tool", version: "1" }] }; });
  const runtime = { userDataPath: root };
  const pending = core.readMachineProfile(runtime, "local"); await started;
  core.setPluginEnabled("fixture", false); finish();
  expect((await pending).tools).toEqual([]);
  expect((await core.readMachineProfile(runtime, "local")).tools).toEqual([]);
  await core.stopJobs();
});
it("checks enabled-plugin signatures across a fresh core sharing persisted cache", async () => {
  const runtime = { userDataPath: root }; const first = setup();
  expect((await first.readMachineProfile(runtime, "local")).tools).toHaveLength(1); await first.stopJobs();
  const next = setup(); next.setPluginEnabled("fixture", false);
  expect((await next.readMachineProfile(runtime, "local")).tools).toEqual([]); await next.stopJobs();
});

it("invalidates project profile detector contributions on plugin toggles", async () => {
  let runs = 0;
  const core = setup(async () => ({ tools: [{ id: `project-${++runs}`, command: "fixture", available: true, path: "/fixture/tool", version: "1" }] }));
  const runtime = { userDataPath: root };
  expect((await core.readProjectProfile(runtime, "local:/fixture")).name).toBe("project-1");
  core.setPluginEnabled("fixture", false);
  expect((await core.readProjectProfile(runtime, "local:/fixture")).name).toBe("base");
  core.setPluginEnabled("fixture", true);
  expect((await core.readProjectProfile(runtime, "local:/fixture")).name).toBe("project-2");
  expect(await fs.readdir(path.join(root, "cache", "project-profiles"))).toHaveLength(1);
  await core.stopJobs();
});
