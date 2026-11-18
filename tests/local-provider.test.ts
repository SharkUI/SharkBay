import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeConfigPath } from "../src/main/config.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import * as processCommand from "../src/main/process-command.js";
import * as commandPath from "../src/main/command-path.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { createGitRepoFixture, makeTempRoot as createRoot, makeTestRuntime as createRuntime, writeJson } from "./helpers.js";

describe("LocalProvider", () => {
  it("exposes local files and project profile through the final provider interface", async () => {
    const runtime = await makeTestRuntime("local-provider");
    const root = await makeTempRoot("local-provider-root");
    const repo = await createGitRepoFixture(root, "ProviderRepo");
    await fs.writeFile(path.join(repo, "README.md"), "# ProviderRepo\n");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [repo],
      updatedAt: "2026-05-16",
    });

    const provider = new LocalProvider();
    const projectUri = toLocalProjectUri(repo);
    const files = await provider.listProjectFiles(runtime, { projectUri });
    const content = await provider.readProjectFile(runtime, { projectUri, relativePath: "README.md" });
    const profile = await provider.readProjectProfile(runtime, projectUri);

    expect(files.ok && files.files.some((file) => file.path === "README.md")).toBe(true);
    expect(content).toEqual({ ok: true, content: "# ProviderRepo\n", size: 15, relativePath: "README.md" });
    expect(profile).toMatchObject({
      projectUri,
      targetId: "local",
      targetKind: "local",
      name: "ProviderRepo",
      vcs: { type: "none" },
    });
  });

  it("uses the shared command path resolver for machine probe lookup", async () => {
    const runtime = await makeTestRuntime("local-provider-which");
    const provider = new LocalProvider(undefined, async (command) => command === "opencode" ? "/Users/test/.opencode/bin/opencode" : null);

    const ctx = await provider.createMachineProbeContext(runtime, "local");

    await expect(ctx.which("opencode")).resolves.toBe("/Users/test/.opencode/bin/opencode");
  });
});

afterEach(() => { vi.restoreAllMocks(); });
it("propagates probe cancellation to the process runner without swallowing it", async () => {
  const controller = new AbortController();
  vi.spyOn(commandPath, "resolveCommandSearchPaths").mockResolvedValue(["/fixture/bin"]);
  let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
  const run = vi.spyOn(processCommand, "runProcessCommand").mockImplementation(async (_command, _args, options) => {
    entered();
    return new Promise((_resolve, reject) => { options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true }); });
  });
  const runtime = { userDataPath: "/unused-test-profile" };
  const provider = new LocalProvider(undefined, async () => null);
  const ctx = await provider.createMachineProbeContext(runtime, "local");
  const pending = ctx.run("fixture-only", { signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow("stop requested");
  await started; controller.abort(new Error("stop requested")); await rejected;
  expect(run).toHaveBeenCalledWith("/bin/sh", ["-lc", "fixture-only"], expect.objectContaining({ signal: controller.signal }));
});

const cleanupRoots: string[] = [];
async function makeTestRuntime(prefix: string) { const runtime = await createRuntime(prefix); cleanupRoots.push(path.dirname(runtime.userDataPath)); return runtime; }
async function makeTempRoot(prefix: string) { const root = await createRoot(prefix); cleanupRoots.push(root); return root; }
afterEach(async () => { await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
