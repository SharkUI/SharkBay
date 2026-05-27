import type { BundledPlugin, MachineDetector, ProjectDetector, ProjectProfilePatch } from "../plugin-host.js";
import type { DetectedPackageManager, ProjectProfile } from "../../shared/types.js";
import { probeTools } from "./tool-probe.js";

const pluginId = "xyz.sharkbay.language.node";

export function nodeBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: pluginId,
      name: "Node.js Project Detection",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [{ kind: "profile:machine" }, { kind: "profile:project" }, { kind: "file:read", patterns: ["package.json", "*.lock", "pnpm-workspace.yaml"] }],
      contributes: {
        machineDetectors: [{ id: "node.machine", label: "Node.js Runtime Detector" }],
        projectDetectors: [{ id: "node.project", label: "Node.js Project Detector" }],
      },
    },
    register(api) {
      api.registerMachineDetector(createNodeMachineDetector());
      api.registerProjectDetector(createNodeProjectDetector());
    },
  };
}

export function createNodeMachineDetector(): MachineDetector {
  return {
    id: "node.machine",
    pluginId,
    label: "Node.js Runtime Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const [languages, packageManagers] = await Promise.all([
        probeTools(ctx, [{ id: "node", command: "node" }], pluginId),
        probeTools(ctx, [
          { id: "npm", command: "npm" },
          { id: "pnpm", command: "pnpm" },
          { id: "yarn", command: "yarn" },
          { id: "bun", command: "bun" },
          { id: "corepack", command: "corepack" },
        ], pluginId),
      ]);
      return {
        languages: languages.filter((tool) => tool.available),
        packageManagers: packageManagers.filter((tool) => tool.available),
      };
    },
  };
}

type PackageJson = {
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  packageManager?: unknown;
  workspaces?: unknown;
};

export function createNodeProjectDetector(): ProjectDetector {
  return {
    id: "node.project",
    pluginId,
    label: "Node.js Project Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const packageJsonRaw = await ctx.readTextFile("package.json", { maxBytes: 512 * 1024 });
      if (!packageJsonRaw) return {};
      const packageJson = parsePackageJson(packageJsonRaw);
      if (!packageJson) {
        return { warnings: [{ code: "invalid-package-json", message: "package.json could not be parsed", source: pluginId }] };
      }
      const files = await ctx.listFiles().catch(() => []);
      const fileSet = new Set(files.map((file) => file.path));
      const dependencies = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
      const packageManager = detectPackageManager(packageJson, fileSet);
      const frameworks = detectFrameworks(dependencies, fileSet);
      const commands = detectCommands(packageJson.scripts ?? {});
      const services = commands.dev ? [{
        id: "node:dev",
        label: `dev: ${commands.dev}`,
        command: packageManagerCommand(packageManager.id, "dev"),
        cwdUri: ctx.projectUri,
        script: commands.dev,
        likelyPorts: [],
        sourcePluginId: pluginId,
      }] : [];

      const patch: ProjectProfilePatch = {
        languages: [{ id: "javascript", confidence: 0.7, evidence: ["package.json"], sourcePluginId: pluginId }],
        packageManagers: [packageManager],
        frameworks,
        commands,
        services,
        structure: {
          monorepo: hasWorkspaces(packageJson) || fileSet.has("pnpm-workspace.yaml"),
          workspaces: [],
          importantFiles: [
            "package.json",
            ...["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "pnpm-workspace.yaml"].filter((file) => fileSet.has(file)),
          ],
        },
      };
      if (fileSet.has("tsconfig.json")) {
        patch.languages = [
          ...(patch.languages ?? []),
          { id: "typescript", confidence: 0.8, evidence: ["tsconfig.json"], sourcePluginId: pluginId },
        ];
      }
      return patch;
    },
  };
}

function parsePackageJson(raw: string): PackageJson | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as PackageJson : null;
  } catch {
    return null;
  }
}

function detectPackageManager(packageJson: PackageJson, fileSet: Set<string>): DetectedPackageManager {
  const packageManager = typeof packageJson.packageManager === "string" ? packageJson.packageManager : "";
  if (packageManager.startsWith("pnpm@") || fileSet.has("pnpm-lock.yaml")) {
    return { id: "pnpm", confidence: 0.95, manifest: "package.json", lockfile: fileSet.has("pnpm-lock.yaml") ? "pnpm-lock.yaml" : undefined, evidence: ["package.json"], sourcePluginId: pluginId };
  }
  if (packageManager.startsWith("yarn@") || fileSet.has("yarn.lock")) {
    return { id: "yarn", confidence: 0.95, manifest: "package.json", lockfile: fileSet.has("yarn.lock") ? "yarn.lock" : undefined, evidence: ["package.json"], sourcePluginId: pluginId };
  }
  if (packageManager.startsWith("bun@") || fileSet.has("bun.lockb")) {
    return { id: "bun", confidence: 0.95, manifest: "package.json", lockfile: fileSet.has("bun.lockb") ? "bun.lockb" : undefined, evidence: ["package.json"], sourcePluginId: pluginId };
  }
  return { id: "npm", confidence: fileSet.has("package-lock.json") ? 0.95 : 0.7, manifest: "package.json", lockfile: fileSet.has("package-lock.json") ? "package-lock.json" : undefined, evidence: ["package.json"], sourcePluginId: pluginId };
}

function detectFrameworks(dependencies: Record<string, unknown>, fileSet: Set<string>): NonNullable<ProjectProfilePatch["frameworks"]> {
  const frameworks: NonNullable<ProjectProfilePatch["frameworks"]> = [];
  if ("next" in dependencies || hasAny(fileSet, ["next.config.js", "next.config.mjs", "next.config.ts"])) {
    frameworks.push({ id: "next", confidence: 0.9, evidence: ["package.json"], sourcePluginId: pluginId });
  }
  if ("vite" in dependencies || hasAny(fileSet, ["vite.config.js", "vite.config.mjs", "vite.config.ts"])) {
    frameworks.push({ id: "vite", confidence: 0.9, evidence: ["package.json"], sourcePluginId: pluginId });
  }
  if ("react" in dependencies) {
    frameworks.push({ id: "react", confidence: 0.8, evidence: ["package.json"], sourcePluginId: pluginId });
  }
  if ("electron" in dependencies) {
    frameworks.push({ id: "electron", confidence: 0.85, evidence: ["package.json"], sourcePluginId: pluginId });
  }
  if ("express" in dependencies) {
    frameworks.push({ id: "express", confidence: 0.75, evidence: ["package.json"], sourcePluginId: pluginId });
  }
  return frameworks;
}

function detectCommands(scripts: Record<string, unknown>): ProjectProfile["commands"] {
  return {
    install: undefined,
    dev: readScript(scripts, "dev"),
    build: readScript(scripts, "build"),
    test: readScript(scripts, "test"),
    lint: readScript(scripts, "lint"),
    format: readScript(scripts, "format"),
  };
}

function readScript(scripts: Record<string, unknown>, key: string): string | undefined {
  const value = scripts[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function packageManagerCommand(packageManager: string, script: string): string {
  if (packageManager === "npm") return `npm run ${script}`;
  if (packageManager === "bun") return `bun run ${script}`;
  return `${packageManager} ${script}`;
}

function hasWorkspaces(packageJson: PackageJson): boolean {
  return Array.isArray(packageJson.workspaces) || Boolean(packageJson.workspaces && typeof packageJson.workspaces === "object");
}

function hasAny(fileSet: Set<string>, files: string[]): boolean {
  return files.some((file) => fileSet.has(file));
}
