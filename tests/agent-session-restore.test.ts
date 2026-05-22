import { describe, expect, it } from "vitest";
import { buildAgentSessionRestoreCommand, inferAgentSessionRestoreAgent } from "../src/shared/agent-session-restore.js";

describe("agent session restore commands", () => {
  it("infers supported agents from task frontmatter agent names", () => {
    expect(inferAgentSessionRestoreAgent("Codex GPT-5")).toBe("codex");
    expect(inferAgentSessionRestoreAgent("Claude Code Sonnet 4.5")).toBe("claude");
    expect(inferAgentSessionRestoreAgent("Gemini CLI 2.5 Pro")).toBe("gemini");
    expect(inferAgentSessionRestoreAgent("Kiro Claude 4.6")).toBe("kiro");
    expect(inferAgentSessionRestoreAgent("DeepSeek TUI")).toBe("deepseek");
    expect(inferAgentSessionRestoreAgent("Qwen Code")).toBe("qwen");
    expect(inferAgentSessionRestoreAgent("OpenCode")).toBe("opencode");
    expect(inferAgentSessionRestoreAgent("Unknown")).toBeNull();
  });

  it("builds agent-specific restore commands", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    expect(commandFor("Codex GPT-5", sessionId)).toBe("'codex' resume '11111111-1111-4111-8111-111111111111'");
    expect(commandFor("Claude Code", sessionId)).toBe("'claude' --resume '11111111-1111-4111-8111-111111111111'");
    expect(commandFor("Gemini CLI", sessionId)).toBe("'gemini' --resume '11111111-1111-4111-8111-111111111111'");
    expect(commandFor("Qwen Code", sessionId)).toBe("'qwen' --resume '11111111-1111-4111-8111-111111111111'");
    expect(commandFor("Kiro CLI", sessionId)).toBe("'kiro-cli' chat --resume-id '11111111-1111-4111-8111-111111111111'");
    expect(commandFor("DeepSeek TUI", sessionId)).toBe("'deepseek' resume '11111111-1111-4111-8111-111111111111'");
    expect(commandFor("OpenCode", "ses_abc")).toBe("'opencode' --session 'ses_abc'");
  });

  it("prefers detected executable paths when available", () => {
    const restore = buildAgentSessionRestoreCommand({
      agentName: "Claude Code",
      sessionId: "22222222-2222-4222-8222-222222222222",
      availableAgents: [{
        id: "claude",
        label: "Claude Code",
        command: "claude",
        executablePath: "/Users/test/bin/claude",
        shortLabel: "Cl",
      }],
    });

    expect(restore).toMatchObject({
      agentId: "claude",
      command: "'/Users/test/bin/claude' --resume '22222222-2222-4222-8222-222222222222'",
      title: "Restore Claude Code",
    });
  });
});

function commandFor(agentName: string, sessionId: string): string | undefined {
  return buildAgentSessionRestoreCommand({ agentName, sessionId })?.command;
}
