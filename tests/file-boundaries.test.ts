import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveReadableRepoFile } from "../src/main/path-safety.js";
import { renameLocalProjectFile, writeLocalProjectFile } from "../src/main/file-content.js";
import { validateApplicationInput } from "../src/runtime/application-input.js";
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
  async function runtime() {
    const configPath = path.join(directory, "config.json");
    await saveAppConfig({ ...createDefaultConfig(), configuredProjects: [project] }, configPath);
    return { userDataPath: directory, configPath };
  }
  it("rejects creating an existing file without changing its contents", async () => {
    await writeFile(path.join(project, "existing.txt"), "keep this");
    const input = { projectUri: `local:${project}`, relativePath: "existing.txt", content: "", create: "file" as const };
    const result = await writeLocalProjectFile(await runtime(), input);
    expect(result).toMatchObject({ ok: false, reason: "already-exists" });
    expect(await readFile(path.join(project, "existing.txt"), "utf8")).toBe("keep this");
  });
  it("allows only one concurrent creation while ordinary saves still replace content", async () => {
    const paths = await runtime();
    const input = { projectUri: `local:${project}`, relativePath: "new.txt", content: "first", create: "file" as const };
    const results = await Promise.all([writeLocalProjectFile(paths, input), writeLocalProjectFile(paths, { ...input, content: "second" })]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toEqual([expect.objectContaining({ reason: "already-exists" })]);
    expect(await writeLocalProjectFile(paths, { projectUri: input.projectUri, relativePath: input.relativePath, content: "saved" })).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, "new.txt"), "utf8")).toBe("saved");
  });
  it("creates a real directory and preserves an existing directory and its gitkeep", async () => {
    const paths = await runtime();
    const input = { projectUri: `local:${project}`, relativePath: "folder", content: "", create: "directory" as const };
    expect(await writeLocalProjectFile(paths, input)).toMatchObject({ ok: true });
    await writeFile(path.join(project, "folder", ".gitkeep"), "preserve");
    expect(await writeLocalProjectFile(paths, input)).toMatchObject({ ok: false, reason: "already-exists" });
    expect(await readFile(path.join(project, "folder", ".gitkeep"), "utf8")).toBe("preserve");
  });
  it("keeps creation inside the configured project", async () => {
    await symlink(path.join(directory, "project-neighbor"), path.join(project, "outside"));
    const paths = await runtime();
    for (const create of ["file", "directory"] as const) {
      expect(await writeLocalProjectFile(paths, { projectUri: `local:${project}`, relativePath: "outside/new", content: "", create })).toMatchObject({ ok: false, reason: "unsafe-path" });
    }
  });
  it("validates the create mode at the shared command boundary", () => {
    const input = { projectUri: `local:${project}`, relativePath: "new", content: "" };
    expect(validateApplicationInput("projects.writeFile", { ...input, create: "directory" })).toMatchObject({ create: "directory" });
    expect(() => validateApplicationInput("projects.writeFile", { ...input, create: "overwrite" })).toThrow(/Invalid create/);
  });
});
