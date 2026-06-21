import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultConfig, getRuntimeConfigPath, loadAppConfig } from "../src/main/config.js";
import { createGitRepoFixture, makeTestRuntime, writeJson } from "./helpers.js";

describe("config migration", () => {
  it("defaults new configs to the Morning appearance", () => {
    expect(createDefaultConfig().appearanceTheme).toBe("morning");
  });

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
      projectAliases: {},
      disabledPluginIds: [],
      appearanceTheme: "night",
      statusChangeNotificationsEnabled: true,
    }));
    expect(persisted.configuredProjects).toEqual([project]);
    expect(persisted.disabledPluginIds).toEqual([]);
  });

  it("preserves manually disabled status change notifications", async () => {
    const runtime = await makeTestRuntime("config-notifications-disabled");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [],
      projectAliases: {},
      disabledPluginIds: [],
      appearanceTheme: "day",
      statusChangeNotificationsEnabled: false,
      updatedAt: "2026-05-01",
    });

    const loaded = await loadAppConfig(getRuntimeConfigPath(runtime));

    expect(loaded.statusChangeNotificationsEnabled).toBe(false);
  });
});
