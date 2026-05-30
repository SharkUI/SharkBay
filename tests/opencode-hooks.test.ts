import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OpenCodeConnector } from "../src/main/hooks/connectors/opencode.js";

describe("OpenCode hook connector", () => {
  describe("normalize", () => {
    const connector = new OpenCodeConnector();

    it("maps session.created to session_start", () => {
      const result = connector.normalize({
        event_type: "session.created",
        session_id: "ses_abc123",
        cwd: "/tmp/project",
        timestamp: "2026-05-30T00:00:00Z",
      });
      expect(result).toEqual({
        agent: "opencode",
        sessionId: "ses_abc123",
        event: "session_start",
        timestamp: "2026-05-30T00:00:00Z",
        tool: undefined,
        prompt: undefined,
        cwd: "/tmp/project",
      });
    });

    it("maps session.status.busy to prompt (working)", () => {
      const result = connector.normalize({
        event_type: "session.status.busy",
        session_id: "ses_abc123",
        cwd: "/tmp/project",
        timestamp: "2026-05-30T00:00:01Z",
      });
      expect(result?.event).toBe("prompt");
      expect(result?.agent).toBe("opencode");
    });

    it("maps session.idle to turn_end", () => {
      const result = connector.normalize({
        event_type: "session.idle",
        session_id: "ses_abc123",
        cwd: "/tmp/project",
        timestamp: "2026-05-30T00:00:02Z",
      });
      expect(result?.event).toBe("turn_end");
    });

    it("maps tool running to tool_start", () => {
      const result = connector.normalize({
        event_type: "message.part.updated.tool.running",
        session_id: "ses_abc123",
        cwd: "/tmp/project",
        tool_name: "Bash",
        timestamp: "2026-05-30T00:00:03Z",
      });
      expect(result?.event).toBe("tool_start");
      expect(result?.tool).toEqual({ name: "Bash", input: undefined });
    });

    it("maps tool completed to tool_end", () => {
      const result = connector.normalize({
        event_type: "message.part.updated.tool.completed",
        session_id: "ses_abc123",
        cwd: "/tmp/project",
        tool_name: "Bash",
        timestamp: "2026-05-30T00:00:04Z",
      });
      expect(result?.event).toBe("tool_end");
    });

    it("maps tool error to tool_end", () => {
      const result = connector.normalize({
        event_type: "message.part.updated.tool.error",
        session_id: "ses_abc123",
        cwd: "/tmp/project",
        tool_name: "Edit",
        timestamp: "2026-05-30T00:00:05Z",
      });
      expect(result?.event).toBe("tool_end");
    });

    it("maps permission.updated to attention", () => {
      const result = connector.normalize({
        event_type: "permission.updated",
        session_id: "ses_abc123",
        cwd: "/tmp/project",
        prompt: "Allow bash command: rm -rf /tmp/test",
        timestamp: "2026-05-30T00:00:06Z",
      });
      expect(result?.event).toBe("attention");
      expect(result?.prompt).toBe("Allow bash command: rm -rf /tmp/test");
    });

    it("returns null for unknown event types", () => {
      expect(connector.normalize({ event_type: "file.edited", cwd: "/tmp" })).toBeNull();
    });

    it("returns null for non-object input", () => {
      expect(connector.normalize(null)).toBeNull();
      expect(connector.normalize("string")).toBeNull();
      expect(connector.normalize(42)).toBeNull();
    });

    it("returns null when event_type is missing", () => {
      expect(connector.normalize({ session_id: "ses_abc", cwd: "/tmp" })).toBeNull();
    });
  });

  describe("install/uninstall", () => {
    it("installs plugin and registers in config", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-opencode-hooks-"));
      const configDir = path.join(root, ".config", "opencode");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, "opencode.jsonc"), '{\n  "$schema": "https://opencode.ai/config.json"\n}\n');

      const connector = new OpenCodeConnector();
      (connector as unknown as { configDir: string }).configDir = configDir;
      (connector as unknown as { configPath: string }).configPath = path.join(configDir, "opencode.jsonc");
      (connector as unknown as { pluginDir: string }).pluginDir = path.join(configDir, "plugins", "sharkbay");
      (connector as unknown as { pluginEntry: string }).pluginEntry = path.join(configDir, "plugins", "sharkbay", "index.js");

      try {
        await connector.install("/tmp/appdata/bin/sharkbay-hook");

        const pluginJs = await fs.readFile(path.join(configDir, "plugins", "sharkbay", "index.js"), "utf8");
        expect(pluginJs).toContain("SharkBay");
        expect(pluginJs).toContain("session.status");
        expect(pluginJs).toContain("permission.updated");
        expect(pluginJs).toContain("export default async function");
        expect(pluginJs).toContain("/tmp/appdata/hook-socket-path");

        const config = await fs.readFile(path.join(configDir, "opencode.jsonc"), "utf8");
        const parsed = JSON.parse(config);
        expect(parsed.plugin).toContain("./plugins/sharkbay");

        const status = await connector.status();
        expect(status).toBe("installed");

        await connector.uninstall();
        const configAfter = await fs.readFile(path.join(configDir, "opencode.jsonc"), "utf8");
        const parsedAfter = JSON.parse(configAfter);
        expect(parsedAfter.plugin).toBeUndefined();

        const statusAfter = await connector.status();
        expect(statusAfter).toBe("not_installed");
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  });
});
