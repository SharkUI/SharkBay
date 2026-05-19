import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRuntimeConfigPath } from "../src/main/config.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { SharkBayCoreService } from "../src/core/core-service.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { createGitRepoFixture, makeTempRoot, makeTestRuntime, writeJson } from "./helpers.js";

describe("Python bundled detector", () => {
  it("identifies a uv project and surfaces lock/manifest", async () => {
    const runtime = await makeTestRuntime("python-detector");
    const root = await makeTempRoot("python-detector-root");
    const repo = await createGitRepoFixture(root, "PyRepo");
    await writeJson(getRuntimeConfigPath(runtime), { schemaVersion: 1, configuredRoots: [], configuredProjects: [repo], updatedAt: "2026-05-16" });
    await fs.writeFile(path.join(repo, "pyproject.toml"), "[project]\nname = \"pyrepo\"\ndependencies = [\"fastapi\"]\n");
    await fs.writeFile(path.join(repo, "uv.lock"), "version = 1\n");

    const core = new SharkBayCoreService([new LocalProvider()]);
    const profile = await core.readProjectProfile(runtime, toLocalProjectUri(repo));

    expect(profile.languages.some((language) => language.id === "python")).toBe(true);
    expect(profile.packageManagers.some((manager) => manager.id === "uv")).toBe(true);
    expect(profile.frameworks.some((framework) => framework.id === "fastapi")).toBe(true);
    expect(profile.structure.importantFiles).toEqual(expect.arrayContaining(["pyproject.toml", "uv.lock"]));
  });
});
