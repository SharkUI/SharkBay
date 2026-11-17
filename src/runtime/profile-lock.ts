import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function acquireProfileLock(paths: { userDataPath: string; configPath: string }): Promise<() => Promise<void>> {
  await mkdir(paths.userDataPath, { recursive: true });
  await mkdir(path.dirname(paths.configPath), { recursive: true });
  const config = await realpath(paths.configPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return realpath(path.dirname(paths.configPath)).then((parent) => path.join(parent, path.basename(paths.configPath)));
  });
  const locks = [...new Set([path.join(await realpath(paths.userDataPath), "runtime.lock"), `${config}.runtime.lock`])];
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
        try { await writeFile(file, content, { flag: "wx", mode: 0o600 }); }
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

async function recoverLock(file: string, content: string): Promise<void> {
  // Serialize reclaimers before checking the owner: two simultaneous launches
  // must never delete a replacement lock created by the other launch.
  const guard = `${file}.recovery`;
  await mkdir(guard, { mode: 0o700 });
  try {
    try {
      if (!(await lstat(file)).isFile()) throw new Error("Unverified lock file");
      const owner = JSON.parse(await readFile(file, "utf8"));
      if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 || typeof owner.token !== "string" || !owner.token) throw new Error("Unverified lock owner");
      let dead = false;
      try { process.kill(owner.pid, 0); }
      catch (error) { dead = (error as NodeJS.ErrnoException).code === "ESRCH"; }
      if (!dead) throw new Error("Live or unverified lock owner");
      await unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw Object.assign(new Error(`Runtime profile is already held or has an unverified lock: ${file}`), { code: "EEXIST" });
    }
    await writeFile(file, content, { flag: "wx", mode: 0o600 });
  } finally { await rmdir(guard); }
}
