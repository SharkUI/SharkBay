import { describe, expect, it } from "vitest";

import { extractAnswer, extractKiroAnswer, extractKiroProgress, lastTurnStartIndex } from "../src/main/telegram/transcript.js";

function kiroLine(kind: string, content?: Array<{ kind: string; data: unknown }>): string {
  return JSON.stringify({ version: 1, kind, data: content ? { content } : {} });
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

  it("returns null for unsupported agents (fallback to PTY)", () => {
    expect(extractAnswer("codex", ["whatever"])).toBeNull();
  });

  it("returns null when kiro transcript has no text", () => {
    expect(extractAnswer("kiro", [JSON.stringify({ kind: "ToolResults", data: {} })])).toBeNull();
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
    expect(lastTurnStartIndex("codex", ["x"])).toBe(0);
  });
});
