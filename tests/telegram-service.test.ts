import { describe, expect, it } from "vitest";

import { buildAgentSubmitSequence } from "../src/main/telegram/service.js";

describe("buildAgentSubmitSequence", () => {
  it("splits Codex text and Enter to avoid TUI paste-mode submit loss", () => {
    expect(buildAgentSubmitSequence("codex", "hello")).toEqual([
      { data: "hello" },
      { data: "\r", delayMs: 30 },
    ]);
  });

  it("splits Claude text and Enter (same TUI paste-mode issue)", () => {
    expect(buildAgentSubmitSequence("claude", "hello")).toEqual([
      { data: "hello" },
      { data: "\r", delayMs: 30 },
    ]);
  });

  it("keeps the existing single write for non-TUI agents", () => {
    expect(buildAgentSubmitSequence("kiro", "hello")).toEqual([{ data: "hello\r" }]);
  });
});
