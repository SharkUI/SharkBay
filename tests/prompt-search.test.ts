import { describe, expect, it } from "vitest";
import { promptSearchKeys } from "../src/renderer/prompt-search.js";

describe("promptSearchKeys", () => {
  it("returns an empty list for blank prompts", () => {
    expect(promptSearchKeys("", 80)).toEqual([]);
    expect(promptSearchKeys("   \n  \n", 80)).toEqual([]);
  });

  it("uses the whole first line when it is short", () => {
    expect(promptSearchKeys("fix the bug", 80)).toEqual(["fix the bug"]);
  });

  it("takes the first non-empty line and trims it", () => {
    expect(promptSearchKeys("  \n  hello world  \nmore", 80)).toEqual(["hello world"]);
  });

  it("caps the primary key so it fits within one row (width - margin), and adds shorter fallbacks", () => {
    const long = "a".repeat(200);
    const keys = promptSearchKeys(long, 100);
    // primary = min(80, max(16, 100-12)) = 80
    expect(keys[0]).toBe("a".repeat(80));
    expect(keys).toContain("a".repeat(32));
    expect(keys).toContain("a".repeat(16));
    // every key must fit within the row width
    for (const key of keys) expect(key.length).toBeLessThanOrEqual(100 - 12);
  });

  it("shrinks the primary key on narrow terminals", () => {
    const long = "b".repeat(200);
    // primary = min(80, max(16, 40-12)) = 28
    const keys = promptSearchKeys(long, 40);
    expect(keys[0]).toBe("b".repeat(28));
    expect(keys).toContain("b".repeat(16));
  });

  it("keeps a minimum key width even on very narrow terminals", () => {
    const long = "c".repeat(200);
    // primary = min(80, max(16, 10-12)) = 16
    expect(promptSearchKeys(long, 10)).toEqual(["c".repeat(16)]);
  });

  it("dedupes keys when the line is shorter than a fallback width", () => {
    const keys = promptSearchKeys("x".repeat(20), 200);
    // primary width = 80 but line is 20 -> "xxxxxxxxxxxxxxxxxxxx"; 32-slice == same; 16-slice distinct
    expect(keys).toEqual(["x".repeat(20), "x".repeat(16)]);
  });

  it("falls back to a finite width (as if cols=80) when cols is not finite", () => {
    const long = "d".repeat(200);
    // usable = 80 -> primary = min(80, max(16, 80-12)) = 68
    expect(promptSearchKeys(long, Number.NaN)[0]).toBe("d".repeat(68));
  });
});
