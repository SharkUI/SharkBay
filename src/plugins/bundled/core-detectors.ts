import path from "node:path";
import type { BundledPlugin, MachineDetector, ProjectDetector } from "../plugin-host.js";

const pluginId = "com.sharkbay.core";

export function coreBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: pluginId,
      name: "SharkBay Core Detectors",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [{ kind: "profile:machine" }, { kind: "profile:project" }],
      contributes: {
        machineDetectors: [{ id: "core.machine", label: "Core Machine Detector" }],
        projectDetectors: [{ id: "core.project", label: "Core Project Detector" }],
      },
    },
    register(api) {
      api.registerMachineDetector(createCoreMachineDetector());
      api.registerProjectDetector(createCoreProjectDetector());
    },
  };
}

export function createCoreMachineDetector(): MachineDetector {
  return {
    id: "core.machine",
    pluginId,
    label: "Core Machine Detector",
    runOn: ["quick", "standard", "deep"],
    async run(ctx) {
      const [hostname, uname, shellPath] = await Promise.all([
        ctx.run("hostname 2>/dev/null || true", { timeoutMs: 3000 }),
        ctx.run("uname -srm 2>/dev/null || true", { timeoutMs: 3000 }),
        ctx.run("printf '%s' \"${SHELL:-}\"", { timeoutMs: 3000 }),
      ]);
      const unameParts = uname.stdout.trim().split(/\s+/u);
      const shell = shellPath.stdout.trim();
      return {
        hostname: hostname.stdout.trim() || null,
        os: {
          platform: platformFromUname(unameParts[0]),
          name: unameParts[0] || null,
          version: unameParts[2] || null,
          arch: unameParts[1] || null,
          kernel: unameParts[2] || null,
        },
        shell: {
          path: shell || null,
          name: shell ? path.posix.basename(shell) : null,
        },
      };
    },
  };
}

export function createCoreProjectDetector(): ProjectDetector {
  return {
    id: "core.project",
    pluginId,
    label: "Core Project Detector",
    runOn: ["quick", "standard", "deep"],
    async run(ctx) {
      const files = await ctx.listFiles().catch(() => []);
      const importantFiles = files
        .filter((file) => file.kind === "file")
        .map((file) => file.path)
        .filter((filePath) => [
          "package.json",
          "pyproject.toml",
          "requirements.txt",
          "go.mod",
          "pom.xml",
          "build.gradle",
          "Cargo.toml",
          ".env",
          ".env.example",
        ].includes(filePath));
      return {
        structure: {
          monorepo: files.some((file) => file.path === "pnpm-workspace.yaml"),
          workspaces: [],
          importantFiles,
        },
        env: {
          files: importantFiles.filter((filePath) => filePath === ".env" || filePath.startsWith(".env.")),
          exampleFiles: importantFiles.filter((filePath) => filePath.includes("example") || filePath.includes("sample")),
        },
      };
    },
  };
}

function platformFromUname(value: string | undefined): "darwin" | "linux" | "windows" | "unknown" {
  const normalized = value?.toLowerCase();
  if (normalized === "darwin") return "darwin";
  if (normalized === "linux") return "linux";
  if (normalized?.includes("mingw") || normalized?.includes("msys") || normalized?.includes("windows")) return "windows";
  return "unknown";
}
