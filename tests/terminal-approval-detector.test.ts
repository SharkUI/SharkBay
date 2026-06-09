import { describe, expect, it, vi } from "vitest";
import { TerminalApprovalDetector } from "../src/main/hooks/terminal-approval-detector.js";

describe("TerminalApprovalDetector", () => {
  it("fires when approval pattern appears in terminal output", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "some output\n");
    expect(callback).not.toHaveBeenCalled();

    detector.feed("term-1", " shell requires approval\n ESC to close | Enter to see more options\n");
    expect(callback).toHaveBeenCalledWith({
      agentId: "kiro",
      terminalSessionId: "term-1",
      cwd: "/tmp/project",
    });
  });

  it("does not fire twice for the same approval prompt", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "ESC to close | Enter\n");
    detector.feed("term-1", " more text but pattern still in window");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("re-fires after pattern leaves the sliding window", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "ESC to close");
    expect(callback).toHaveBeenCalledTimes(1);

    // Push pattern out of the 256-char window
    detector.feed("term-1", "x".repeat(300));
    // Pattern gone, fired resets
    detector.feed("term-1", "ESC to close");
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("ignores untracked sessions", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);

    detector.feed("term-unknown", "ESC to close");
    expect(callback).not.toHaveBeenCalled();
  });

  it("stops detecting after untrack", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");
    detector.untrack("term-1");

    detector.feed("term-1", "ESC to close");
    expect(callback).not.toHaveBeenCalled();
  });

  it("handles pattern split across chunks", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "prompt text ESC to");
    expect(callback).not.toHaveBeenCalled();

    detector.feed("term-1", " close | Enter");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("detects pattern through ANSI escape sequences", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    // Simulate "ESC" being bold/highlighted with ANSI codes
    detector.feed("term-1", " \x1b[1mESC\x1b[0m to close | Enter to see more options\n");
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
