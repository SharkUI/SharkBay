import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRuntimeConfigPath } from "../src/main/config.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { createGitRepoFixture, makeTempRoot, makeTestRuntime, writeJson } from "./helpers.js";

describe("LocalProvider", () => {
  it("exposes local files and project profile through the final provider interface", async () => {
    const runtime = await makeTestRuntime("local-provider");
    const root = await makeTempRoot("local-provider-root");
    const repo = await createGitRepoFixture(root, "ProviderRepo");
    await fs.writeFile(path.join(repo, "README.md"), "# ProviderRepo\n");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
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
});
