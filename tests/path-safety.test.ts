import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGitRepoFixture, makeTempRoot } from "./helpers.js";
import { isPathInside, resolveRepoPath } from "../src/main/path-safety.js";

describe("path safety", () => {
  it("uses path-segment containment instead of string prefix matching", async () => {
    const root = await makeTempRoot("path-root");
    const repo = await createGitRepoFixture(root, "SharkBay");
    const sibling = `${repo}-other`;
    await fs.mkdir(sibling);

    expect(isPathInside(repo, path.join(repo, "child"))).toBe(true);
    expect(isPathInside(repo, sibling)).toBe(false);
    await expect(resolveRepoPath(sibling, [], [repo])).rejects.toThrow(/outside configured projects/);
  });

  it("rejects traversal outside configured projects", async () => {
    const root = await makeTempRoot("path-traversal");
    const repo = await createGitRepoFixture(root, "Repo");
    const outside = await makeTempRoot("outside");

    await expect(resolveRepoPath(path.join(repo, "..", "..", path.basename(outside)), [], [repo])).rejects.toThrow();
  });
});
