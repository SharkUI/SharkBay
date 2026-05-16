import type { ProjectDetector, ProjectProfilePatch } from "../plugin-host.js";

const pluginId = "com.sharkbay.language.go";

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
