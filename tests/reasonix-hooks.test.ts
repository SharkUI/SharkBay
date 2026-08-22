import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HookBridge } from "../src/main/hooks/bridge.js";
import { ReasonixConnector } from "../src/main/hooks/connectors/reasonix.js";
import { AgentHookStateManager } from "../src/main/hooks/state-manager.js";

describe("Reasonix status hooks", () => {
  it.each([
    ["SessionStart", "session_start"],
    ["SessionEnd", "session_end"],
    ["UserPromptSubmit", "prompt"],
    ["PreToolUse", "tool_start"],
    ["PostToolUse", "tool_end"],
    ["Stop", "turn_end"],
    ["PermissionRequest", "attention"],
    ["Notification", "attention"],
  ] as const)("normalizes %s as %s", (nativeEvent, event) => {
    const connector = new ReasonixConnector();

    expect(connector.normalize({
      event: nativeEvent,
      cwd: "/tmp/sharkbay-project",
      sharkbaySessionId: "session-123",
      toolName: "bash",
      toolArgs: { command: "npm test" },
      toolResult: "ok",
      prompt: "Run the tests",
      message: "approval needed: bash",
    })).toMatchObject({
      agent: "reasonix",
      sessionId: "session-123",
      event,
      cwd: "/tmp/sharkbay-project",
    });
  });

  it("preserves Reasonix tool payloads", () => {
    const connector = new ReasonixConnector();

    expect(connector.normalize({
      event: "PostToolUse",
      cwd: "/tmp/sharkbay-project",
      sharkbaySessionId: "session-123",
      toolName: "bash",
      toolArgs: { command: "npm test" },
      toolResult: "passed",
    })).toMatchObject({
      tool: {
        name: "bash",
        input: { command: "npm test" },
        response: "passed",
      },
    });
  });

  it("drives working, approval, and stopped project state", () => {
    const manager = new AgentHookStateManager();
    const states: string[] = [];
    manager.registerConnector(new ReasonixConnector());
    manager.on("stateChange", (event) => states.push(event.state));

    const payload = { cwd: "/tmp/sharkbay-project", sharkbaySessionId: "session-123" };
    manager.handleMessage({ source: "reasonix", payload: { ...payload, event: "UserPromptSubmit", prompt: "Fix it" } });
    manager.handleMessage({ source: "reasonix", payload: { ...payload, event: "Notification", message: "approval needed: bash" } });
    manager.handleMessage({ source: "reasonix", payload: { ...payload, event: "Stop" } });

    expect(states).toEqual(["working", "approval", "stopped"]);
    manager.dispose();
  });

  it("installs and removes only SharkBay-managed Reasonix hooks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-reasonix-hooks-"));
    const configPath = path.join(root, "settings.json");
    const hookPath = path.join(root, "Application Support", "SharkBay", "bin", "sharkbay-hook");
    const connector = new ReasonixConnector({ configPath });

    try {
      await fs.writeFile(configPath, JSON.stringify({
        theme: "dark",
        hooks: {
          Stop: [{ command: "notify-send done", description: "User hook" }],
        },
      }), "utf8");

      await connector.install(hookPath);
      expect(await connector.status()).toBe("installed");

      const installed = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, any>;
      expect(installed.theme).toBe("dark");
      expect(installed.hooks.Stop[0]).toEqual({ command: "notify-send done", description: "User hook" });
      expect(installed.hooks.Stop[1]).toMatchObject({
        command: `'${hookPath}' --source reasonix`,
        description: "SharkBay agent status",
        timeout: 5000,
      });
      expect(installed.hooks.PreToolUse.at(-1)).toMatchObject({ match: "*" });
      expect(Object.keys(installed.hooks)).toEqual(expect.arrayContaining([
        "SessionStart",
        "SessionEnd",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "Stop",
        "PermissionRequest",
        "Notification",
      ]));

      await connector.uninstall();
      expect(await connector.status()).toBe("not_installed");
      const uninstalled = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, any>;
      expect(uninstalled).toEqual({
        theme: "dark",
        hooks: {
          Stop: [{ command: "notify-send done", description: "User hook" }],
        },
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("adds SharkBay's launch-scoped session id in the shared hook bridge", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-reasonix-bridge-"));
    const appDataPath = path.join(root, "app-data");
    const bridge = new HookBridge({ socketPathFile: path.join(root, "hook-socket-path") });

    try {
      (bridge as unknown as { deployHookCli(appDataPath: string): void }).deployHookCli(appDataPath);
      const script = await fs.readFile(path.join(appDataPath, "bin", "sharkbay-hook"), "utf8");
      expect(script).toContain('source === "reasonix"');
      expect(script).toContain("process.env.SHARKBAY_SESSION_ID || process.env.SHARKBAY_RESTORED_SESSION_ID");
      expect(script).toContain("parsed = { ...parsed, sharkbaySessionId }");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
