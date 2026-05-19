import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRuntimeConfigPath } from "../src/main/config.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { SharkBayCoreService } from "../src/core/core-service.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { PluginHost, type ProjectDetector } from "../src/plugins/plugin-host.js";
import { createGitRepoFixture, makeTempRoot, makeTestRuntime, writeJson } from "./helpers.js";

function pluginWithProjectDetector(detector: ProjectDetector) {
  return {
    manifest: {
      id: detector.pluginId,
      name: detector.pluginId,
      version: "0.0.0",
      publisher: "test",
      engines: { sharkbay: "^0.2.0" },
    },
    register: (api: { registerProjectDetector(d: ProjectDetector): void }) => api.registerProjectDetector(detector),
  };
}

describe("ProfileOrchestrator", () => {
  it("runs bundled project detectors through provider probe contexts", async () => {
    const runtime = await makeTestRuntime("profile-orchestrator");
    const root = await makeTempRoot("profile-orchestrator-root");
    const repo = await createGitRepoFixture(root, "ProfileRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [repo],
      updatedAt: "2026-05-16",
    });
    await fs.writeFile(path.join(repo, "package.json"), "{\"scripts\":{\"dev\":\"vite\"}}\n");
    await fs.writeFile(path.join(repo, ".env.example"), "PORT=5173\n");

    const core = new SharkBayCoreService([new LocalProvider()]);
    const profile = await core.readProjectProfile(runtime, toLocalProjectUri(repo));

    expect(profile.structure.importantFiles).toEqual(expect.arrayContaining(["package.json", ".env.example"]));
    expect(profile.env.exampleFiles).toEqual([".env.example"]);
  });

  it("runs bundled machine detectors through provider command contexts", async () => {
    const runtime = await makeTestRuntime("machine-profile-orchestrator");
    const core = new SharkBayCoreService([new LocalProvider()]);

    const profile = await core.readMachineProfile(runtime, "local");

    expect(profile.hostname).toBeTruthy();
    expect(profile.os.platform).not.toBe("unknown");
    expect(profile.agents.some((agent) => agent.id === "codex")).toBe(true);
  });

  it("keeps project profile usable when a detector fails", async () => {
    const runtime = await makeTestRuntime("profile-orchestrator-failure");
    const root = await makeTempRoot("profile-orchestrator-failure-root");
    const repo = await createGitRepoFixture(root, "FailureRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [repo],
      updatedAt: "2026-05-16",
    });
    const host = new PluginHost();
    host.registerPlugin(pluginWithProjectDetector({
      id: "fail.project",
      pluginId: "test.plugin",
      label: "Failure Detector",
      run: async () => {
        throw new Error("boom");
      },
    }));

    const core = new SharkBayCoreService([new LocalProvider()], host);
    const profile = await core.readProjectProfile(runtime, toLocalProjectUri(repo));

    expect(profile.name).toBe("FailureRepo");
    expect(profile.warnings).toEqual([
      expect.objectContaining({ code: "detector-failed", source: "test.plugin" }),
    ]);
  });

  it("invalidates project profile cache when a manifest changes", async () => {
    const runtime = await makeTestRuntime("profile-orchestrator-fingerprint");
    const root = await makeTempRoot("profile-orchestrator-fingerprint-root");
    const repo = await createGitRepoFixture(root, "FingerprintRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [repo],
      updatedAt: "2026-05-16",
    });
    await fs.writeFile(path.join(repo, "package.json"), "{\"scripts\":{\"dev\":\"vite\"}}\n");
    let runs = 0;
    const host = new PluginHost();
    host.registerPlugin(pluginWithProjectDetector({
      id: "fingerprint.project",
      pluginId: "test.plugin",
      label: "Fingerprint Detector",
      run: async () => {
        runs += 1;
        return { frameworks: [{ id: `run-${runs}`, confidence: 1, evidence: [] }] };
      },
    }));
    const core = new SharkBayCoreService([new LocalProvider()], host);
    const projectUri = toLocalProjectUri(repo);

    await core.readProjectProfile(runtime, projectUri);
    await core.readProjectProfile(runtime, projectUri);
    expect(runs).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.writeFile(path.join(repo, "package.json"), "{\"scripts\":{\"dev\":\"next\"}}\n");
    await core.readProjectProfile(runtime, projectUri);
    expect(runs).toBe(2);
  });

  it("uses cached profiles unless refresh is requested", async () => {
    const runtime = await makeTestRuntime("profile-orchestrator-cache");
    const root = await makeTempRoot("profile-orchestrator-cache-root");
    const repo = await createGitRepoFixture(root, "CacheRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [repo],
      updatedAt: "2026-05-16",
    });
    let runs = 0;
    const host = new PluginHost();
    host.registerPlugin(pluginWithProjectDetector({
      id: "count.project",
      pluginId: "test.plugin",
      label: "Count Detector",
      run: async () => {
        runs += 1;
        return { frameworks: [{ id: `run-${runs}`, confidence: 1, evidence: [] }] };
      },
    }));
    const core = new SharkBayCoreService([new LocalProvider()], host);
    const projectUri = toLocalProjectUri(repo);

    const first = await core.readProjectProfile(runtime, projectUri);
    const second = await core.readProjectProfile(runtime, projectUri);
    const refreshed = await core.readProjectProfile(runtime, projectUri, { refresh: true });

    expect(first.frameworks[0]?.id).toBe("run-1");
    expect(second.frameworks[0]?.id).toBe("run-1");
    expect(refreshed.frameworks[0]?.id).toBe("run-2");
    expect(runs).toBe(2);
  });
});
