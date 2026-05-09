import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGitRepoFixture, makeTempRoot, writeJson } from "./helpers.js";
import { scanConfiguredRoots } from "../src/main/scanner.js";

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
});
