import { promises as fs } from "node:fs";
import path from "node:path";
import type { RootScanResult } from "../shared/types.js";
import { localPathFromProjectUri, toLocalProjectUri } from "../core/project-uri.js";

export type SafeRepoPath = {
  repoPath: string;
  containingRoot: string;
};

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveConfiguredRoots(configuredRoots: string[]): Promise<RootScanResult[]> {
  const seen = new Set<string>();
  const results: RootScanResult[] = [];

  for (const inputPath of configuredRoots) {
    const absolute = path.resolve(inputPath);
    try {
      const real = await fs.realpath(absolute);
      const stat = await fs.stat(real);
      if (!stat.isDirectory()) {
        results.push({ inputPath, path: null, available: false, error: "Configured root is not a directory" });
        continue;
      }
      if (!seen.has(real)) {
        seen.add(real);
        results.push({ inputPath, path: real, available: true, error: null });
      }
    } catch (error) {
      results.push({
        inputPath,
        path: null,
        available: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export async function resolveRepoPath(repoPath: string, configuredRoots: string[], configuredProjects?: string[]): Promise<SafeRepoPath> {
  const realRepo = await fs.realpath(path.resolve(repoPath));
  const stat = await fs.stat(realRepo);
  if (!stat.isDirectory()) {
    throw new Error("Repository path is not a directory");
  }

  // Check if the repo is a manually configured project (self-rooted)
  if (configuredProjects && configuredProjects.length > 0) {
    for (const projectPath of configuredProjects) {
      try {
        const realProject = await fs.realpath(path.resolve(projectPath));
        if (realRepo === realProject || isPathInside(realProject, realRepo)) {
          return { repoPath: realRepo, containingRoot: realProject };
        }
      } catch {
        // Skip unresolvable project paths
      }
    }
  }

  // Fall back to configured roots containment check
  const roots = await availableRootPaths(configuredRoots);
  if (roots.length === 0 && (!configuredProjects || configuredProjects.length === 0)) {
    throw new Error("No configured roots are available");
  }

  const containingRoot = roots.find((root) => isPathInside(root, realRepo));
  if (!containingRoot) {
    throw new Error("Repository path is outside configured roots and outside configured projects");
  }

  return { repoPath: realRepo, containingRoot };
}

export async function resolveProjectUri(projectUri: string, configuredRoots: string[], configuredProjects?: string[]): Promise<SafeRepoPath & { projectUri: string }> {
  const safeRepo = await resolveRepoPath(localPathFromProjectUri(projectUri), configuredRoots, configuredProjects);
  return { ...safeRepo, projectUri: toLocalProjectUri(safeRepo.repoPath) };
}

export async function resolveReadableRepoFile(
  repoPath: string,
  configuredRoots: string[],
  relativePath: string,
  configuredProjects?: string[],
): Promise<string> {
  if (path.isAbsolute(relativePath) || relativePath.split(path.sep).includes("..")) {
    throw new Error("Relative file path is unsafe");
  }

  const safeRepo = await resolveRepoPath(repoPath, configuredRoots, configuredProjects);
  const filePath = path.join(safeRepo.repoPath, relativePath);
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink()) {
      throw new Error("Repository file cannot be a symlink");
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
      return filePath;
    }
    throw error;
  }

  const realFile = await fs.realpath(filePath);
  if (!isPathInside(safeRepo.repoPath, realFile) || !isPathInside(safeRepo.containingRoot, realFile)) {
    throw new Error("Repository file is outside the allowed boundary");
  }
  return realFile;
}

async function availableRootPaths(configuredRoots: string[]): Promise<string[]> {
  const results = await resolveConfiguredRoots(configuredRoots);
  return results.filter((root) => root.available && root.path).map((root) => root.path as string);
}
