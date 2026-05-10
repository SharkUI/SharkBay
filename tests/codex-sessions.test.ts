import { describe, expect, it } from "vitest";
import { claudeStatusFromJsonLine, codexStatusFromJsonLine, type AgentSessionState } from "../src/main/agent-clis.js";

function state(agentId = "codex"): AgentSessionState {
  return { agentId, buffer: "", cwd: null, ignored: false, offset: 0, sessionId: null };
}

describe("Codex session log parsing", () => {
  it("binds codex-tui sessions by cwd and summarizes assistant messages", () => {
    const session = state();

    expect(codexStatusFromJsonLine(JSON.stringify({
      type: "session_meta",
      payload: { id: "session-1", cwd: "/workspace/App", originator: "codex-tui" },
    }), session)).toBeNull();
    expect(session).toMatchObject({ cwd: "/workspace/App", sessionId: "session-1", ignored: false });

    expect(codexStatusFromJsonLine(JSON.stringify({
      type: "event_msg",
      payload: { type: "agent_message", message: "Building project\nand checking output.", phase: "commentary" },
    }), session)).toBe("Building project and checking output.");
  });

  it("ignores non-tui codex logs and system prompt content", () => {
    const session = state();

    expect(codexStatusFromJsonLine(JSON.stringify({
      type: "session_meta",
      payload: { id: "session-2", cwd: "/workspace/App", originator: "codex-exec" },
    }), session)).toBeNull();
    expect(session.ignored).toBe(true);

    expect(codexStatusFromJsonLine(JSON.stringify({
      type: "response_item",
      payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "hidden" }] },
    }), session)).toBeNull();
  });

  it("binds claude cli transcripts by cwd and summarizes assistant content", () => {
    const session = state("claude");

    expect(claudeStatusFromJsonLine(JSON.stringify({
      type: "assistant",
      entrypoint: "cli",
      cwd: "/workspace/App",
      sessionId: "session-3",
      message: { content: [{ type: "tool_use", name: "Bash" }] },
    }), session)).toBe("Claude: Bash");
    expect(session).toMatchObject({ cwd: "/workspace/App", sessionId: "session-3" });

    expect(claudeStatusFromJsonLine(JSON.stringify({
      type: "assistant",
      entrypoint: "cli",
      cwd: "/workspace/App",
      sessionId: "session-3",
      message: { content: [{ type: "text", text: "Checking files\nand tests." }] },
    }), session)).toBe("Checking files and tests.");
  });
});
