import { describe, expect, it } from "vitest";
import { codexActivityWithHook, codexHasPendingInput, codexTerminalActivity } from "../src/renderer/codex-input-state.js";

describe("Codex pending input", () => {
  it("detects a collapsed asynchronous question while Codex still reports Working", () => {
    expect(codexHasPendingInput([
      "• Working (15m 49s • esc to interrupt)",
      "• Queued follow-up inputs",
      "  ? 1 question · 14s",
      "    ⇧← to answer",
      "› Ask Codex to do anything",
      "GPT-6.1-Sol high · ~/project",
    ])).toBe(true);
  });

  it("keeps the waiting state while the question is open", () => {
    const lines = [
      "Choose an option.",
      "› 1. First option",
      "  2. Second option",
      "  3. Other",
      "enter submit   ^] skip   ⇧→ main prompt",
      "",
    ];
    expect(codexHasPendingInput(lines)).toBe(true);
    expect(codexTerminalActivity(lines)).toBe("approval");
  });

  it("detects multiple pending questions", () => {
    expect(codexHasPendingInput(["? 2 questions · 1m", "shift+left to answer"])).toBe(true);
  });

  it("recognizes the expanded footer when a narrow terminal wraps it", () => {
    expect(codexHasPendingInput(["enter submit   ^] skip", "⇧→ main prompt"])).toBe(true);
  });

  it("recognizes a pending question above unused terminal rows", () => {
    expect(codexTerminalActivity([
      "enter submit   ^] skip   ⇧→ main prompt",
      ...Array.from({ length: 12 }, () => "    "),
    ])).toBe("approval");
  });

  it("clears the waiting state once the live question footer disappears", () => {
    expect(codexHasPendingInput([
      "• Working (16m • esc to interrupt)",
      "› Ask Codex to do anything",
      "GPT-6.1-Sol high · ~/project",
    ])).toBe(false);
  });

  it("ignores question footers in scrollback and ordinary text mentioning questions", () => {
    expect(codexHasPendingInput([
      "? 1 question · 14s",
      "⇧← to answer",
      ...Array.from({ length: 8 }, () => "Completed tool output"),
      "› Ask Codex to do anything",
    ])).toBe(false);
    expect(codexHasPendingInput(["Explain how ⇧← to answer works", "1 question about hooks"])).toBe(false);
    expect(codexHasPendingInput([])).toBe(false);
  });

  it("does not classify a permission approval as a user question", () => {
    expect(codexHasPendingInput([
      "Would you like to run this command?",
      "1. Yes, proceed",
      "2. No",
      "Press enter to confirm or esc to cancel",
    ])).toBe(false);
  });
});

describe("Codex terminal activity without a resolved hook session", () => {
  it("recognizes the running indicator shown in the reported terminal", () => {
    expect(codexTerminalActivity([
      "• Browsing the web",
      "• Working (24s • esc to interrupt)",
      "› Ask Codex to do anything",
      "GPT-6.1-Sol high · ~/Projects/example",
    ])).toBe("working");
  });

  it("reports an idle prompt as stopped after the turn finishes", () => {
    expect(codexTerminalActivity([
      "The task is complete.",
      "› Ask Codex to do anything",
      "GPT-6.1-Sol high · ~/Projects/example",
    ])).toBe("stopped");
  });

  it.each(["Worked for 49s • 00:26", "Worked for 1m 18s", "Worked for 2h 3m 4s · 12:34"])(
    "lets the latest completion banner supersede older progress: %s", (completed) => {
      const state = codexTerminalActivity([
        "• Working (24s • esc to interrupt)",
        "The task is complete.",
        completed,
        "↳ Recap: completed work",
        "Next: load the new build",
        "› Ask Codex to do anything",
        "GPT-6.1-Sol xhigh · ~/Projects/SharkBay",
      ]);
      expect(state).toBe("stopped");
      expect(codexActivityWithHook(state!, "stopped")).toBe("stopped");
    },
  );

  it("uses a new progress indicator after an earlier turn completed", () => {
    expect(codexTerminalActivity([
      "Worked for 49s • 00:26",
      "› Continue with the next task",
      "• Working (2s • esc to interrupt)",
      "› Ask Codex to do anything",
    ])).toBe("working");
  });

  it("preserves a fresh working hook while the old completion footer is still being redrawn", () => {
    const state = codexTerminalActivity([
      "Worked for 49s • 00:26",
      "› Ask Codex to do anything",
    ]);
    expect(codexActivityWithHook(state!, "working")).toBe("working");
  });

  it("keeps working when queued input pushes the progress indicator above the last eight lines", () => {
    expect(codexTerminalActivity([
      "• Working (24s • esc to interrupt)",
      "• Queued follow-up inputs",
      ...Array.from({ length: 10 }, () => "A queued follow-up line"),
      "› Ask Codex to do anything",
      "GPT-6.1-Sol high · ~/Projects/example",
    ])).toBe("working");
  });

  it("recognizes working above unused rows in the live terminal", () => {
    expect(codexTerminalActivity([
      "• Working (24s • esc to interrupt)",
      "› Ask Codex to do anything",
      ...Array.from({ length: 12 }, () => "    "),
    ])).toBe("working");
  });

  it.each([
    "• Working (1m 18s • esc to interrupt) · 1 background terminal",
    "• Working (1m 18s • esc to interrupt) · 2 background terminals",
    "• Working (1m 18s • esc to interrupt) · 1 background terminal · 2 tasks",
  ])("keeps working when the progress line includes background activity: %s", (progress) => {
    expect(codexTerminalActivity([
      "+111 lines (^t to view transcript)",
      "",
      progress,
      "",
      "› Ask Codex to do anything",
      "GPT-6.1-Sol medium · ~/Projects/SharkBay",
    ])).toBe("working");
  });

  it("reports approval for unanswered questions despite a simultaneous Working indicator", () => {
    expect(codexTerminalActivity([
      "• Working (24s • esc to interrupt) · 1 background terminal",
      "? 1 question · 14s",
      "⇧← to answer",
      "› Ask Codex to do anything",
    ])).toBe("approval");
  });

  it("leaves hook state intact when no live Codex footer is available", () => {
    expect(codexTerminalActivity(["ordinary shell output"])).toBeNull();
    expect(codexTerminalActivity([])).toBeNull();
  });
});

describe("Codex hook and terminal activity", () => {
  it("keeps authoritative working when a partial redraw exposes only the input prompt", () => {
    const screenState = codexTerminalActivity(["› Ask Codex to do anything"]);
    expect(screenState).toBe("stopped");
    expect(codexActivityWithHook(screenState!, "working")).toBe("working");
  });

  it.each([
    ["working", "approval", "approval"],
    ["approval", "working", "approval"],
    ["stopped", "stopped", "stopped"],
    ["working", "stopped", "working"],
    ["stopped", undefined, "stopped"],
  ] as const)("combines terminal %s and hook %s as %s", (terminal, hook, expected) => {
    expect(codexActivityWithHook(terminal, hook)).toBe(expected);
  });
});
