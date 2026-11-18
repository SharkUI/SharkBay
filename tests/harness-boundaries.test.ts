import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, link, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installHarness, reserveArtifactPath, reserveReviewPath, updateHarnessFiles } from "../src/main/harness.js";
import { parseTaskFile } from "../src/main/tasks.js";
import { TeamworkSync } from "../src/main/teamwork-sync.js";

vi.mock("../src/main/command-path.js", () => ({ resolveCommandPath: async () => null }));
const filesystem = vi.hoisted(() => ({ beforeOpen: undefined as (() => Promise<void>) | undefined }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const beforeOpen = filesystem.beforeOpen; filesystem.beforeOpen = undefined;
      await beforeOpen?.();
      return actual.open(...args);
    },
  };
});

let root: string, repo: string, outside: string;
const options = { githubLogin: "audit", githubUserId: 1, machineId: "fixture", agent: "codex", repo: "audit/fixture" };
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sharkbay-harness-boundary-"));
  repo = path.join(root, "project"); outside = path.join(root, "outside");
  await mkdir(repo); await mkdir(outside);
});
afterEach(async () => { filesystem.beforeOpen = undefined; await rm(root, { recursive: true, force: true }); });

describe("managed harness write boundaries", () => {
  it.each([".sharkbay", ".sharkbay/harness", ".sharkbay/tasks", ".sharkbay/team-context"])("refuses installation through %s symlink", async (relative) => {
    await mkdir(path.dirname(path.join(repo, relative)), { recursive: true });
    await symlink(outside, path.join(repo, relative));
    await expect(installHarness(repo, options)).rejects.toThrow(/symlink|unsafe|outside/i);
    expect(await readdir(outside)).toEqual([]);
  });
  it.each([".sharkbay/machine-id", ".sharkbay/harness/protocol.md", ".sharkbay/harness/review.sh"])("does not truncate or chmod a linked managed file %s", async (relative) => {
    await mkdir(path.dirname(path.join(repo, relative)), { recursive: true });
    const victim = path.join(outside, "keep"); await writeFile(victim, "keep this", { mode: 0o600 });
    await symlink(victim, path.join(repo, relative));
    await expect(installHarness(repo, options)).rejects.toThrow(/symlink|unsafe|outside/i);
    expect(await readFile(victim, "utf8")).toBe("keep this");
    expect((await stat(victim)).mode & 0o777).toBe(0o600);
  });
  it("does not overwrite a managed file hard-linked to another file", async () => {
    await mkdir(path.join(repo, ".sharkbay"));
    const victim = path.join(outside, "keep"); await writeFile(victim, "preserve");
    await link(victim, path.join(repo, ".sharkbay/machine-id"));
    await expect(installHarness(repo, options)).rejects.toThrow(/unsafe/i);
    expect(await readFile(victim, "utf8")).toBe("preserve");
  });
  it("refuses a leaf changed to a symlink after validation but before opening", async () => {
    const victim = path.join(outside, "keep"); await writeFile(victim, "preserve");
    filesystem.beforeOpen = () => symlink(victim, path.join(repo, ".sharkbay/machine-id"));
    await expect(installHarness(repo, options)).rejects.toThrow(/ELOOP|symlink/i);
    expect(await readFile(victim, "utf8")).toBe("preserve");
  });
  it("refuses updating a harness whose parent was replaced with a symlink", async () => {
    await installHarness(repo, options);
    await rm(path.join(repo, ".sharkbay/harness"), { recursive: true });
    await symlink(outside, path.join(repo, ".sharkbay/harness"));
    await expect(updateHarnessFiles(repo)).rejects.toThrow(/symlink|unsafe|outside/i);
    expect(await readdir(outside)).toEqual([]);
  });
  it.each(["artifacts", "reviews"])("refuses reservation in a linked %s directory", async (kind) => {
    await mkdir(path.join(repo, ".sharkbay"));
    await symlink(outside, path.join(repo, ".sharkbay", kind));
    const reserve = kind === "artifacts" ? reserveArtifactPath : reserveReviewPath;
    await expect(reserve(repo, "TASK01-u1-mfixture")).rejects.toThrow(/symlink|unsafe|outside/i);
    expect(await readdir(outside)).toEqual([]);
  });
  it.each(["team-context", "team-context/tasks", "team-context/tasks/2026"])("does not refresh mirrors through a linked %s", async (relative) => {
    await mkdir(path.dirname(path.join(repo, ".sharkbay", relative)), { recursive: true });
    await symlink(outside, path.join(repo, ".sharkbay", relative));
    const sync = new TeamworkSync(repo);
    sync["git"] = async args => args[0] === "ls-tree" ? ".sharkbay-team-context/tasks/2026/task.md" : "fixture";
    await expect(sync["refreshMirrorFromRemote"]()).rejects.toThrow(/symlink|unsafe|outside/i);
    expect(await readdir(outside)).toEqual([]);
  });
  it.each(["../../../outside/task", "/outside", "..", "task/name", "task\\name", "task\nname"])("rejects unsafe task identifiers before reserving files", async (id) => {
    await expect(reserveArtifactPath(repo, id)).rejects.toThrow(/task.*unsafe/i);
    await expect(reserveReviewPath(repo, id)).rejects.toThrow(/task.*unsafe/i);
    expect(await readdir(repo)).toEqual([]);
  });
  it("rejects unsafe frontmatter while keeping supported task identifiers", async () => {
    const file = path.join(repo, "task.md");
    await writeFile(file, "---\ntaskId: ../../../outside/task\ntitle: Unsafe\n---\n");
    expect(await parseTaskFile(file)).toBeNull();
    await writeFile(file, "---\ntaskId: TASK01-u1-mfixture\ntitle: Valid\n---\n");
    expect(await parseTaskFile(file)).toMatchObject({ taskId: "TASK01-u1-mfixture" });
  });
  it("preserves ordinary installation and unique atomic reservations", async () => {
    await installHarness(repo, options);
    const paths = await Promise.all([reserveArtifactPath(repo, "TASK01-u1-mfixture"), reserveArtifactPath(repo, "TASK01-u1-mfixture"), reserveReviewPath(repo, "TASK01-u1-mfixture")]);
    expect(new Set(paths).size).toBe(3);
    for (const relative of paths) expect(await readFile(path.join(repo, relative), "utf8")).toBe("");
    expect(await readFile(path.join(repo, ".sharkbay/machine-id"), "utf8")).toBe("fixture");
  });
});
