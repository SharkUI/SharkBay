import type { BundledPlugin, MachineDetector, ProjectDetector, ProjectProfilePatch } from "../plugin-host.js";
import { probeTools } from "./tool-probe.js";

const pluginId = "com.sharkbay.language.go";

export function goBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: pluginId,
      name: "Go Support",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [{ kind: "profile:machine" }, { kind: "profile:project" }, { kind: "file:read", patterns: ["go.mod", "go.sum"] }],
      contributes: {
        machineDetectors: [{ id: "go.machine", label: "Go Runtime Detector" }],
        projectDetectors: [{ id: "go.project", label: "Go Project Detector" }],
      },
    },
    register(api) {
      api.registerMachineDetector(createGoMachineDetector());
      api.registerProjectDetector(createGoProjectDetector());
    },
  };
}

export function createGoMachineDetector(): MachineDetector {
  return {
    id: "go.machine",
    pluginId,
    label: "Go Runtime Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const languages = await probeTools(ctx, [{ id: "go", command: "go" }], pluginId);
      return { languages: languages.filter((tool) => tool.available) };
    },
  };
}

export function createGoProjectDetector(): ProjectDetector {
  return {
    id: "go.project",
    pluginId,
    label: "Go Project Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const files = await ctx.listFiles().catch(() => []);
      const fileSet = new Set(files.filter((file) => file.kind === "file").map((file) => file.path));
      if (!fileSet.has("go.mod")) return {};

      const importantFiles = ["go.mod", "go.sum", "main.go"].filter((file) => fileSet.has(file));
      const patch: ProjectProfilePatch = {
        languages: [{ id: "go", confidence: 0.95, evidence: ["go.mod"], sourcePluginId: pluginId }],
        packageManagers: [{ id: "go", confidence: 0.95, manifest: "go.mod", lockfile: fileSet.has("go.sum") ? "go.sum" : undefined, evidence: ["go.mod"], sourcePluginId: pluginId }],
        commands: {
          build: "go build ./...",
          test: "go test ./...",
        },
        structure: { monorepo: false, workspaces: [], importantFiles },
      };
      return patch;
    },
  };
}
