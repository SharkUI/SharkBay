import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveReadableRepoFile } from "../src/main/path-safety.js";
import { renameLocalProjectFile } from "../src/main/file-content.js";
import { createDefaultConfig, saveAppConfig } from "../src/main/config.js";
let directory: string, project: string;
beforeEach(async () => {
  directory = await realpath(await mkdtemp(path.join(tmpdir(), "sharkbay-file-boundary-")));
  project = path.join(directory, "project"); await mkdir(project); await mkdir(path.join(directory, "project-neighbor"));
});
afterEach(() => rm(directory, { recursive: true, force: true }));
describe("project file boundaries", () => {
  it("rejects new files below a symlinked parent outside the project", async () => {
    await symlink(path.join(directory, "project-neighbor"), path.join(project, "outside"));
    await expect(resolveReadableRepoFile(project, [], "outside/new.txt", [project])).rejects.toThrow(/outside/);
  });
  it("rejects the project root as a file operation target", async () => {
    await expect(resolveReadableRepoFile(project, [], ".", [project])).rejects.toThrow(/unsafe/);
  });
  it("does not swallow rename validation or accept sibling paths sharing the project prefix", async () => {
    await writeFile(path.join(project, "source.txt"), "keep this");
    const configPath = path.join(directory, "config.json"); await saveAppConfig({ ...createDefaultConfig(), configuredProjects: [project] }, configPath);
    const result = await renameLocalProjectFile({ userDataPath: directory, configPath }, { projectUri: `local:${project}`, relativePath: "source.txt", newName: "../project-neighbor/escaped.txt" });
    expect(result).toMatchObject({ ok: false, reason: "unsafe-path" });
    expect(await readFile(path.join(project, "source.txt"), "utf8")).toBe("keep this");
  });
});
