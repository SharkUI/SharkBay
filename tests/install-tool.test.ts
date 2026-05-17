import { describe, expect, it } from "vitest";
import { SharkBayCoreService } from "../src/core/core-service.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { PluginHost } from "../src/plugins/plugin-host.js";
import { agentBundledPlugin } from "../src/plugins/bundled/agent-detector.js";
import type { CommandResult, RunCommandOptions } from "../src/core/execution-provider.js";
import type { InstallLogEvent, IpcRuntimeLike, MachineProfile } from "../src/shared/types.js";
import { makeTestRuntime } from "./helpers.js";

function pluginHostWithAgentPlugin(): PluginHost {
  const host = new PluginHost();
  host.registerPlugin(agentBundledPlugin(), { source: "bundled" });
  return host;
}

class InstallTestProvider extends LocalProvider {
  readonly commands: string[] = [];
  platform: MachineProfile["os"]["platform"] = "darwin";
  npmAvailable = true;

  override readMachineProfile(_runtime: IpcRuntimeLike, _targetId: string): Promise<MachineProfile> {
    return Promise.resolve({
      targetId: "local",
      targetKind: "local",
      detectedAt: "2026-05-16T00:00:00Z",
      hostname: "test",
      os: { platform: this.platform, name: "Darwin", version: "1", arch: "arm64", kernel: "1" },
      shell: { path: "/bin/zsh", name: "zsh" },
      tools: [],
      languages: [],
      packageManagers: [{ id: "npm", command: "npm", available: this.npmAvailable, path: this.npmAvailable ? "/usr/bin/npm" : null, version: this.npmAvailable ? "npm 10" : null }],
      agents: [],
      warnings: [],
    });
  }

  override runCommand(_runtime: IpcRuntimeLike, _uriOrTargetId: string, command: string, _options?: RunCommandOptions): Promise<CommandResult> {
    this.commands.push(command);
    if (command.includes("--version")) {
      return Promise.resolve({ stdout: "codex 1.0.0\n", stderr: "", exitCode: 0 });
    }
    return Promise.resolve({ stdout: "installed\n", stderr: "", exitCode: 0 });
  }
}

describe("CoreService installTool", () => {
  it("runs install recipe steps, verifies, and refreshes machine profile", async () => {
    const runtime = await makeTestRuntime("install-tool");
    const provider = new InstallTestProvider();
    const core = new SharkBayCoreService([provider], pluginHostWithAgentPlugin());

    const result = await core.installTool(runtime, { targetId: "local", recipeId: "codex.npm.global" });

    expect(result).toMatchObject({
      ok: true,
      recipeId: "codex.npm.global",
      targetId: "local",
      verified: true,
    });
    expect(provider.commands).toEqual(expect.arrayContaining([
      "npm install -g @openai/codex",
      "'codex' '--version'",
    ]));
    expect(result.logs).toEqual(expect.arrayContaining([
      "$ npm install -g @openai/codex",
      "installed",
      "$ 'codex' '--version'",
      "codex 1.0.0",
    ]));
  });

  it("lists recipes compatible with target kind, OS, and preconditions", async () => {
    const runtime = await makeTestRuntime("install-tool-list");
    const provider = new InstallTestProvider();
    const core = new SharkBayCoreService([provider], pluginHostWithAgentPlugin());

    const recipes = await core.listInstallRecipes(runtime, { targetId: "local", toolId: "codex" });
    expect(recipes.map((recipe) => recipe.id)).toEqual(["codex.npm.global"]);

    provider.npmAvailable = false;
    await core.readMachineProfile(runtime, "local", { refresh: true });
    await expect(core.listInstallRecipes(runtime, { targetId: "local", toolId: "codex" })).resolves.toEqual([]);
  });

  it("emits installLog events with installId/recipeId/stream for each step", async () => {
    const runtime = await makeTestRuntime("install-tool-stream");
    const provider = new InstallTestProvider();
    const core = new SharkBayCoreService([provider], pluginHostWithAgentPlugin());
    const events: InstallLogEvent[] = [];
    core.on("installLog", (event) => events.push(event));

    const result = await core.installTool(runtime, { targetId: "local", recipeId: "codex.npm.global" });

    expect(result.ok).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    const installIds = new Set(events.map((event) => event.installId));
    expect(installIds.size).toBe(1);
    expect(events.every((event) => event.recipeId === "codex.npm.global" && event.targetId === "local")).toBe(true);
    expect(events.some((event) => event.stream === "command" && event.line.startsWith("$ npm install"))).toBe(true);
    expect(events.some((event) => event.stream === "stdout" && event.line === "installed")).toBe(true);
  });

  it("rejects install recipes that do not support the target OS", async () => {
    const runtime = await makeTestRuntime("install-tool-platform");
    const provider = new InstallTestProvider();
    provider.platform = "windows";
    const core = new SharkBayCoreService([provider], pluginHostWithAgentPlugin());

    await expect(core.installTool(runtime, { targetId: "local", recipeId: "codex.npm.global" })).resolves.toMatchObject({
      ok: false,
      error: "Recipe does not support windows",
    });
  });
});
