import { describe, expect, it } from "vitest";

import { extractAnswer, extractCodexAnswer, extractCodexProgress, extractKiroAnswer, extractKiroProgress, lastTurnStartIndex } from "../src/main/telegram/transcript.js";

function kiroLine(kind: string, content?: Array<{ kind: string; data: unknown }>): string {
  return JSON.stringify({ version: 1, kind, data: content ? { content } : {} });
}

function codexLine(type: string, payload?: Record<string, unknown>): string {
  return JSON.stringify({ type, payload });
}

describe("extractKiroAnswer", () => {
  it("returns only the closing summary after the last tool", () => {
    const lines = [
      kiroLine("Prompt"),
      kiroLine("AssistantMessage", [
        { kind: "thinking", data: { text: "internal reasoning" } },
        { kind: "text", data: "First I will read the file." },
        { kind: "toolUse", data: { name: "read" } },
      ]),
      kiroLine("ToolResults"),
      kiroLine("AssistantMessage", [{ kind: "text", data: "Done — fixed the bug." }]),
    ];
    expect(extractKiroAnswer(lines)).toBe("Done — fixed the bug.");
  });

  it("keeps all text for a pure-text turn (no tools)", () => {
    const lines = [
      kiroLine("AssistantMessage", [{ kind: "text", data: "part one" }]),
      kiroLine("AssistantMessage", [{ kind: "text", data: "part two" }]),
    ];
    expect(extractKiroAnswer(lines)).toBe("part one\n\npart two");
  });

  it("falls back to last text when the turn ends on a tool", () => {
    const lines = [
      kiroLine("AssistantMessage", [{ kind: "text", data: "summary here" }, { kind: "toolUse", data: { name: "shell" } }]),
    ];
    expect(extractKiroAnswer(lines)).toBe("summary here");
  });

  it("ignores empty text blocks and malformed lines", () => {
    const lines = [
      "not json",
      kiroLine("AssistantMessage", [{ kind: "text", data: "" }]),
      kiroLine("AssistantMessage", [{ kind: "text", data: "real answer" }]),
    ];
    expect(extractKiroAnswer(lines)).toBe("real answer");
  });

  it("returns empty string when there is no assistant text", () => {
    expect(extractKiroAnswer([kiroLine("ToolResults"), kiroLine("Prompt")])).toBe("");
  });
});

describe("extractAnswer", () => {
  it("uses the kiro parser for kiro", () => {
    expect(extractAnswer("kiro", [JSON.stringify({ kind: "AssistantMessage", data: { content: [{ kind: "text", data: "hi" }] } })])).toBe("hi");
  });

  it("uses the codex parser for codex", () => {
    expect(extractAnswer("codex", [codexLine("event_msg", { type: "task_complete", last_agent_message: "done" })])).toBe("done");
  });

  it("returns null for unsupported agents (fallback to PTY)", () => {
    expect(extractAnswer("qwen", ["whatever"])).toBeNull();
  });

  it("returns null when kiro transcript has no text", () => {
    expect(extractAnswer("kiro", [JSON.stringify({ kind: "ToolResults", data: {} })])).toBeNull();
  });
});

describe("extractCodexAnswer", () => {
  it("prefers the completed turn answer", () => {
    const lines = [
      codexLine("event_msg", { type: "agent_message", message: "Checking files." }),
      codexLine("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "intermediate" }] }),
      codexLine("event_msg", { type: "task_complete", last_agent_message: "Final clean answer." }),
    ];
    expect(extractCodexAnswer(lines)).toBe("Final clean answer.");
  });

  it("falls back to assistant text after the last tool", () => {
    const lines = [
      codexLine("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "I will inspect it." }] }),
      codexLine("response_item", { type: "function_call", name: "exec_command" }),
      codexLine("response_item", { type: "function_call_output" }),
      codexLine("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "Done." }] }),
    ];
    expect(extractCodexAnswer(lines)).toBe("Done.");
  });

  it("keeps all assistant text for a pure-text turn", () => {
    const lines = [
      codexLine("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "part one" }] }),
      codexLine("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "part two" }] }),
    ];
    expect(extractCodexAnswer(lines)).toBe("part one\n\npart two");
  });
});

describe("extractKiroProgress", () => {
  it("renders text and tool activity, skipping thinking", () => {
    const lines = [
      kiroLine("AssistantMessage", [
        { kind: "thinking", data: { text: "secret" } },
        { kind: "text", data: "Looking at the file." },
        { kind: "toolUse", data: { name: "shell", input: { __tool_use_purpose: "Run tests", command: "npm test" } } },
        { kind: "toolUse", data: { name: "fsRead", input: {} } },
      ]),
    ];
    expect(extractKiroProgress(lines)).toBe("Looking at the file.\n🔧 shell · Run tests\n🔧 fsRead");
  });
});

describe("extractCodexProgress", () => {
  it("renders clean status messages and tool activity", () => {
    const lines = [
      codexLine("event_msg", { type: "agent_message", message: "Reading the code." }),
      codexLine("response_item", { type: "function_call", name: "exec_command" }),
      codexLine("response_item", { type: "custom_tool_call", name: "apply_patch" }),
      codexLine("response_item", { type: "web_search_call" }),
    ];
    expect(extractCodexProgress(lines)).toBe("Reading the code.\n🔧 exec_command\n🔧 apply_patch\n🔎 web search");
  });
});


describe("lastTurnStartIndex", () => {
  it("finds the last Prompt index for kiro", () => {
    const lines = [
      kiroLine("Prompt"),
      kiroLine("AssistantMessage", [{ kind: "text", data: "a" }]),
      kiroLine("Prompt"),
      kiroLine("AssistantMessage", [{ kind: "text", data: "b" }]),
    ];
    expect(lastTurnStartIndex("kiro", lines)).toBe(2);
    // Slicing from there yields only the latest turn's answer.
    expect(extractKiroAnswer(lines.slice(2))).toBe("b");
  });

  it("returns 0 when no prompt or unsupported agent", () => {
    expect(lastTurnStartIndex("kiro", [kiroLine("ToolResults")])).toBe(0);
    expect(lastTurnStartIndex("qwen", ["x"])).toBe(0);
  });

  it("finds the last Codex user message index", () => {
    const lines = [
      codexLine("event_msg", { type: "user_message", message: "first" }),
      codexLine("event_msg", { type: "task_complete", last_agent_message: "a" }),
      codexLine("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "context" }] }),
      codexLine("event_msg", { type: "user_message", message: "second" }),
      codexLine("event_msg", { type: "task_complete", last_agent_message: "b" }),
    ];
    expect(lastTurnStartIndex("codex", lines)).toBe(3);
    expect(extractCodexAnswer(lines.slice(3))).toBe("b");
  });
});
