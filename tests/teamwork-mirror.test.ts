import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamworkSync } from "../src/main/teamwork-sync.js";
import { watchTasks } from "../src/main/tasks.js";

const roots: string[] = [];
const filesystem = vi.hoisted(() => ({ failPublish: false }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: async (from: Parameters<typeof actual.rename>[0], to: Parameters<typeof actual.rename>[1]) => {
    if (filesystem.failPublish && String(from).includes(".tasks-stage-") && !String(from).endsWith("-previous") && String(to).endsWith("/tasks")) {
      throw Object.assign(new Error("publish failed"), { code: "EIO" });
    }
    return actual.rename(from, to);
  } };
});
afterEach(async () => { filesystem.failPublish = false; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const prefix = ".sharkbay-team-context/tasks/";
const record = (id: string) => `---\ntaskId: ${id}\ntitle: Fixture\n---\n`;
async function fixture() {
  const repo = await mkdtemp(path.join(tmpdir(), "sharkbay-mirror-")); roots.push(repo);
  await mkdir(path.join(repo, ".sharkbay/team-context/tasks"), { recursive: true });
  await mkdir(path.join(repo, ".sharkbay/tasks"));
  const sync = new TeamworkSync(repo);
  const files = new Map<string, string>();
  sync["git"] = async args => {
    if (args[0] === "ls-tree") return [...files.keys()].map(key => prefix + key).join(args.includes("-z") ? "\0" : "\n");
    const key = args[1]!.split(":" + prefix)[1]!;
    if (!files.has(key)) throw new Error("remote read failed");
    return files.get(key)!;
  };
  return { repo, sync, files, refresh: () => sync["refreshMirrorFromRemote"]("fixture") };
}

describe("complete task mirror snapshots", () => {
  it("removes remote deletions and renames without touching local task records", async () => {
    const { repo, files, refresh } = await fixture();
    const local = path.join(repo, ".sharkbay/tasks/local.md"); await writeFile(local, record("LOCAL1"));
    files.set("2026/old.md", record("OLD001")); await refresh();
    files.clear(); files.set("2026/renamed.md", record("NEW001")); await refresh();
    const mirror = path.join(repo, ".sharkbay/team-context/tasks/2026");
    expect(await readdir(mirror)).toEqual(["renamed.md"]);
    files.clear(); await refresh();
    expect(await readdir(path.dirname(mirror))).toEqual([]);
    expect(await readFile(local, "utf8")).toBe(record("LOCAL1"));
  });
  it("keeps the previous complete mirror when remote tree enumeration fails", async () => {
    const { repo, files, sync, refresh } = await fixture();
    files.set("old.md", record("OLD001")); await refresh();
    sync["git"] = async () => { throw new Error("remote unavailable"); };
    await expect(refresh()).rejects.toThrow("remote unavailable");
    expect(await readFile(path.join(repo, ".sharkbay/team-context/tasks/old.md"), "utf8")).toBe(record("OLD001"));
  });
  it("does not publish partially read snapshots", async () => {
    const { repo, files, sync, refresh } = await fixture();
    files.set("same.md", record("OLD001")); await refresh();
    sync["git"] = async args => {
      if (args[0] === "ls-tree") return [prefix + "same.md", prefix + "failed.md"].join(args.includes("-z") ? "\0" : "\n");
      if (args[1]!.endsWith("same.md")) return record("NEW001");
      throw new Error("object unavailable");
    };
    await expect(refresh()).rejects.toThrow("object unavailable");
    expect(await readFile(path.join(repo, ".sharkbay/team-context/tasks/same.md"), "utf8")).toBe(record("OLD001"));
    expect(await readdir(path.join(repo, ".sharkbay/team-context"))).toEqual(["tasks"]);
  });
  it("restores the last complete snapshot when publication fails", async () => {
    const { repo, files, refresh } = await fixture();
    files.set("old.md", record("OLD001")); await refresh();
    files.clear(); files.set("new.md", record("NEW001")); filesystem.failPublish = true;
    await expect(refresh()).rejects.toThrow("publish failed");
    const mirror = path.join(repo, ".sharkbay/team-context/tasks");
    expect(await readdir(mirror)).toEqual(["old.md"]);
    expect(await readFile(path.join(mirror, "old.md"), "utf8")).toBe(record("OLD001"));
    expect(await readdir(path.dirname(mirror))).toEqual(["tasks"]);
  });
  it("continues watching the mirror after repeated snapshot replacement", async () => {
    const { repo, files, refresh } = await fixture(); const changed = vi.fn();
    const stop = watchTasks(repo, changed);
    try {
      files.set("first.md", record("FIRST1")); await refresh();
      await vi.waitFor(() => expect(changed.mock.calls.at(-1)?.[0].map((task: { taskId: string }) => task.taskId)).toEqual(["FIRST1"]), { timeout: 2000 });
      files.clear(); files.set("second.md", record("SECOND")); await refresh();
      await vi.waitFor(() => expect(changed.mock.calls.at(-1)?.[0].map((task: { taskId: string }) => task.taskId)).toEqual(["SECOND"]), { timeout: 2000 });
    } finally { stop(); }
  });
});
