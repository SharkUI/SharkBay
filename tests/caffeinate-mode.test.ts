import { describe, expect, it } from "vitest";
import { isCaffeinateActive, normalizeCaffeinateMode } from "../src/shared/caffeinate.js";

describe("caffeinate modes", () => {
  it.each([
    ["off", false, false], ["off", true, false],
    ["on", false, true], ["on", true, true],
    ["auto", false, false], ["auto", true, true],
  ] as const)("%s with working=%s produces active=%s", (mode, working, active) => {
    expect(isCaffeinateActive(mode, working)).toBe(active);
  });

  it("defaults to auto and keeps an explicit mode over the legacy setting", () => {
    expect(normalizeCaffeinateMode(undefined)).toBe("auto");
    expect(normalizeCaffeinateMode("invalid")).toBe("auto");
    expect(normalizeCaffeinateMode("on", false)).toBe("on");
    expect(normalizeCaffeinateMode("auto", false)).toBe("auto");
  });
});
