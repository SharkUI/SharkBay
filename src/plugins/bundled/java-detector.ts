import type { BundledPlugin, MachineDetector, ProjectDetector, ProjectProfilePatch } from "../plugin-host.js";
import { probeTools } from "./tool-probe.js";

const pluginId = "xyz.sharkbay.language.java";

export function javaBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: pluginId,
      name: "Java Project Detection",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [{ kind: "profile:machine" }, { kind: "profile:project" }, { kind: "file:read", patterns: ["pom.xml", "build.gradle*", "settings.gradle*"] }],
      contributes: {
        machineDetectors: [{ id: "java.machine", label: "Java Toolchain Detector" }],
        projectDetectors: [{ id: "java.project", label: "Java Project Detector" }],
      },
    },
    register(api) {
      api.registerMachineDetector(createJavaMachineDetector());
      api.registerProjectDetector(createJavaProjectDetector());
    },
  };
}

export function createJavaMachineDetector(): MachineDetector {
  return {
    id: "java.machine",
    pluginId,
    label: "Java Toolchain Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const [languages, packageManagers] = await Promise.all([
        probeTools(ctx, [
          { id: "java", command: "java" },
          { id: "javac", command: "javac" },
        ], pluginId),
        probeTools(ctx, [
          { id: "mvn", command: "mvn" },
          { id: "gradle", command: "gradle" },
        ], pluginId),
      ]);
      return {
        languages: languages.filter((tool) => tool.available),
        packageManagers: packageManagers.filter((tool) => tool.available),
      };
    },
  };
}

export function createJavaProjectDetector(): ProjectDetector {
  return {
    id: "java.project",
    pluginId,
    label: "Java Project Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const files = await ctx.listFiles().catch(() => []);
      const fileSet = new Set(files.filter((file) => file.kind === "file").map((file) => file.path));
      const hasMaven = fileSet.has("pom.xml");
      const hasGradle = fileSet.has("build.gradle") || fileSet.has("build.gradle.kts") || fileSet.has("settings.gradle") || fileSet.has("settings.gradle.kts");
      if (!hasMaven && !hasGradle) return {};

      const evidence: string[] = [];
      if (hasMaven) evidence.push("pom.xml");
      if (hasGradle) evidence.push("build.gradle");

      const packageManager = hasMaven
        ? { id: "maven", confidence: 0.95, manifest: "pom.xml", evidence: ["pom.xml"], sourcePluginId: pluginId }
        : { id: "gradle", confidence: 0.9, manifest: fileSet.has("build.gradle.kts") ? "build.gradle.kts" : "build.gradle", evidence: ["build.gradle"], sourcePluginId: pluginId };

      const pomRaw = hasMaven ? await ctx.readTextFile("pom.xml", { maxBytes: 256 * 1024 }) : null;
      const lowerPom = pomRaw?.toLowerCase() ?? "";
      const frameworks: NonNullable<ProjectProfilePatch["frameworks"]> = [];
      if (lowerPom.includes("spring-boot")) {
        frameworks.push({ id: "spring-boot", confidence: 0.85, evidence: ["pom.xml"], sourcePluginId: pluginId });
      }

      const importantFiles = [
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "settings.gradle",
        "settings.gradle.kts",
      ].filter((file) => fileSet.has(file));

      const patch: ProjectProfilePatch = {
        languages: [{ id: "java", confidence: 0.9, evidence, sourcePluginId: pluginId }],
        packageManagers: [packageManager],
        frameworks,
        commands: hasMaven
          ? { build: "mvn package", test: "mvn test" }
          : { build: "./gradlew build", test: "./gradlew test" },
        structure: { monorepo: false, workspaces: [], importantFiles },
      };
      return patch;
    },
  };
}
