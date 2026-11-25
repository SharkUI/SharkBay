import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { link, lstat, mkdir, open, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const recoveryMarker = "sharkbay-profile-recovery-v1\n";

export async function canonicalRuntimeProfile(paths: { userDataPath: string; configPath: string }) {
  await mkdir(paths.userDataPath, { recursive: true });
  await mkdir(path.dirname(paths.configPath), { recursive: true });
  const config = await realpath(paths.configPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return realpath(path.dirname(paths.configPath)).then((parent) => path.join(parent, path.basename(paths.configPath)));
  });
  return { userDataPath: await realpath(paths.userDataPath), configPath: config };
}

export async function acquireProfileLock(paths: { userDataPath: string; configPath: string }): Promise<() => Promise<void>> {
  const profile = await canonicalRuntimeProfile(paths);
  const locks = [...new Set([path.join(profile.userDataPath, "runtime.lock"), `${profile.configPath}.runtime.lock`])];
  const token = randomUUID();
  const owned: string[] = [];
  const release = async () => {
    for (const file of owned.splice(0)) {
      try {
        const data = JSON.parse(await readFile(file, "utf8"));
        if (data.token === token) await unlink(file);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  };
  try {
    for (const file of locks) {
      try {
        const content = JSON.stringify({ token, pid: process.pid, startedAt: new Date().toISOString() });
        try { await publishLock(file, content); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          await recoverLock(file, content);
        }
        owned.push(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Runtime profile is already held or has an unverified lock: ${file}. Stop its owner before starting.`);
        throw error;
      }
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}

async function publishLock(file: string, content: string) {
  const pending = `${file}.${randomUUID()}.pending`;
  try {
    await writeFile(pending, content, { flag: "wx", mode: 0o600 });
    await link(pending, file);
  } finally { await rm(pending, { force: true }); }
}

async function recoverLock(file: string, content: string): Promise<void> {
  const guard = `${file}.recovery`;
  const mutexFile = `${guard}.sqlite`;
  // SQLite holds the recovery mutex in the kernel. SIGKILL releases it and
  // leaves the marker recognizable to the next reclaimer. Older Runtimes
  // still see an occupied .recovery path and keep out.
  const create = await open(mutexFile, "ax", 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
    return undefined;
  });
  await create?.close();
  const info = await lstat(mutexFile);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) {
    throw Object.assign(new Error("Unverified profile lock recovery mutex"), { code: "EEXIST" });
  }
  const Database = createRequire(import.meta.url)("better-sqlite3") as typeof import("better-sqlite3");
  const mutex = new Database(mutexFile, { timeout: 0, fileMustExist: true });
  try {
    if (mutex.pragma("user_version", { simple: true }) === 0) mutex.pragma("user_version = 1");
    mutex.exec("BEGIN IMMEDIATE");
    try { await publishLock(guard, recoveryMarker); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // A directory may belong to a live legacy reclaimer and has no owner
      // record. Only reuse a marker published by this recovery protocol.
      const marker = await lstat(guard);
      if (!marker.isFile() || (marker.mode & 0o077) !== 0 || (process.getuid && marker.uid !== process.getuid())
        || await readFile(guard, "utf8") !== recoveryMarker) throw error;
    }
    try {
      await removeDeadOwner(file);
      await publishLock(file, content);
    } finally { await unlink(guard); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code?.startsWith("SQLITE_BUSY")) {
      throw Object.assign(new Error("Another Runtime is recovering this profile lock"), { code: "EEXIST" });
    }
    throw error;
  } finally { mutex.close(); }
}

async function removeDeadOwner(file: string) {
  try {
    if (!(await lstat(file)).isFile()) throw new Error("Unverified lock file");
    const owner = JSON.parse(await readFile(file, "utf8"));
    if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 || typeof owner.token !== "string" || !owner.token) {
      throw new Error("Unverified lock owner");
    }
    let dead = false;
    try { process.kill(owner.pid, 0); }
    catch (error) { dead = (error as NodeJS.ErrnoException).code === "ESRCH"; }
    if (!dead) throw new Error("Live or unverified lock owner");
    await unlink(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw Object.assign(new Error(`Runtime profile is already held or has an unverified lock: ${file}`), { code: "EEXIST" });
    }
  }
}
