import type { BundledPlugin, MachineDetector } from "../plugin-host.js";
import { probeTools } from "./tool-probe.js";

export const CODEGRAPH_PLUGIN_ID = "xyz.sharkbay.codegraph";

export function codeGraphBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: CODEGRAPH_PLUGIN_ID,
      name: "CodeGraph",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [{ kind: "profile:machine" }, { kind: "command:run", scope: "local" }],
      contributes: {
        machineDetectors: [{ id: "codegraph.machine", label: "CodeGraph CLI Detector" }],
      },
    },
    register(api) {
      api.registerMachineDetector(createCodeGraphMachineDetector());
    },
  };
}

export function createCodeGraphMachineDetector(): MachineDetector {
  return {
    id: "codegraph.machine",
    pluginId: CODEGRAPH_PLUGIN_ID,
    label: "CodeGraph CLI Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      return { tools: await probeTools(ctx, [{ id: "codegraph", command: "codegraph" }], CODEGRAPH_PLUGIN_ID) };
    },
  };
}
