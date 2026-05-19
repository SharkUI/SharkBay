import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRuntimeConfigPath } from "../src/main/config.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { SharkBayCoreService } from "../src/core/core-service.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { createGitRepoFixture, makeTempRoot, makeTestRuntime, writeJson } from "./helpers.js";

describe("Node bundled detector", () => {
  it("detects package manager, framework hints, commands, and services", async () => {
    const runtime = await makeTestRuntime("node-detector");
    const root = await makeTempRoot("node-detector-root");
    const repo = await createGitRepoFixture(root, "NodeApp");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [],
      configuredProjects: [repo],
      updatedAt: "2026-05-16",
    });
    await writeJson(path.join(repo, "package.json"), {
      packageManager: "pnpm@9.0.0",
      scripts: {
        dev: "vite --host 127.0.0.1",
        build: "tsc && vite build",
        test: "vitest run",
      },
      dependencies: {
        "@vitejs/plugin-react": "^5.0.0",
        react: "^19.0.0",
        vite: "^6.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
      },
    });
    await fs.writeFile(path.join(repo, "pnpm-lock.yaml"), "");
    await fs.writeFile(path.join(repo, "tsconfig.json"), "{}");

    const core = new SharkBayCoreService([new LocalProvider()]);
    const profile = await core.readProjectProfile(runtime, toLocalProjectUri(repo));

    expect(profile.packageManagers).toEqual([
      expect.objectContaining({ id: "pnpm", lockfile: "pnpm-lock.yaml" }),
    ]);
    expect(profile.frameworks.map((item) => item.id)).toEqual(expect.arrayContaining(["vite", "react"]));
    expect(profile.languages.map((item) => item.id)).toEqual(expect.arrayContaining(["javascript", "typescript"]));
    expect(profile.commands).toMatchObject({
      dev: "vite --host 127.0.0.1",
      build: "tsc && vite build",
      test: "vitest run",
    });
    expect(profile.services).toEqual([
      expect.objectContaining({
        id: "node:dev",
        command: "pnpm dev",
        script: "vite --host 127.0.0.1",
      }),
    ]);
  });
});
