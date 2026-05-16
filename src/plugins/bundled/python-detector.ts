import type { ProjectDetector, ProjectProfilePatch } from "../plugin-host.js";

const pluginId = "com.sharkbay.language.python";

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
