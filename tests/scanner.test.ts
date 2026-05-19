import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createGitRepoFixture, makeTempRoot, makeTestRuntime, writeJson } from "./helpers.js";
import { getRuntimeConfigPath } from "../src/main/config.js";
import { scanConfiguredRoots, scanProjects } from "../src/main/scanner.js";

const execFileAsync = promisify(execFile);

describe("scanner", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

  it("finds git repositories in configured roots", async () => {
    const root = await makeTempRoot("scanner-basic");
    await createGitRepoFixture(root, "ProjectA");
    await createGitRepoFixture(root, "ProjectB");

    const result = await scanConfiguredRoots([root]);

    expect(result.candidates.length).toBe(2);
    expect(result.candidates.map((c) => c.name).sort()).toEqual(["ProjectA", "ProjectB"]);
  });

  it("ignores directories without .git", async () => {
    const root = await makeTempRoot("scanner-no-git");
    await fs.mkdir(path.join(root, "NotARepo"), { recursive: true });
    await createGitRepoFixture(root, "RealRepo");

    const result = await scanConfiguredRoots([root]);

    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]?.name).toBe("RealRepo");
  });

  it("reports unavailable roots", async () => {
    const result = await scanConfiguredRoots(["/nonexistent/path/xyz"]);

    expect(result.roots[0]?.available).toBe(false);
    expect(result.candidates.length).toBe(0);
  });

  it("discovers project dev services from package.json scripts", async () => {
    const root = await makeTempRoot("scanner-services");
    const repo = await createGitRepoFixture(root, "ServiceApp");
    await writeJson(path.join(repo, "package.json"), {
      name: "service-app",
      scripts: { dev: "vite", start: "node server.js" },
    });

    const result = await scanConfiguredRoots([root]);
    const candidate = result.candidates.find((c) => c.name === "ServiceApp");

    expect(candidate?.services.length).toBeGreaterThan(0);
  });

  it("adds git dirty worktree state to project rows", async () => {
    const root = await makeTempRoot("scanner-dirty");
    const repo = path.join(root, "DirtyRepo");
    await fs.mkdir(repo, { recursive: true });
    await execFileAsync("git", ["init"], { cwd: repo });
    await writeJson(path.join(repo, "package.json"), { name: "dirty-repo", version: "1.0.0" });

    const result = await scanConfiguredRoots([root]);
    const candidate = result.candidates.find((c) => c.name === "DirtyRepo");

    expect(candidate?.dirtyWorktree).toBe(true);
  });

  it("keeps discovering repositories nested below four directory levels", async () => {
    const root = await makeTempRoot("scanner-depth");
    const container = path.join(root, "a", "b", "c", "d");
    await createGitRepoFixture(container, "DeepRepo");

    const result = await scanConfiguredRoots([root]);

    expect(result.candidates.map((c) => c.name)).toContain("DeepRepo");
  });

  it("adds package-declared local icon candidates to project rows", async () => {
    const root = await makeTempRoot("scanner-icons");
    const repo = await createGitRepoFixture(root, "IconRepo");
    await writeJson(path.join(repo, "package.json"), {
      build: { mac: { icon: "resources/custom-icon.png" } },
    });
    await fs.mkdir(path.join(repo, "resources"), { recursive: true });
    await fs.writeFile(path.join(repo, "resources", "custom-icon.png"), png);

    const result = await scanConfiguredRoots([root]);
    const candidate = result.candidates.find((c) => c.name === "IconRepo");

    expect(candidate?.iconSources[0]).toEqual(expect.objectContaining({ kind: "local", label: "custom-icon.png" }));
    expect(candidate?.iconSources[0]?.url).toMatch(/^data:image\/png;base64,/);
  });

  it("includes manually configured remote projects", async () => {
    const runtime = await makeTestRuntime("scanner-remote-projects");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [],
      configuredRemoteProjects: ["ssh://gpu-01/home/app/model-worker"],
      configuredRemoteMachines: [{
        id: "gpu-01",
        label: "GPU Worker",
        host: "gpu-01",
        port: 22,
        authMode: "system-ssh-config",
        sshConfigHost: "gpu-01",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      }],
      appearanceTheme: "day",
      updatedAt: "2026-05-15",
    });

    const result = await scanProjects(runtime);

    expect(result.candidates).toEqual([
      expect.objectContaining({
        id: "ssh://gpu-01/home/app/model-worker",
        name: "model-worker",
        providerId: "gpu-01",
        providerKind: "ssh",
        displayPath: "GPU Worker:/home/app/model-worker",
      }),
    ]);
  });

  it("scans only individually configured projects in the app project list", async () => {
    const runtime = await makeTestRuntime("scanner-manual-only");
    const root = await makeTempRoot("scanner-manual-only-root");
    const manualRepo = await createGitRepoFixture(root, "ManualRepo");
    await createGitRepoFixture(root, "IgnoredRootRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
      configuredProjects: [manualRepo],
      configuredRemoteProjects: [],
      appearanceTheme: "day",
      updatedAt: "2026-05-19",
    });

    const result = await scanProjects(runtime);

    expect(result.roots).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["ManualRepo"]);
  });
});
