import { promises as fs } from "node:fs";
import path from "node:path";
import type { IpcRuntimeLike, ProjectCandidate, ProjectScanInput, ScanProjectsResult } from "../shared/types.js";
import { loadAppConfig, getRuntimeConfigPath } from "./config.js";
import { discoverProjectDevServices } from "./dev-services.js";
import { resolveConfiguredRoots } from "./path-safety.js";
import { resolveProjectIconSources } from "./project-icons.js";

const ignoredDirectories = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".next",
  ".turbo",
  ".vite",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
]);

export async function scanConfiguredRoots(configuredRoots: string[], options: { maxDepth?: number } = {}): Promise<ScanProjectsResult> {
  const roots = await resolveConfiguredRoots(configuredRoots);
  const maxDepth = options.maxDepth ?? 6;
  const found = new Map<string, ProjectCandidate>();

  for (const root of roots) {
    if (!root.available || !root.path) continue;
    const repos = await findGitRepos(root.path, maxDepth);
    for (const repoPath of repos) {
      if (found.has(repoPath)) continue;
      const name = path.basename(repoPath);
      const [iconSources, services] = await Promise.all([
        resolveProjectIconSources(repoPath, [root.path]),
        discoverProjectDevServices(repoPath),
      ]);
      found.set(repoPath, { id: repoPath, name, path: repoPath, rootPath: root.path, iconSources, services });
    }
  }

  const candidates = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { roots, candidates };
}

export async function scanProjects(runtime: IpcRuntimeLike, input?: ProjectScanInput): Promise<ScanProjectsResult> {
  const configuredRoots = (await loadAppConfig(getRuntimeConfigPath(runtime))).configuredRoots;
  return scanConfiguredRoots(configuredRoots, { maxDepth: input?.maxDepth });
}

async function findGitRepos(rootPath: string, maxDepth: number): Promise<string[]> {
  const found: string[] = [];
  const root = await fs.realpath(rootPath);

  async function walk(directory: string, depth: number): Promise<void> {
    if (await isGitRepo(directory)) {
      found.push(directory);
      return;
    }
    if (depth >= maxDepth) return;

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !shouldIgnore(entry.name))
        .map((entry) => walk(path.join(directory, entry.name), depth + 1)),
    );
  }

  await walk(root, 0);
  return found;
}

async function isGitRepo(directory: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(path.join(directory, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

function shouldIgnore(name: string): boolean {
  if (ignoredDirectories.has(name)) return true;
  return name.startsWith(".");
}
