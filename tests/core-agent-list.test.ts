import { describe, expect, it } from "vitest";
import { SharkBayCoreService } from "../src/core/core-service.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { PluginHost } from "../src/plugins/plugin-host.js";
import { makeTestRuntime } from "./helpers.js";

describe("CoreService agent listing", () => {
  it("builds UI agent buttons from MachineProfile agents", async () => {
    const runtime = await makeTestRuntime("core-agent-list");
    const host = new PluginHost();
    host.registerPlugin({
      manifest: {
        id: "test.plugin",
        name: "Test Plugin",
        version: "0.0.0",
        publisher: "test",
        engines: { sharkbay: "^0.2.0" },
      },
      register(api) {
        api.registerMachineDetector({
          id: "test.agents",
          pluginId: "test.plugin",
          label: "Test Agents",
          run: async () => ({
            agents: [
              { id: "codex", command: "codex", available: true, path: "/usr/local/bin/codex", version: "codex 1", sourcePluginId: "test.plugin" },
              { id: "claude", command: "claude", available: false, path: null, version: null, sourcePluginId: "test.plugin" },
            ],
          }),
        });
      },
    });
    const core = new SharkBayCoreService([new LocalProvider()], host);

    await expect(core.listAgentClis(runtime, { cwdUri: "local:/tmp/project" })).resolves.toEqual([
      {
        id: "codex",
        label: "Codex CLI",
        command: "codex",
        executablePath: "/usr/local/bin/codex",
        shortLabel: "Cx",
      },
    ]);
  });

  it("refreshes local agent detection instead of reusing stale missing CLI cache", async () => {
    const runtime = await makeTestRuntime("core-agent-list-refresh");
    let claudeAvailable = false;
    const host = new PluginHost();
    host.registerPlugin({
      manifest: {
        id: "test.plugin",
        name: "Test Plugin",
        version: "0.0.0",
        publisher: "test",
        engines: { sharkbay: "^0.2.0" },
      },
      register(api) {
        api.registerMachineDetector({
          id: "test.agents",
          pluginId: "test.plugin",
          label: "Test Agents",
          run: async () => ({
            agents: [
              { id: "codex", command: "codex", available: true, path: "/usr/local/bin/codex", version: "codex 1", sourcePluginId: "test.plugin" },
              { id: "claude", command: "claude", available: claudeAvailable, path: claudeAvailable ? "/Users/test/.local/bin/claude" : null, version: claudeAvailable ? "claude 1" : null, sourcePluginId: "test.plugin" },
            ],
          }),
        });
      },
    });
    const core = new SharkBayCoreService([new LocalProvider()], host);
    await core.readMachineProfile(runtime, "local");
    claudeAvailable = true;

    await expect(core.listAgentClis(runtime, { cwdUri: "local:/tmp/project", refresh: true })).resolves.toEqual([
      expect.objectContaining({ id: "codex", executablePath: "/usr/local/bin/codex" }),
      expect.objectContaining({ id: "claude", executablePath: "/Users/test/.local/bin/claude" }),
    ]);
  });
});
