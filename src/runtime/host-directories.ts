import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ApplicationError, type HostDirectoryListing } from "../shared/application-api.js";

export async function resolveHostDirectory(directory: string): Promise<string> {
  if (!path.isAbsolute(directory)) throw new ApplicationError("INVALID_INPUT", "Choose an absolute path on the SharkBay host");
  const resolved = await realpath(directory);
  if (!(await stat(resolved)).isDirectory()) throw new ApplicationError("INVALID_INPUT", "Path must be a directory");
  return resolved;
}

export async function listHostDirectories(directory = homedir()): Promise<HostDirectoryListing> {
  const current = await resolveHostDirectory(directory);
  const entries = await readdir(current, { withFileTypes: true });
  const directories = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) return { name: entry.name, path: entryPath };
    if (entry.isSymbolicLink()) {
      try { if ((await stat(entryPath)).isDirectory()) return { name: entry.name, path: entryPath }; } catch { /* Skip unavailable links. */ }
    }
    return null;
  }));
  const parent = path.dirname(current);
  return { path: current, parentPath: parent === current ? null : parent, directories: directories.filter((entry) => entry !== null).sort((a, b) => a.name.localeCompare(b.name)) };
}
