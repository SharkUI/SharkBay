import { execFile } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const hardcodedFallbackDirectories = [
  ".local/bin",
  ".bun/bin",
  ".nvm/current/bin",
  ".volta/bin",
  ".asdf/shims",
  ".opencode/bin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

interface ShellPathCache {
  paths: string[];
  at: number;
}

const shellPathCacheByHome = new Map<string, ShellPathCache>();
const SHELL_PATH_CACHE_TTL_MS = 60_000;

function detectShell(): { bin: string; name: "fish" | "posix" } {
  const envShell = process.env.SHELL;
  if (envShell) {
    const base = path.basename(envShell);
    if (base === "fish") return { bin: envShell, name: "fish" };
    if (base === "bash" || base === "zsh" || base === "sh" || base === "dash") return { bin: envShell, name: "posix" };
  }
  return { bin: "/bin/sh", name: "posix" };
}

function shellPathCommand(shellName: "fish" | "posix"): string {
  if (shellName === "fish") return "string split : $PATH";
  return "echo \"$PATH\"";
}

async function getShellPaths(homeDirectory: string): Promise<string[]> {
  const cached = shellPathCacheByHome.get(homeDirectory);
  if (cached && Date.now() - cached.at < SHELL_PATH_CACHE_TTL_MS) return cached.paths;

  const shell = detectShell();
  try {
    const cmd = shellPathCommand(shell.name);
    const result = await execFileAsync(shell.bin, ["-lic", cmd], { timeout: 5000 });
    const line = result.stdout.trim().split(/\r?\n/u).pop();
    const paths = line ? line.split(":").filter(Boolean) : [];
    shellPathCacheByHome.set(homeDirectory, { paths, at: Date.now() });
    return paths;
  } catch {
    return [];
  }
}

export async function resolveCommandPath(
  command: string,
  fallbackDirectories = hardcodedFallbackDirectories,
  homeDirectory = os.homedir()
): Promise<string | null> {
  if (!/^[\w.-]+$/u.test(command)) return null;

  // 1) Use the user's login shell (interactive mode when supported) to get
  //    their full PATH. This picks up version managers (fnm, nvm, volta, …)
  //    that Finder-launched apps otherwise miss. Cached per home directory so
  //    lookups for multiple commands only pay this cost once.
  const shellPaths = await getShellPaths(homeDirectory);
  for (const dir of shellPaths) {
    const p = path.join(dir, command);
    if (await isExecutableFile(p)) return p;
  }

  // 2) Scan fnm node-versions for npm global binaries (covers the common case
  //    where the user installed a CLI via fnm-managed node).
  const fnmDirectories = await discoverFnmBinDirectories(homeDirectory);

  // 3) Check well-known install directories.
  for (const directory of [...fnmDirectories, ...fallbackDirectories]) {
    const executablePath = directory.startsWith("/")
      ? path.join(directory, command)
      : path.join(homeDirectory, directory, command);
    if (await isExecutableFile(executablePath)) {
      return executablePath;
    }
  }
  return null;
}

async function discoverFnmBinDirectories(homeDirectory: string): Promise<string[]> {
  const fnmVersionsDir = path.join(homeDirectory, ".local", "share", "fnm", "node-versions");
  try {
    const entries = await fs.readdir(fnmVersionsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(fnmVersionsDir, entry.name, "installation", "bin"));
  } catch {
    return [];
  }
}

async function isExecutableFile(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
