import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSessionWatcher } from "../src/main/agent-clis.js";
import type { TokenUsageCollector } from "../src/main/token-usage-collector.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
describe("isolated session polling", () => {
  it("handles append, UTF-8 byte positions, partial records and truncation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sharkbay-session-read-")); directories.push(root);
    const projects = path.join(root, "claude"); const project = path.join(projects, "fixture"); await mkdir(project, { recursive: true });
    const file = path.join(project, "session.jsonl");
    const metadata = JSON.stringify({ entrypoint: "cli", cwd: "/fixture/中文", sessionId: "fixture-session" }) + "\r\n";
    await writeFile(file, metadata + '{"type":');
    const processLine = vi.fn();
    const watcher = new AgentSessionWatcher({ codexSessionsRoot: path.join(root, "codex"), claudeProjectsRoot: projects });
    watcher.setUsageCollector({ processLine } as unknown as TokenUsageCollector);
    try {
      await watcher.scan(); expect(processLine).toHaveBeenCalledTimes(1);
      await appendFile(file, '"assistant","message":{"usage":{"input_tokens":1}}}\n');
      await watcher.scan(); expect(processLine).toHaveBeenCalledTimes(2);
      expect(processLine.mock.calls[1]![2]).toBe(Buffer.byteLength(metadata));
      expect(processLine.mock.calls[1]![3]).toMatchObject({ projectPath: "/fixture/中文", sessionId: "fixture-session" });
      await writeFile(file, "{}\n"); await watcher.scan();
      expect(processLine.mock.calls[2]![2]).toBe(0);
      await watcher.scan(); expect(processLine).toHaveBeenCalledTimes(3);
    } finally { await watcher.stop(); }
  });
});
