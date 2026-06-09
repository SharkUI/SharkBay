import { describe, expect, it } from "vitest";
import { createDefaultConfig, getRuntimeConfigPath, loadAppConfig, setCodeGraphAutoMaintain } from "../src/main/config.js";
import { makeTestRuntime } from "./helpers.js";

describe("codeGraph auto-maintain config", () => {
  it("defaults to disabled", () => {
    expect(createDefaultConfig().codeGraphAutoMaintain).toBe(false);
  });

  it("persists the toggle and round-trips through load", async () => {
    const runtime = await makeTestRuntime("codegraph-automaintain");
    const configPath = getRuntimeConfigPath(runtime);

    const enabled = await setCodeGraphAutoMaintain(runtime, { enabled: true });
    expect(enabled.codeGraphAutoMaintain).toBe(true);
    expect((await loadAppConfig(configPath)).codeGraphAutoMaintain).toBe(true);

    const disabled = await setCodeGraphAutoMaintain(runtime, { enabled: false });
    expect(disabled.codeGraphAutoMaintain).toBe(false);
    expect((await loadAppConfig(configPath)).codeGraphAutoMaintain).toBe(false);
  });
});
