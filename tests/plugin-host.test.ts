import { describe, expect, it } from "vitest";
import { PluginHost, type BundledPlugin } from "../src/plugins/plugin-host.js";
import { bundledPlugins } from "../src/plugins/bundled-plugins.js";

function makePlugin(id: string): BundledPlugin {
  return {
    manifest: { id, name: id, version: "0.0.1", publisher: "test", engines: { sharkbay: "^0.2.0" } },
    register(api) {
      api.registerMachineDetector({ id: `${id}.machine`, pluginId: id, label: id, run: async () => ({}) });
      api.registerProjectDetector({ id: `${id}.project`, pluginId: id, label: id, run: async () => ({}) });
    },
  };
}

describe("PluginHost", () => {
  it("filters detectors by plugin enabled state", () => {
    const host = new PluginHost();
    host.registerPlugin(makePlugin("a"));
    host.registerPlugin(makePlugin("b"));
    expect(host.listMachineDetectors().map((d) => d.pluginId)).toEqual(["a", "b"]);

    host.setEnabled("a", false);
    expect(host.listMachineDetectors().map((d) => d.pluginId)).toEqual(["b"]);
    expect(host.listProjectDetectors().map((d) => d.pluginId)).toEqual(["b"]);
  });

  it("reflects enabled state in plugin summaries", () => {
    const host = new PluginHost();
    host.registerPlugin(makePlugin("a"));
    host.setEnabled("a", false);
    const summary = host.listPlugins()[0];
    expect(summary?.enabled).toBe(false);
    expect(summary?.contributes.machineDetectors).toBe(1);
    expect(summary?.source).toBe("bundled");
    expect(summary?.trustState).toBe("bundled");
  });

  it("loads all bundled plugins with non-empty manifests", () => {
    const host = new PluginHost();
    for (const plugin of bundledPlugins()) host.registerPlugin(plugin);
    const ids = host.listPlugins().map((p) => p.id).sort();
    expect(ids).toEqual([
      "xyz.sharkbay.agents",
      "xyz.sharkbay.codegraph",
      "xyz.sharkbay.core",
      "xyz.sharkbay.language.go",
      "xyz.sharkbay.language.java",
      "xyz.sharkbay.language.node",
      "xyz.sharkbay.language.python",
      "xyz.sharkbay.language.rust",
    ]);
    expect(host.listMachineDetectors().length).toBeGreaterThan(0);
    expect(host.listProjectDetectors().length).toBeGreaterThan(0);
    expect(host.listInstallRecipes().length).toBeGreaterThan(0);
  });
});
