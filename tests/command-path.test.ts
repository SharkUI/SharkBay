import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("node:child_process", async () => { const { promisify } = await import("node:util"); return { execFile: Object.assign(vi.fn(), { [promisify.custom]: mocks.exec }) }; });
import { resolveCommandSearchPaths } from "../src/main/command-path.js";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("retains every fish PATH directory and ignores earlier startup output", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-fish-path-"));
  vi.stubEnv("SHELL", "/fixture/fish");
  mocks.exec.mockImplementation(async (_shell: string, args: string[]) => ({ stdout: args[1] === "string join : $PATH" ? "startup message\n/fixture/first:/fixture/last\n" : "/fixture/first\n/fixture/last\n" }));
  try { expect(await resolveCommandSearchPaths(root, [])).toEqual(["/fixture/first", "/fixture/last"]); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
});
