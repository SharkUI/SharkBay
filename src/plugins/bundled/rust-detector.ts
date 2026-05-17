import type { BundledPlugin, ProjectDetector, ProjectProfilePatch } from "../plugin-host.js";

const pluginId = "com.sharkbay.language.rust";

export function rustBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: pluginId,
      name: "Rust Support",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [{ kind: "profile:project" }, { kind: "file:read", patterns: ["Cargo.toml", "Cargo.lock"] }],
      contributes: {
        projectDetectors: [{ id: "rust.project", label: "Rust Project Detector" }],
      },
    },
    register(api) {
      api.registerProjectDetector(createRustProjectDetector());
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
