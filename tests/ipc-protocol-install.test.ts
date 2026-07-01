import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { makeTempRoot } from "./helpers.js";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "") },
  BrowserView: vi.fn(),
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  screen: { getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } })) },
  shell: { openExternal: vi.fn() },
  utilityProcess: { fork: vi.fn() },
}));

vi.mock("../src/main/harness.js", async () => {
  const actual = await vi.importActual<typeof import("../src/main/harness.js")>("../src/main/harness.js");
  return {
    ...actual,
    checkRepoPermission: vi.fn(async () => "read"),
    resolveGitHubIdentity: vi.fn(async () => ({
      login: "SharkUI",
      id: 3960864,
      avatarUrl: "https://example.test/avatar.png",
    })),
  };
});

const execFileAsync = promisify(execFile);

describe("protocol install", () => {
  it("falls back to local-only install for read-only GitHub remotes", async () => {
    const { installProtocol } = await import("../electron/ipc.js");
    const root = await makeTempRoot("ipc-protocol-install");
    const repo = path.join(root, "Emby.Plugins.JavScraper");
    await fs.mkdir(repo, { recursive: true });
    await execFileAsync("git", ["init"], { cwd: repo });
    await execFileAsync("git", ["remote", "add", "origin", "https://github.com/upstream/Emby.Plugins.JavScraper.git"], { cwd: repo });

    const status = await installProtocol(repo);

    expect(status).toMatchObject({
      installed: true,
      harnessInstalled: true,
      syncEnabled: false,
      githubLogin: "SharkUI",
      githubUserId: 3960864,
      repo: "upstream/Emby.Plugins.JavScraper",
      permission: "read",
    });
    const protocol = await fs.readFile(path.join(repo, ".sharkbay", "harness", "protocol.md"), "utf8");
    expect(protocol).toContain("- Repo: upstream/Emby.Plugins.JavScraper");
    expect(protocol).toContain("skip team-context searches and continue");
  });
});
