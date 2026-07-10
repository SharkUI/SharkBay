import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultConfig, getRuntimeConfigPath, loadAppConfig, setCaffeinateWhenTerminalWorking, setTerminalAppearance } from "../src/main/config.js";
import { createGitRepoFixture, makeTestRuntime, writeJson } from "./helpers.js";

describe("config migration", () => {
  it("defaults new configs to the Morning appearance", () => {
    expect(createDefaultConfig().appearanceTheme).toBe("morning");
    expect(createDefaultConfig().caffeinateWhenTerminalWorkingEnabled).toBe(false);
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
      caffeinateWhenTerminalWorkingEnabled: false,
    }));
    expect(persisted.configuredProjects).toEqual([project]);
    expect(persisted.disabledPluginIds).toEqual([]);
  });

  it("persists caffeinate while terminal working setting", async () => {
    const runtime = await makeTestRuntime("config-caffeinate-terminal-working");

    const configured = await setCaffeinateWhenTerminalWorking(runtime, { enabled: true });
    expect(configured.caffeinateWhenTerminalWorkingEnabled).toBe(true);

    const loaded = await loadAppConfig(getRuntimeConfigPath(runtime));
    expect(loaded.caffeinateWhenTerminalWorkingEnabled).toBe(true);
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

  it("persists and clears terminal appearance settings", async () => {
    const runtime = await makeTestRuntime("config-terminal-appearance");

    const configured = await setTerminalAppearance(runtime, {
      colorScheme: "nord",
      fontFamily: "Menlo",
      fontSize: 14,
      lineHeight: 1.25,
    });

    expect(configured).toEqual(expect.objectContaining({
      terminalColorScheme: "nord",
      terminalFontFamily: "Menlo",
      terminalFontSize: 14,
      terminalLineHeight: 1.25,
    }));

    const loaded = await loadAppConfig(getRuntimeConfigPath(runtime));
    expect(loaded.terminalColorScheme).toBe("nord");
    expect(loaded.terminalFontFamily).toBe("Menlo");
    expect(loaded.terminalFontSize).toBe(14);
    expect(loaded.terminalLineHeight).toBe(1.25);

    const cleared = await setTerminalAppearance(runtime, {
      colorScheme: null,
      fontFamily: null,
      fontSize: null,
      lineHeight: null,
    });

    expect(cleared.terminalColorScheme).toBeUndefined();
    expect(cleared.terminalFontFamily).toBeUndefined();
    expect(cleared.terminalFontSize).toBeUndefined();
    expect(cleared.terminalLineHeight).toBeUndefined();
  });
});
