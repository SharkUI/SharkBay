import { describe, expect, it } from "vitest";

import { stripAnsi } from "../src/main/telegram/ansi.js";

describe("stripAnsi", () => {
  it("removes CSI color sequences", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m text")).toBe("red text");
  });

  it("removes cursor-movement CSI sequences", () => {
    expect(stripAnsi("a\u001b[2Kb\u001b[1Gc")).toBe("abc");
  });

  it("removes OSC sequences terminated by BEL or ESC backslash", () => {
    expect(stripAnsi("\u001b]0;window title\u0007done")).toBe("done");
    expect(stripAnsi("\u001b]8;;http://x\u001b\\link")).toBe("link");
  });

  it("applies carriage-return overwrite within a line", () => {
    // CR returns to column 0; "abc" overwrites "123" leaving the tail.
    expect(stripAnsi("12345\rabc")).toBe("abc45");
    // Longer replacement fully covers the old content.
    expect(stripAnsi("loading\rfinished")).toBe("finished");
  });

  it("applies backspace editing", () => {
    expect(stripAnsi("abcd\b\bXY")).toBe("abXY");
  });

  it("keeps newlines and trims trailing blank lines", () => {
    expect(stripAnsi("line1\nline2\n\n\n")).toBe("line1\nline2");
  });

  it("expands tabs to spaces and trims trailing whitespace", () => {
    expect(stripAnsi("a\tb   ")).toBe("a b");
  });

  it("returns empty string for pure control noise", () => {
    expect(stripAnsi("\u001b[2J\u001b[H")).toBe("");
  });
});
