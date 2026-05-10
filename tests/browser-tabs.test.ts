import { describe, expect, it } from "vitest";
import { normalizeBrowserUrl } from "../src/main/browser-tabs.js";

describe("browser tab URL normalization", () => {
  it("keeps web URLs and falls back to blank for unsafe schemes", () => {
    expect(normalizeBrowserUrl("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173/");
    expect(normalizeBrowserUrl("example.com")).toBe("https://example.com/");
    expect(normalizeBrowserUrl("file:///etc/passwd")).toBe("about:blank");
    expect(normalizeBrowserUrl("")).toBe("about:blank");
  });
});
