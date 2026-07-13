import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { getRuntimeConfigPath } from "../src/main/config.js";
import { TerminalManager } from "../src/main/terminal.js";
import { createGitRepoFixture, makeTempRoot, makeTestRuntime, writeJson } from "./helpers.js";

const ptyMock = vi.hoisted(() => {
  const writes: string[] = [];
  const spawn = vi.fn(() => ({
    pid: 4242,
    process: "opencode",
    write: vi.fn((data: string) => writes.push(data)),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
  }));
  return { spawn, writes };
});

vi.mock("../src/main/pty.js", () => ({ spawn: ptyMock.spawn }));

describe("terminal bootstrap submission", () => {
  beforeEach(() => {
    ptyMock.spawn.mockClear();
    ptyMock.writes.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { agentId: "opencode", submitDelayMs: 30 },
    { agentId: "codewhale", submitDelayMs: 250 },
  ] as const)("submits a $agentId review prompt with a separate delayed Enter", async ({ agentId, submitDelayMs }) => {
    const runtime = await makeTestRuntime(`terminal-${agentId}-bootstrap-config`);
    const root = await makeTempRoot(`terminal-${agentId}-bootstrap-root`);
    const repo = await createGitRepoFixture(root, `Terminal${agentId}BootstrapRepo`);
    await fs.mkdir(path.join(repo, ".sharkbay", "harness"), { recursive: true });
    await fs.writeFile(path.join(repo, ".sharkbay", "harness", "protocol.md"), "test protocol\n");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [repo],
      updatedAt: "2026-07-13",
    });

    const manager = new TerminalManager({ inspectIntervalMs: 0 });
    const session = await manager.create(runtime, {
      cwdUri: toLocalProjectUri(repo),
      agentId,
      initialCommand: agentId,
      review: { taskId: "REVIEW-u1-m1", status: "completed" },
    });

    try {
      expect(ptyMock.writes).toEqual([]);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(ptyMock.writes).toHaveLength(1);
      expect(ptyMock.writes[0]).toContain("I'm starting a read-only review session.");

      await vi.advanceTimersByTimeAsync(submitDelayMs - 1);
      expect(ptyMock.writes).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(ptyMock.writes[1]).toBe("\r");
    } finally {
      manager.close({ sessionId: session.id });
    }
  });
});
