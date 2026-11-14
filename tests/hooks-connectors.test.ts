import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeConnector, CodexConnector, QwenConnector } from "../src/main/hooks/connectors/claude-family.js";
import { AgentHookStateManager } from "../src/main/hooks/state-manager.js";

import { GeminiConnector } from "../src/main/hooks/connectors/gemini.js";
import { KiroConnector } from "../src/main/hooks/connectors/kiro.js";
import { CursorConnector } from "../src/main/hooks/connectors/cursor.js";
import { ReasonixConnector } from "../src/main/hooks/connectors/reasonix.js";
import { OpenCodeConnector } from "../src/main/hooks/connectors/opencode.js";

describe("hook connectors", () => {
  it.each([ClaudeConnector, CodexConnector, QwenConnector, GeminiConnector, KiroConnector, CursorConnector, ReasonixConnector, OpenCodeConnector])("detects hooks targeting an older runtime (%s)", async (Connector) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-hook-migration-"));
    const connector = new Connector();
    Object.assign(connector, {
      configPath: path.join(root, connector.id === "codex" ? "config.toml" : "settings.json"),
      configDir: root, agentsDir: root,
      pluginDir: path.join(root, "plugins", "sharkbay"),
      pluginEntry: path.join(root, "plugins", "sharkbay", "index.js"),
    });
    const current = path.join(root, "current profile", "bin", "sharkbay-hook");
    try {
      await connector.install(path.join(root, "old", "bin", "sharkbay-hook"));
      expect(await connector.status()).toBe("installed");
      expect(await connector.status(current)).toBe("outdated");
      await connector.install(current);
      expect(await connector.status(current)).toBe("installed");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("installs Codex hooks using Codex inline TOML matcher groups", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-codex-hooks-"));
    const configPath = path.join(root, "config.toml");
    const hookPath = path.join(root, "Application Support", "SharkBay", "bin", "sharkbay-hook");
    const connector = new CodexConnector();
    (connector as unknown as { configPath: string }).configPath = configPath;

    try {
      await fs.writeFile(
        configPath,
        [
          'model = "gpt-5.5"',
          "",
          "# --- sharkbay-managed-hooks-start ---",
          "[hooks.user_prompt_submit]",
          'command = "\'/old/sharkbay-hook\' --source codex"',
          "# --- sharkbay-managed-hooks-end ---",
          "",
        ].join("\n"),
        "utf8",
      );

      await connector.install(hookPath);

      const config = await fs.readFile(configPath, "utf8");
      expect(config).toContain('model = "gpt-5.5"');
      expect(config).not.toContain("[hooks.user_prompt_submit]");
      expect(config).not.toContain("/old/sharkbay-hook");
      expect(config).toContain("[[hooks.UserPromptSubmit]]");
      expect(config).toContain("[[hooks.UserPromptSubmit.hooks]]");
      expect(config).toContain("[[hooks.PreToolUse]]");
      expect(config).toContain('matcher = "*"');
      expect(config).toContain("[[hooks.PermissionRequest.hooks]]");
      expect(config).toContain("timeout = 86400");
      expect(config).toContain("[[hooks.Interrupt.hooks]]");
      expect(config).toContain('type = "command"');
      expect(config).toContain(`command = "'${hookPath}' --source codex"`);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("normalizes Codex Interrupt as the end of the active turn", () => {
    const payload = {
      hook_event_name: "Interrupt",
      session_id: "codex-session",
      turn_id: "interrupted-turn",
      cwd: "/tmp/sharkbay-project",
      permission_mode: "default",
    };

    expect(new CodexConnector().normalize(payload)).toMatchObject({
      agent: "codex",
      sessionId: "codex-session",
      event: "turn_end",
      cwd: payload.cwd,
    });
    expect(new ClaudeConnector().normalize(payload)).toBeNull();
  });

  it("stops a working Codex session when its turn is interrupted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-codex-status-"));
    const manager = new AgentHookStateManager();
    const states: string[] = [];
    manager.registerConnector(new CodexConnector());
    manager.on("stateChange", (event) => states.push(event.state));
    const payload = { cwd: root, session_id: "codex-session", turn_id: "interrupted-turn" };

    try {
      manager.handleMessage({ source: "codex", payload: { ...payload, hook_event_name: "UserPromptSubmit" } });
      manager.handleMessage({ source: "codex", payload: { ...payload, hook_event_name: "Interrupt" } });

      expect(states).toEqual(["working", "stopped"]);
      expect(manager.getStatus(root, payload.session_id)?.state).toBe("stopped");
    } finally {
      manager.dispose();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
