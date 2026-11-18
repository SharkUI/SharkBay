import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

/** Reject existing symlinks in managed paths, including project-local links. */
export async function resolveManagedPath(repoPath: string, relativePath: string): Promise<string> {
  const parts = relativePath.split("/");
  if (parts[0] !== ".sharkbay" || parts.some(part => !part || part === "." || part === ".." || /[\\\0\r\n]/.test(part))) {
    throw new Error("Managed path is unsafe");
  }
  let current = await realpath(repoPath);
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) throw new Error("Managed path cannot contain a symlink");
      if (index < parts.length - 1 ? !entry.isDirectory() : !entry.isFile() && !entry.isDirectory()) {
        throw new Error("Managed path has an unsafe file type");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return current;
}

export async function writeManagedFile(repoPath: string, relativePath: string, content: string, executable = false): Promise<void> {
  const file = await resolveManagedPath(repoPath, relativePath);
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o644);
  try {
    const entry = await handle.stat();
    if (!entry.isFile() || entry.nlink > 1) throw new Error("Managed file has an unsafe type or multiple links");
    await handle.truncate(0);
    await handle.writeFile(content, "utf8");
    if (executable) await handle.chmod(0o755);
  } finally { await handle.close(); }
}
