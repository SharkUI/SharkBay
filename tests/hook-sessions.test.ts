import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

let fakeHome = "";
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return { ...actual, homedir: () => fakeHome || actual.homedir() };
});

import { parseHookSessions } from "../src/main/hooks/sessions.js";

const tmp = fs.mkdtempSync(path.join(tmpdir(), "sb-sessions-"));

function writeLog(repo: string, sid: string): void {
  const logPath = path.join(repo, ".sharkbay", "logs", "hooks.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", source: "kiro", payload: { session_id: sid }, normalized: { agent: "kiro", sessionId: sid, event: "prompt" } }));
}

describe("parseHookSessions Kiro model backfill", () => {
  it("backfills model from ~/.kiro/sessions/cli when hook payload has none", () => {
    const repo = fs.mkdtempSync(path.join(tmp, "repo-"));
    fakeHome = fs.mkdtempSync(path.join(tmp, "home-"));

    const sid = "abc-123";
    writeLog(repo, sid);
    const cliDir = path.join(fakeHome, ".kiro", "sessions", "cli");
    fs.mkdirSync(cliDir, { recursive: true });
    fs.writeFileSync(path.join(cliDir, `${sid}.json`), JSON.stringify({ session_state: { rts_model_state: { model_info: { model_id: "claude-opus-4.8" } } } }));

    expect(parseHookSessions(repo)[0]!.model).toBe("claude-opus-4.8");
  });

  it("leaves model null when no Kiro session file exists", () => {
    const repo = fs.mkdtempSync(path.join(tmp, "repo-"));
    fakeHome = fs.mkdtempSync(path.join(tmp, "home-"));
    writeLog(repo, "missing");

    expect(parseHookSessions(repo)[0]!.model).toBeNull();
  });
});
