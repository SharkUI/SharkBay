import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionPromptStore } from "../src/main/hooks/prompt-store.js";

describe("SessionPromptStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sharkbay-prompts-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("records and returns the latest prompt per session id", () => {
    const store = new SessionPromptStore(dir);
    store.record("sess-1", "first prompt");
    store.record("sess-1", "second prompt");
    store.record("sess-2", "other session");

    expect(store.get("sess-1")).toBe("second prompt");
    expect(store.get("sess-2")).toBe("other session");
    expect(store.get("missing")).toBeNull();
    expect(store.get(null)).toBeNull();
  });

  it("normalizes whitespace and ignores empty prompts", () => {
    const store = new SessionPromptStore(dir);
    store.record("s", "  hello\n  world  ");
    store.record("s2", "   ");
    expect(store.get("s")).toBe("hello world");
    expect(store.get("s2")).toBeNull();
  });

  it("persists prompts across instances (survives restart)", async () => {
    const store = new SessionPromptStore(dir);
    store.record("restored-session", "the prompt before restart");
    // Allow the debounced write to flush.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const reloaded = new SessionPromptStore(dir);
    expect(reloaded.get("restored-session")).toBe("the prompt before restart");
  });

  it("truncates very long prompts", () => {
    const store = new SessionPromptStore(dir);
    store.record("s", "x".repeat(500));
    expect(store.get("s")?.length).toBe(200);
  });
});
