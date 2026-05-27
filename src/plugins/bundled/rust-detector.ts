import type { BundledPlugin, MachineDetector, ProjectDetector, ProjectProfilePatch } from "../plugin-host.js";
import { probeTools } from "./tool-probe.js";

const pluginId = "xyz.sharkbay.language.rust";

export function rustBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: pluginId,
      name: "Rust Project Detection",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [{ kind: "profile:machine" }, { kind: "profile:project" }, { kind: "file:read", patterns: ["Cargo.toml", "Cargo.lock"] }],
      contributes: {
        machineDetectors: [{ id: "rust.machine", label: "Rust Toolchain Detector" }],
        projectDetectors: [{ id: "rust.project", label: "Rust Project Detector" }],
      },
    },
    register(api) {
      api.registerMachineDetector(createRustMachineDetector());
      api.registerProjectDetector(createRustProjectDetector());
    },
  };
}

export function createRustMachineDetector(): MachineDetector {
  return {
    id: "rust.machine",
    pluginId,
    label: "Rust Toolchain Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const [languages, packageManagers] = await Promise.all([
        probeTools(ctx, [{ id: "rustc", command: "rustc" }], pluginId),
        probeTools(ctx, [{ id: "cargo", command: "cargo" }], pluginId),
      ]);
      return {
        languages: languages.filter((tool) => tool.available),
        packageManagers: packageManagers.filter((tool) => tool.available),
      };
    },
  };
}

export function createRustProjectDetector(): ProjectDetector {
  return {
    id: "rust.project",
    pluginId,
    label: "Rust Project Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const files = await ctx.listFiles().catch(() => []);
      const fileSet = new Set(files.filter((file) => file.kind === "file").map((file) => file.path));
      if (!fileSet.has("Cargo.toml")) return {};
      const cargoToml = await ctx.readTextFile("Cargo.toml", { maxBytes: 128 * 1024 }) ?? "";
      const isWorkspace = /\[workspace\]/u.test(cargoToml);

      const importantFiles = ["Cargo.toml", "Cargo.lock"].filter((file) => fileSet.has(file));
      const patch: ProjectProfilePatch = {
        languages: [{ id: "rust", confidence: 0.95, evidence: ["Cargo.toml"], sourcePluginId: pluginId }],
        packageManagers: [{ id: "cargo", confidence: 0.95, manifest: "Cargo.toml", lockfile: fileSet.has("Cargo.lock") ? "Cargo.lock" : undefined, evidence: ["Cargo.toml"], sourcePluginId: pluginId }],
        commands: {
          build: "cargo build",
          test: "cargo test",
        },
        structure: { monorepo: isWorkspace, workspaces: [], importantFiles },
      };
      return patch;
    },
  };
}
