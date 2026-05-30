import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodexConnector } from "../src/main/hooks/connectors/claude-family.js";

describe("hook connectors", () => {
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
      expect(config).toContain('type = "command"');
      expect(config).toContain(`command = "'${hookPath}' --source codex"`);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
