import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HookBridge } from "../src/main/hooks/bridge.js";
import { CodeWhaleConnector } from "../src/main/hooks/connectors/codewhale.js";
import { AgentHookStateManager } from "../src/main/hooks/state-manager.js";

describe("CodeWhale status hooks", () => {
  it("normalizes env-based hook payloads from the generated CodeWhale script", () => {
    const connector = new CodeWhaleConnector();

    expect(connector.normalize({
      hook_event: "tool_call_before",
      tool_name: "exec_shell",
      workspace: "/tmp/sharkbay-project",
      session_id: "sess_123",
    })).toMatchObject({
      agent: "codewhale",
      sessionId: "sess_123",
      event: "tool_start",
      tool: { name: "exec_shell" },
      cwd: "/tmp/sharkbay-project",
    });
  });

  it("applies CodeWhale hook events to project hook state", () => {
    const manager = new AgentHookStateManager();
    const events: Array<{ projectPath: string; state: string; action: string; agent: string }> = [];
    manager.registerConnector(new CodeWhaleConnector());
    manager.on("stateChange", (event) => events.push(event));

    manager.handleMessage({
      source: "codewhale",
      payload: {
        hook_event: "tool_call_before",
        tool_name: "exec_shell",
        workspace: "/tmp/sharkbay-project",
        session_id: "sess_123",
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      projectPath: "/tmp/sharkbay-project",
      state: "working",
      action: "Codewhale: exec_shell",
      agent: "codewhale",
    });
    manager.dispose();
  });

  it("keeps working state when a tool finishes (still within turn)", () => {
    const manager = new AgentHookStateManager();
    const events: Array<{ projectPath: string; state: string; action: string; agent: string }> = [];
    manager.registerConnector(new CodeWhaleConnector());
    manager.on("stateChange", (event) => events.push(event));

    manager.handleMessage({
      source: "codewhale",
      payload: {
        hook_event: "tool_call_before",
        tool_name: "fetch_url",
        workspace: "/tmp/sharkbay-project",
        session_id: "sess_123",
      },
    });
    manager.handleMessage({
      source: "codewhale",
      payload: {
        hook_event: "tool_call_after",
        tool_name: "fetch_url",
        workspace: "/tmp/sharkbay-project",
        session_id: "sess_123",
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      projectPath: "/tmp/sharkbay-project",
      state: "working",
      agent: "codewhale",
    });
    manager.dispose();
  });

  it.each(["task_shell_start", "write_file"])("maps CodeWhale approval tool %s to attention", (toolName) => {
    const manager = new AgentHookStateManager();
    const events: Array<{ projectPath: string; state: string; action: string; agent: string }> = [];
    manager.registerConnector(new CodeWhaleConnector());
    manager.on("stateChange", (event) => events.push(event));

    manager.handleMessage({
      source: "codewhale",
      payload: {
        hook_event: "tool_call_before",
        tool_name: toolName,
        workspace: "/tmp/sharkbay-project",
        session_id: "sess_123",
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      projectPath: "/tmp/sharkbay-project",
      state: "attention",
      action: `Codewhale: ${toolName}`,
      agent: "codewhale",
    });
    manager.dispose();
  });

  it("writes hook diagnostics to the workspace sharkbay log", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-hook-log-"));
    const manager = new AgentHookStateManager();
    manager.registerConnector(new CodeWhaleConnector());

    try {
      manager.handleMessage({
        source: "codewhale",
        payload: {
          hook_event: "tool_call_before",
          tool_name: "write_file",
          workspace: root,
          session_id: "sess_123",
          tool_args: "x".repeat(2100),
        },
      });

      const logPath = path.join(root, ".sharkbay", "logs", "hooks.log");
      const lines = (await fs.readFile(logPath, "utf8")).trim().split("\n");
      const record = JSON.parse(lines[0]!) as Record<string, any>;
      expect(record).toMatchObject({
        source: "codewhale",
        state: "attention",
        action: "Codewhale: write_file",
        normalized: {
          agent: "codewhale",
          sessionId: "sess_123",
          event: "attention",
          cwd: root,
        },
      });
      expect(record.payload.tool_args).toContain("[truncated 100 chars]");
    } finally {
      manager.dispose();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not mark a project working just because CodeWhale started", () => {
    const manager = new AgentHookStateManager();
    const events: Array<{ projectPath: string; state: string; action: string; agent: string }> = [];
    manager.registerConnector(new CodeWhaleConnector());
    manager.on("stateChange", (event) => events.push(event));

    manager.handleMessage({
      source: "codewhale",
      payload: {
        hook_event: "session_start",
        workspace: "/tmp/sharkbay-project",
        session_id: "sess_123",
      },
    });

    expect(events[0]).toMatchObject({
      projectPath: "/tmp/sharkbay-project",
      state: "idle",
      action: "",
      agent: "codewhale",
    });
    manager.dispose();
  });

  it("maps CodeWhale error hooks to attention state", () => {
    const manager = new AgentHookStateManager();
    const events: Array<{ projectPath: string; state: string; action: string; agent: string }> = [];
    manager.registerConnector(new CodeWhaleConnector());
    manager.on("stateChange", (event) => events.push(event));

    manager.handleMessage({
      source: "codewhale",
      payload: {
        hook_event: "on_error",
        error: "Invalid approval_policy 'full-auto'",
        workspace: "/tmp/sharkbay-project",
        session_id: "sess_123",
      },
    });

    expect(events[0]).toMatchObject({
      projectPath: "/tmp/sharkbay-project",
      state: "attention",
      action: "Codewhale: Invalid approval_policy 'full-auto'",
      agent: "codewhale",
    });
    manager.dispose();
  });

  it("generates a CodeWhale hook script that uses the active socket-path file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-codewhale-hooks-"));
    const appDataPath = path.join(root, "app-data");
    const socketPathFile = path.join(root, "hook-socket-path");
    const bridge = new HookBridge({ socketPathFile });

    try {
      (bridge as unknown as { deployHookCli(appDataPath: string): void }).deployHookCli(appDataPath);
      const scriptPath = path.join(appDataPath, "bin", "sharkbay-hook-codewhale");
      const script = await fs.readFile(scriptPath, "utf8");

      expect(script).toContain(`const SOCKET_PATH_FILE = ${JSON.stringify(socketPathFile)};`);
      expect(script).not.toContain("Application Support");
      expect(script).toContain('assignIfPresent(payload, "workspace", env("DEEPSEEK_WORKSPACE"))');
      expect(script).toContain('assignIfPresent(payload, "cwd", payload.workspace)');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
