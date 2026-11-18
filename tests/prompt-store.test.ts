import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionPromptStore } from "../src/main/hooks/prompt-store.js";

describe("SessionPromptStore", () => {
  let dir: string;
  const stores: SessionPromptStore[] = [];
  const openStore = () => { const store = new SessionPromptStore(dir); stores.push(store); return store; };

  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sharkbay-prompts-"));
  });

  afterEach(() => {
    for (const store of stores.splice(0)) store.flushSync();
    fs.rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("records and returns the latest prompt via get()", () => {
    const store = openStore();
    store.record("sess-1", "first prompt");
    store.record("sess-1", "second prompt");
    store.record("sess-2", "other session");

    expect(store.get("sess-1")).toBe("second prompt");
    expect(store.get("sess-2")).toBe("other session");
    expect(store.get("missing")).toBeNull();
    expect(store.get(null)).toBeNull();
  });

  it("returns full history via getHistory()", () => {
    const store = openStore();
    store.record("sess-1", "first");
    store.record("sess-1", "second");
    store.record("sess-1", "third");

    expect(store.getHistory("sess-1")).toEqual(["first", "second", "third"]);
    expect(store.getHistory("missing")).toEqual([]);
    expect(store.getHistory(null)).toEqual([]);
  });

  it("normalizes whitespace and ignores empty prompts", () => {
    const store = openStore();
    store.record("s", "  hello\n  world  ");
    store.record("s2", "   ");
    expect(store.get("s")).toBe("hello world");
    expect(store.get("s2")).toBeNull();
  });

  it("persists history across instances (survives restart)", async () => {
    const store = openStore();
    store.record("restored-session", "prompt one");
    store.record("restored-session", "prompt two");
    vi.advanceTimersByTime(500);

    const reloaded = openStore();
    expect(reloaded.getHistory("restored-session")).toEqual(["prompt one", "prompt two"]);
    expect(reloaded.get("restored-session")).toBe("prompt two");
  });

  it("migrates old single-prompt format", async () => {
    const oldData = { "old-session": { text: "legacy prompt", updatedAt: 1000 } };
    fs.writeFileSync(path.join(dir, "session-prompts.json"), JSON.stringify(oldData));

    const store = openStore();
    expect(store.getHistory("old-session")).toEqual(["legacy prompt"]);
    expect(store.get("old-session")).toBe("legacy prompt");
  });

  it("does not recreate a cleaned fixture after pending writes are flushed", () => {
    const store = openStore(); store.record("session", "prompt"); store.flushSync();
    fs.rmSync(dir, { recursive: true, force: true });
    vi.advanceTimersByTime(1000); expect(fs.existsSync(dir)).toBe(false);
  });

  it("truncates very long prompts", () => {
    const store = openStore();
    store.record("s", "x".repeat(20000));
    expect(store.get("s")?.length).toBe(10000);
  });
});
