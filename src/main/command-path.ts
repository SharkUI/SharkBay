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
const shellPathRequestByHome = new Map<string, Promise<string[]>>();
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
  const inFlight = shellPathRequestByHome.get(homeDirectory);
  if (inFlight) return inFlight;

  const request = readShellPaths(homeDirectory);
  shellPathRequestByHome.set(homeDirectory, request);
  try {
    return await request;
  } finally {
    shellPathRequestByHome.delete(homeDirectory);
  }
}

async function readShellPaths(homeDirectory: string): Promise<string[]> {
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

  const searchPaths = await resolveCommandSearchPaths(homeDirectory, fallbackDirectories);
  for (const dir of searchPaths) {
    const p = path.join(dir, command);
    if (await isExecutableFile(p)) return p;
  }
  return null;
}

export async function resolveCommandSearchPaths(
  homeDirectory = os.homedir(),
  fallbackDirectories = hardcodedFallbackDirectories
): Promise<string[]> {
  const shellPaths = await getShellPaths(homeDirectory);
  const [fnmDirectories, nvmDirectories] = await Promise.all([
    discoverFnmBinDirectories(homeDirectory),
    discoverNvmBinDirectories(homeDirectory),
  ]);

  const paths: string[] = [];
  const seen = new Set<string>();
  for (const directory of [...shellPaths, ...fnmDirectories, ...nvmDirectories, ...fallbackDirectories]) {
    const absolute = directory.startsWith("/")
      ? directory
      : path.join(homeDirectory, directory);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    paths.push(absolute);
  }
  return paths;
}

export function prependPathDirectories(envPath: string | undefined, directories: string[]): string {
  const existing = (envPath ?? "").split(path.delimiter).filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const directory of [...directories, ...existing]) {
    if (seen.has(directory)) continue;
    seen.add(directory);
    merged.push(directory);
  }
  return merged.join(path.delimiter);
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

async function discoverNvmBinDirectories(homeDirectory: string): Promise<string[]> {
  const nvmVersionsDir = path.join(homeDirectory, ".nvm", "versions", "node");
  try {
    const entries = await fs.readdir(nvmVersionsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(nvmVersionsDir, entry.name, "bin"));
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
