import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, realpath, rm, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import Database from "better-sqlite3";
import { expect, it, vi } from "vitest";
import { acquireProfileLock, canonicalRuntimeProfile } from "../src/runtime/profile-lock.js";
import { decideRuntimeMigration, readRuntimeMigration, writeRuntimeMigration } from "../src/runtime/migration-state.js";
import { snapshotRuntimeProfile } from "../src/runtime/migration-snapshot.js";
import { stageMigrationPackage } from "../src/runtime/migration-package.js";

it("backs up committed WAL without restoring over newer data after fallback", async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "sharkbay-migration-test-")));
  try {
    const profile = await canonicalRuntimeProfile({
      userDataPath: path.join(directory, "data"), configPath: path.join(directory, "custom-config.json"),
    });
    const recordFile = path.join(directory, "profile.json");
    const database = path.join(profile.userDataPath, "token-usage.db");
    await writeFile(profile.configPath, "{}");
    const staged = {
      ...profile, phase: "staged" as const,
      service: { label: "xyz.sharkbay.runtime.test", node: process.execPath, port: 17777, lan: false },
    };
    const attempt = randomUUID();
    await writeRuntimeMigration(recordFile, { ...staged, attempt });
    const child = spawn(process.execPath, ["-e", `
      const db = new (require("better-sqlite3"))(process.argv[1]);
      db.pragma("journal_mode = WAL");
      db.pragma("wal_autocheckpoint = 0");
      db.exec("create table example(value text); insert into example values ('in WAL')");
      process.stdout.write("ready");
      setInterval(() => {}, 1000);
    `, database], { stdio: ["ignore", "pipe", "inherit"] });
    try {
      expect(await Promise.race([
        once(child.stdout, "data").then(([data]) => String(data)),
        once(child, "exit").then(() => "exited"),
      ])).toBe("ready");
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
    }
    expect((await stat(database + "-wal")).size).toBeGreaterThan(0);
    function insert(value: string) {
      const db = new Database(database, { fileMustExist: true });
      try { db.prepare("insert into example values (?)").run(value); } finally { db.close(); }
    }
    function rows(file: string) {
      const db = new Database(file, { readonly: true, fileMustExist: true });
      try { return db.prepare("select value from example").pluck().all(); } finally { db.close(); }
    }
    const release = await acquireProfileLock(profile);
    try {
      const snapshot = await snapshotRuntimeProfile(recordFile, profile);
      expect(rows(path.join(directory, snapshot, "token-usage.db"))).toEqual(["in WAL"]);
      await expect(acquireProfileLock(profile)).rejects.toThrow(/already held/);
      await expect(decideRuntimeMigration(recordFile, attempt, { phase: "cancelled" })).resolves.toEqual({ phase: "cancelled" });
      await expect(decideRuntimeMigration(recordFile, attempt, { phase: "committed", snapshot })).resolves.toEqual({ phase: "cancelled" });
    } finally { await release(); }

    insert("after fallback");
    await writeFile(profile.configPath, '{"legacy":true}');
    await writeRuntimeMigration(recordFile, { ...staged, attempt: randomUUID() });
    const retry = await acquireProfileLock(profile);
    try {
      const snapshot = await snapshotRuntimeProfile(recordFile, profile);
      expect(rows(path.join(directory, snapshot, "token-usage.db"))).toEqual(["in WAL", "after fallback"]);
      expect(await readFile(path.join(directory, snapshot, "config.json"), "utf8")).toBe('{"legacy":true}');
    } finally { await retry(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("publishes just one decision when the candidate commits as the bridge times out", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sharkbay-decision-"));
  try {
    const profile = await canonicalRuntimeProfile({ userDataPath: path.join(directory, "data"), configPath: path.join(directory, "config.json") });
    const file = path.join(directory, "profile.json");
    const attempt = randomUUID();
    await writeRuntimeMigration(file, {
      ...profile, attempt, phase: "staged",
      service: { label: "xyz.sharkbay.runtime.test", node: process.execPath, port: 17777, lan: false },
    });
    const commit = { phase: "committed" as const, snapshot: "snapshot-123456" };
    const [candidate, bridge] = await Promise.all([
      decideRuntimeMigration(file, attempt, commit),
      decideRuntimeMigration(file, attempt, { phase: "cancelled" }),
    ]);
    expect(candidate).toEqual(bridge);
    expect(await readRuntimeMigration(file)).toMatchObject(candidate);
    const next = randomUUID();
    await expect(decideRuntimeMigration(file, next, commit)).resolves.toEqual(commit);
    await expect(decideRuntimeMigration(file, next, { phase: "cancelled" })).resolves.toEqual(commit);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("rejects a pinned archive with an escaping path, symlink or unsafe mode before installing", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sharkbay-unsafe-archive-"));
  try {
    for (const [entry, mode, type] of [["../outside", "0000600", "0"], ["link", "0000600", "2"], ["writable", "0000777", "0"]] as const) {
      const tar = Buffer.alloc(1536);
      tar.write(entry);
      tar.write(mode, 100);
      tar.write("00000000000", 124);
      tar.write(type, 156);
      tar.write("ustar", 257);
      const archive = Uint8Array.from(gzipSync(tar));
      const url = "https://example.org/runtime.tar.gz";
      const response = new Response(archive);
      Object.defineProperty(response, "url", { value: url });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(stageMigrationPackage(directory, {
        version: "1.0.0", url, sha256: createHash("sha256").update(archive).digest("hex"),
      })).rejects.toThrow(/Unsafe Runtime archive entry/);
    }
    await expect(stat(path.join(directory, "outside"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  }
});
