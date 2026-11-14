import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
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
      const data = JSON.parse(await readFile(file, "utf8"));
      if (data.token === token) await unlink(file);
    }
  };
  try {
    for (const file of locks) {
      try {
        await writeFile(file, JSON.stringify({ token, pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
        owned.push(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Runtime profile is already held or has an unverified lock: ${file}. Stop its owner before starting; locks are never stolen.`);
        throw error;
      }
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}
