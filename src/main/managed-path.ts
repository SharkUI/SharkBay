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

export async function writeManagedFile(repoPath: string, relativePath: string, content: string, executable = false, expected?: string | null): Promise<boolean> {
  const file = await resolveManagedPath(repoPath, relativePath);
  const flags = expected == null
    ? constants.O_WRONLY | constants.O_CREAT | (expected === null ? constants.O_EXCL : 0)
    : constants.O_RDWR;
  let handle;
  try {
    handle = await open(file, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o644);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (expected === null && code === "EEXIST" || typeof expected === "string" && code === "ENOENT") return false;
    throw error;
  }
  try {
    const entry = await handle.stat();
    if (!entry.isFile() || entry.nlink > 1) throw new Error("Managed file has an unsafe type or multiple links");
    if (typeof expected === "string") {
      const previous = Buffer.from(expected);
      if (entry.size !== previous.length) return false;
      const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(previous.length), position: 0 });
      if (bytesRead !== previous.length || !buffer.equals(previous)) return false;
    }
    await handle.truncate(0);
    await handle.writeFile(content, "utf8");
    if (executable) await handle.chmod(0o755);
    return true;
  } finally { await handle.close(); }
}
