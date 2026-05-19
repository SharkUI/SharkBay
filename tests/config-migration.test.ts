import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRuntimeConfigPath, loadAppConfig } from "../src/main/config.js";
import { createGitRepoFixture, makeTestRuntime, writeJson } from "./helpers.js";

describe("config migration", () => {
  it("persists missing modern config fields and preserves local roots", async () => {
    const runtime = await makeTestRuntime("config-migration-fields");
    const root = path.dirname(getRuntimeConfigPath(runtime));
    const project = await createGitRepoFixture(root, "LegacyProject");
    await writeJson(getRuntimeConfigPath(runtime), {
      configuredRoots: [project],
      appearanceTheme: "night",
      updatedAt: "2026-05-01",
    });

    const loaded = await loadAppConfig(getRuntimeConfigPath(runtime));
    const persisted = JSON.parse(await fs.readFile(getRuntimeConfigPath(runtime), "utf8")) as Record<string, unknown>;

    expect(loaded).toEqual(expect.objectContaining({
      schemaVersion: 1,
      configuredRoots: [project],
      configuredProjects: [project],
      configuredRemoteProjects: [],
      configuredRemoteMachines: [],
      projectAliases: {},
      disabledPluginIds: [],
      appearanceTheme: "night",
    }));
    expect(persisted.configuredProjects).toEqual([project]);
    expect(persisted.configuredRemoteProjects).toEqual([]);
    expect(persisted.configuredRemoteMachines).toEqual([]);
    expect(persisted.disabledPluginIds).toEqual([]);
  });
});
