import { describe, expect, it } from "vitest";
import { normalizeBrowserUrl, scaleBrowserBounds } from "../src/main/browser-tabs.js";

describe("browser tab URL normalization", () => {
  it("keeps web and file URLs and falls back to blank for unsafe schemes", () => {
    expect(normalizeBrowserUrl("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173/");
    expect(normalizeBrowserUrl("example.com")).toBe("https://example.com/");
    expect(normalizeBrowserUrl("file:///Users/test/.sharkbay/site/index.html")).toBe("file:///Users/test/.sharkbay/site/index.html");
    expect(normalizeBrowserUrl("javascript:alert(1)")).toBe("about:blank");
    expect(normalizeBrowserUrl("")).toBe("about:blank");
  });
});

describe("browser tab bounds scaling", () => {
  it("scales renderer CSS bounds to BrowserView bounds", () => {
    expect(scaleBrowserBounds({ x: 200, y: 100, width: 800, height: 600 }, 1.25)).toEqual({
      x: 250,
      y: 125,
      width: 1000,
      height: 750,
    });
  });

  it("falls back to unscaled bounds for invalid zoom factors", () => {
    expect(scaleBrowserBounds({ x: 20, y: 10, width: 0, height: Number.NaN }, 0)).toEqual({
      x: 20,
      y: 10,
      width: 1,
      height: 1,
    });
  });
});
