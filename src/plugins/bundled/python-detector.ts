import type { BundledPlugin, MachineDetector, ProjectDetector, ProjectProfilePatch } from "../plugin-host.js";
import { probeTools } from "./tool-probe.js";

const pluginId = "com.sharkbay.language.python";

export function pythonBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: pluginId,
      name: "Python Support",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [{ kind: "profile:machine" }, { kind: "profile:project" }, { kind: "file:read", patterns: ["pyproject.toml", "requirements*.txt", "Pipfile*", "*.lock"] }],
      contributes: {
        machineDetectors: [{ id: "python.machine", label: "Python Runtime Detector" }],
        projectDetectors: [{ id: "python.project", label: "Python Project Detector" }],
      },
    },
    register(api) {
      api.registerMachineDetector(createPythonMachineDetector());
      api.registerProjectDetector(createPythonProjectDetector());
    },
  };
}

export function createPythonMachineDetector(): MachineDetector {
  return {
    id: "python.machine",
    pluginId,
    label: "Python Runtime Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const [languages, packageManagers] = await Promise.all([
        probeTools(ctx, [
          { id: "python", command: "python" },
          { id: "python3", command: "python3" },
        ], pluginId),
        probeTools(ctx, [
          { id: "pip", command: "pip" },
          { id: "pip3", command: "pip3" },
          { id: "uv", command: "uv" },
          { id: "poetry", command: "poetry" },
          { id: "pipenv", command: "pipenv" },
          { id: "conda", command: "conda" },
        ], pluginId),
      ]);
      return {
        languages: languages.filter((tool) => tool.available),
        packageManagers: packageManagers.filter((tool) => tool.available),
      };
    },
  };
}

export function createPythonProjectDetector(): ProjectDetector {
  return {
    id: "python.project",
    pluginId,
    label: "Python Project Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const files = await ctx.listFiles().catch(() => []);
      const fileSet = new Set(files.filter((file) => file.kind === "file").map((file) => file.path));
      const hasPyproject = fileSet.has("pyproject.toml");
      const hasRequirements = fileSet.has("requirements.txt") || fileSet.has("requirements-dev.txt");
      const hasPipfile = fileSet.has("Pipfile");
      if (!hasPyproject && !hasRequirements && !hasPipfile) return {};

      const evidence: string[] = [];
      if (hasPyproject) evidence.push("pyproject.toml");
      if (hasRequirements) evidence.push("requirements.txt");
      if (hasPipfile) evidence.push("Pipfile");

      const packageManager = detectPackageManager(fileSet);
      const frameworks: NonNullable<ProjectProfilePatch["frameworks"]> = [];
      const pyprojectRaw = hasPyproject ? await ctx.readTextFile("pyproject.toml", { maxBytes: 256 * 1024 }) : null;
      const lowerPyproject = pyprojectRaw?.toLowerCase() ?? "";
      if (lowerPyproject.includes("django") || fileSet.has("manage.py")) {
        frameworks.push({ id: "django", confidence: 0.85, evidence: ["pyproject.toml"], sourcePluginId: pluginId });
      }
      if (lowerPyproject.includes("fastapi")) {
        frameworks.push({ id: "fastapi", confidence: 0.8, evidence: ["pyproject.toml"], sourcePluginId: pluginId });
      }
      if (lowerPyproject.includes("flask")) {
        frameworks.push({ id: "flask", confidence: 0.75, evidence: ["pyproject.toml"], sourcePluginId: pluginId });
      }

      const importantFiles = [
        "pyproject.toml",
        "requirements.txt",
        "requirements-dev.txt",
        "Pipfile",
        "Pipfile.lock",
        "uv.lock",
        "poetry.lock",
        "manage.py",
      ].filter((file) => fileSet.has(file));

      return {
        languages: [{ id: "python", confidence: 0.9, evidence, sourcePluginId: pluginId }],
        packageManagers: [packageManager],
        frameworks,
        structure: {
          monorepo: false,
          workspaces: [],
          importantFiles,
        },
      };
    },
  };
}

function detectPackageManager(fileSet: Set<string>) {
  if (fileSet.has("uv.lock")) {
    return { id: "uv", confidence: 0.95, manifest: "pyproject.toml", lockfile: "uv.lock", evidence: ["uv.lock"], sourcePluginId: pluginId };
  }
  if (fileSet.has("poetry.lock")) {
    return { id: "poetry", confidence: 0.95, manifest: "pyproject.toml", lockfile: "poetry.lock", evidence: ["poetry.lock"], sourcePluginId: pluginId };
  }
  if (fileSet.has("Pipfile.lock") || fileSet.has("Pipfile")) {
    return { id: "pipenv", confidence: 0.85, manifest: "Pipfile", lockfile: fileSet.has("Pipfile.lock") ? "Pipfile.lock" : undefined, evidence: ["Pipfile"], sourcePluginId: pluginId };
  }
  return { id: "pip", confidence: fileSet.has("requirements.txt") ? 0.8 : 0.5, manifest: "pyproject.toml", evidence: ["requirements.txt"], sourcePluginId: pluginId };
}
