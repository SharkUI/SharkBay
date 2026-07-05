import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTLE_MS, TerminalApprovalDetector } from "../src/main/hooks/terminal-approval-detector.js";

function settle(): void {
  vi.advanceTimersByTime(SETTLE_MS);
}

describe("TerminalApprovalDetector", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("fires when the approval footer is the last line after output settles", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "some output\n");
    settle();
    expect(callback).not.toHaveBeenCalled();

    detector.feed("term-1", " shell requires approval\n ESC to close | Enter to see more options\n");
    settle();
    expect(callback).toHaveBeenCalledWith({
      agentId: "kiro",
      terminalSessionId: "term-1",
      cwd: "/tmp/project",
    });
  });

  it("does not fire until output settles", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "ESC to close | Enter\n");
    expect(callback).not.toHaveBeenCalled();
    settle();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not fire twice for the same approval prompt", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "ESC to close | Enter\n");
    settle();
    expect(callback).toHaveBeenCalledTimes(1);

    // A redraw that keeps the footer as the last line must not re-fire.
    detector.feed("term-1", "ESC to close | Enter\n");
    settle();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("re-fires after the footer leaves and returns as the last line", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "ESC to close | Enter\n");
    settle();
    expect(callback).toHaveBeenCalledTimes(1);

    // Later output pushes the footer off the last line, resetting the latch.
    detector.feed("term-1", "back to work\n");
    settle();
    detector.feed("term-1", "ESC to close | Enter\n");
    settle();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("ignores untracked sessions", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);

    detector.feed("term-unknown", "ESC to close | Enter\n");
    settle();
    expect(callback).not.toHaveBeenCalled();
  });

  it("stops detecting after untrack", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");
    detector.untrack("term-1");

    detector.feed("term-1", "ESC to close | Enter\n");
    settle();
    expect(callback).not.toHaveBeenCalled();
  });

  it("handles the footer split across chunks in one burst", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    detector.feed("term-1", "prompt text ESC to");
    detector.feed("term-1", " close | Enter\n");
    expect(callback).not.toHaveBeenCalled();
    settle();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("detects the footer through ANSI escape sequences", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    // "ESC" bold/highlighted with ANSI codes.
    detector.feed("term-1", " \x1b[1mESC\x1b[0m to close | Enter to see more options\n");
    settle();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not fire on incidental mentions of the phrase", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    // Prose ending without the "| Enter" footer.
    detector.feed("term-1", "the prompt line ends with ESC to close\n");
    // A grep/regex pattern that pipes the phrase into other alternatives.
    detector.feed("term-1", 'rg "ESC to close|injectAttention|synthetic"\n');
    settle();
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not fire when the footer is only in replayed scrollback (regression)", () => {
    const detector = new TerminalApprovalDetector();
    const callback = vi.fn();
    detector.setCallback(callback);
    detector.track("term-1", "kiro", "/tmp/project");

    // Resume/replay: history that happens to contain the footer, then the app
    // redraws the live input prompt as the last line.
    detector.feed("term-1", "earlier discussion mentioned ESC to close | Enter to see more options\n");
    detector.feed("term-1", "\nask a question or describe a task\n");
    settle();
    expect(callback).not.toHaveBeenCalled();
  });
});
