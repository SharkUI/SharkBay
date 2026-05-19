import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isEditableProjectFile, listProjectFiles } from "../src/main/project-files.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { makeTempRoot, writeText } from "./helpers.js";

describe("project file listing", () => {
  it("returns a sorted editable project file tree inside configured projects", async () => {
    const root = await makeTempRoot("project-files");
    const repo = path.join(root, "Fixture");
    await writeText(path.join(repo, ".env"), "SECRET=test\n");
    await writeText(path.join(repo, "README.md"), "# Fixture\n");
    await writeText(path.join(repo, "src", "App.tsx"), "export function App() { return null; }\n");
    await writeText(path.join(repo, "src", "logo.png"), "not really an image\n");
    await writeText(path.join(repo, "node_modules", "ignored", "index.ts"), "ignored\n");
    await writeText(path.join(repo, ".git", "config"), "ignored\n");
    await writeText(path.join(repo, "dist", "bundle.js"), "compiled\n");
    await writeText(path.join(root, "outside", "secret.md"), "secret\n");
    await fs.symlink(path.join(root, "outside"), path.join(repo, "linked-outside"));
    await fs.symlink(path.join(root, "outside", "secret.md"), path.join(repo, "linked-secret.md"));

    const result = await listProjectFiles({ userDataPath: root }, { projectUri: toLocalProjectUri(repo), configuredProjects: [repo] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.files.map((item) => item.path)).toEqual([
      ".git",
      "dist",
      "linked-outside",
      "node_modules",
      "src",
      ".env",
      "linked-secret.md",
      "README.md",
    ]);
    expect(result.files.find((item) => item.path === ".env")?.editable).toBe(true);
    expect(result.files.find((item) => item.path === "linked-secret.md")?.editable).toBe(false);
    expect(result.files.find((item) => item.path === "linked-outside")?.children).toEqual([]);
    expect(result.files.find((item) => item.path === ".git")?.children).toBeUndefined();
    expect(result.files.find((item) => item.path === "node_modules")?.children).toBeUndefined();
    expect(result.files.find((item) => item.path === "dist")?.children).toBeUndefined();
    const src = result.files.find((item) => item.path === "src");
    expect(src?.children).toBeUndefined();

    const srcResult = await listProjectFiles({ userDataPath: root }, { projectUri: toLocalProjectUri(repo), configuredProjects: [repo], directoryPath: "src" });
    expect(srcResult.ok).toBe(true);
    if (!srcResult.ok) return;
    expect(srcResult.files.map((item) => item.path)).toEqual(["src/App.tsx", "src/logo.png"]);
    expect(srcResult.files.find((item) => item.path === "src/App.tsx")?.editable).toBe(true);
    expect(srcResult.files.find((item) => item.path === "src/logo.png")?.editable).toBe(false);

    const nodeModulesResult = await listProjectFiles({ userDataPath: root }, { projectUri: toLocalProjectUri(repo), configuredProjects: [repo], directoryPath: "node_modules" });
    expect(nodeModulesResult.ok).toBe(true);
    if (!nodeModulesResult.ok) return;
    expect(nodeModulesResult.files.map((item) => item.path)).toEqual(["node_modules/ignored"]);
  });

  it("rejects repositories outside configured projects", async () => {
    const root = await makeTempRoot("project-files-root");
    const outside = await makeTempRoot("project-files-outside");
    await writeText(path.join(outside, "README.md"), "# Outside\n");

    const result = await listProjectFiles({ userDataPath: root }, { projectUri: toLocalProjectUri(outside), configuredProjects: [root] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsafe-path");
  });

  it("classifies common editable file names and extensions", () => {
    expect(isEditableProjectFile("AGENTS.md")).toBe(true);
    expect(isEditableProjectFile("src/main.ts")).toBe(true);
    expect(isEditableProjectFile(".env")).toBe(true);
    expect(isEditableProjectFile(".env.local")).toBe(true);
    expect(isEditableProjectFile("bad\nname.md")).toBe(false);
    expect(isEditableProjectFile("image.png")).toBe(false);
  });
});
