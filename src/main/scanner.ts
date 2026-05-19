import { promises as fs } from "node:fs";
import path from "node:path";
import type { IpcRuntimeLike, ProjectCandidate, ProjectScanInput, RemoteMachine, ScanProjectsResult } from "../shared/types.js";
import { loadAppConfig, getRuntimeConfigPath } from "./config.js";
import { discoverProjectDevServices } from "./dev-services.js";
import { readGitMetadata } from "./git.js";
import { resolveConfiguredRoots } from "./path-safety.js";
import { resolveProjectIconSources } from "./project-icons.js";
import { parseProjectUri, toLocalProjectUri } from "../core/project-uri.js";

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
      const name = path.basename(repoPath);
      const projectUri = toLocalProjectUri(repoPath);
      if (found.has(projectUri)) continue;
      const rootUri = toLocalProjectUri(root.path);
      const [iconSources, services, gitMetadata] = await Promise.all([
        resolveProjectIconSources(repoPath, [repoPath]),
        discoverProjectDevServices(repoPath),
        readGitMetadata(repoPath),
      ]);
      found.set(projectUri, {
        id: projectUri,
        uri: projectUri,
        name,
        providerId: "local",
        providerKind: "local",
        displayPath: repoPath,
        rootUri,
        iconSources,
        services,
        dirtyWorktree: gitMetadata.dirtyWorktree,
      });
    }
  }

  const candidates = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { roots, candidates };
}

export async function scanProjects(runtime: IpcRuntimeLike, input?: ProjectScanInput): Promise<ScanProjectsResult> {
  const config = await loadAppConfig(getRuntimeConfigPath(runtime));

  const manualCandidates = await resolveManualProjects(config.configuredProjects);
  const remoteCandidates = await resolveRemoteProjects(config.configuredRemoteProjects, config.configuredRemoteMachines);
  const merged = mergeProjectCandidates([], [...manualCandidates, ...remoteCandidates]);

  return { roots: [], candidates: merged };
}

async function resolveRemoteProjects(configuredRemoteProjects: string[], remoteMachines: RemoteMachine[] = []): Promise<ProjectCandidate[]> {
  const machines = new Map(remoteMachines.map((machine) => [machine.id, machine]));
  const candidates: ProjectCandidate[] = [];
  for (const projectUri of configuredRemoteProjects) {
    try {
      const parsed = parseProjectUri(projectUri);
      if (parsed.kind !== "ssh") continue;
      const name = path.posix.basename(parsed.path) || parsed.machineId;
      const machine = machines.get(parsed.machineId);
      candidates.push({
        id: projectUri,
        uri: projectUri,
        name,
        providerId: parsed.machineId,
        providerKind: "ssh",
        displayPath: `${machine?.label ?? parsed.machineId}:${parsed.path}`,
        rootUri: projectUri,
        iconSources: [],
        services: [],
        dirtyWorktree: null,
      });
    } catch {
      // Skip invalid remote project URIs.
    }
  }
  return candidates;
}

async function resolveManualProjects(configuredProjects: string[]): Promise<ProjectCandidate[]> {
  const candidates: ProjectCandidate[] = [];

  for (const projectPath of configuredProjects) {
    try {
      const real = await fs.realpath(path.resolve(projectPath));
      const stat = await fs.stat(real);
      if (!stat.isDirectory()) continue;

      const name = path.basename(real);
      const projectUri = toLocalProjectUri(real);
      const [iconSources, services, gitMetadata] = await Promise.all([
        resolveProjectIconSources(real, [real]),
        discoverProjectDevServices(real),
        readGitMetadata(real),
      ]);
      candidates.push({
        id: projectUri,
        uri: projectUri,
        name,
        providerId: "local",
        providerKind: "local",
        displayPath: real,
        rootUri: projectUri,
        iconSources,
        services,
        dirtyWorktree: gitMetadata.dirtyWorktree,
      });
    } catch {
      // Skip projects that can't be resolved (missing, permission errors, etc.)
    }
  }

  return candidates;
}

function mergeProjectCandidates(scanned: ProjectCandidate[], manual: ProjectCandidate[]): ProjectCandidate[] {
  const seen = new Map<string, ProjectCandidate>();
  for (const candidate of scanned) {
    seen.set(candidate.uri, candidate);
  }
  for (const candidate of manual) {
    if (!seen.has(candidate.uri)) {
      seen.set(candidate.uri, candidate);
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
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
