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

  it("records and returns the latest prompt via get()", () => {
    const store = new SessionPromptStore(dir);
    store.record("sess-1", "first prompt");
    store.record("sess-1", "second prompt");
    store.record("sess-2", "other session");

    expect(store.get("sess-1")).toBe("second prompt");
    expect(store.get("sess-2")).toBe("other session");
    expect(store.get("missing")).toBeNull();
    expect(store.get(null)).toBeNull();
  });

  it("returns full history via getHistory()", () => {
    const store = new SessionPromptStore(dir);
    store.record("sess-1", "first");
    store.record("sess-1", "second");
    store.record("sess-1", "third");

    expect(store.getHistory("sess-1")).toEqual(["first", "second", "third"]);
    expect(store.getHistory("missing")).toEqual([]);
    expect(store.getHistory(null)).toEqual([]);
  });

  it("normalizes whitespace and ignores empty prompts", () => {
    const store = new SessionPromptStore(dir);
    store.record("s", "  hello\n  world  ");
    store.record("s2", "   ");
    expect(store.get("s")).toBe("hello world");
    expect(store.get("s2")).toBeNull();
  });

  it("persists history across instances (survives restart)", async () => {
    const store = new SessionPromptStore(dir);
    store.record("restored-session", "prompt one");
    store.record("restored-session", "prompt two");
    await new Promise((resolve) => setTimeout(resolve, 600));

    const reloaded = new SessionPromptStore(dir);
    expect(reloaded.getHistory("restored-session")).toEqual(["prompt one", "prompt two"]);
    expect(reloaded.get("restored-session")).toBe("prompt two");
  });

  it("migrates old single-prompt format", async () => {
    const oldData = { "old-session": { text: "legacy prompt", updatedAt: 1000 } };
    fs.writeFileSync(path.join(dir, "session-prompts.json"), JSON.stringify(oldData));

    const store = new SessionPromptStore(dir);
    expect(store.getHistory("old-session")).toEqual(["legacy prompt"]);
    expect(store.get("old-session")).toBe("legacy prompt");
  });

  it("truncates very long prompts", () => {
    const store = new SessionPromptStore(dir);
    store.record("s", "x".repeat(20000));
    expect(store.get("s")?.length).toBe(10000);
  });
});
