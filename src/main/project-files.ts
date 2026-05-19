import { promises as fs } from "node:fs";
import path from "node:path";
import { getConfiguredRoots } from "./config.js";
import { isPathInside, resolveProjectUri } from "./path-safety.js";
import type { IpcRuntimeLike, ProjectFileTreeItem, ProjectFilesInput, ProjectFilesResult } from "../shared/types.js";

const editableExtensions = new Set([
  ".c",
  ".cc",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".env",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".lua",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);

const editableFilenames = new Set([
  ".env",
  ".env.example",
  ".gitignore",
  ".npmrc",
  "Dockerfile",
  "Makefile",
]);

export async function listProjectFiles(runtime: IpcRuntimeLike, input: ProjectFilesInput): Promise<ProjectFilesResult> {
  try {
    const config = input.configuredRoots ? null : await getConfiguredRoots(runtime);
    const configuredRoots = input.configuredRoots ?? config?.configuredRoots ?? [];
    const configuredProjects = input.configuredProjects ?? config?.configuredProjects ?? [];
    const safeRepo = await resolveProjectUri(input.projectUri, configuredRoots, configuredProjects);
    const directoryPath = await resolveRequestedDirectory(safeRepo.repoPath, safeRepo.containingRoot, input.directoryPath);
    const files = await listDirectory(safeRepo.repoPath, directoryPath, safeRepo.containingRoot);
    return { ok: true, projectUri: safeRepo.projectUri, files };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = message.includes("outside configured projects") || message.includes("No configured projects")
      ? "unsafe-path"
      : "io-error";
    return { ok: false, reason, message };
  }
}

async function resolveRequestedDirectory(repoPath: string, containingRoot: string, requestedPath: string | undefined): Promise<string> {
  const normalized = normalizeRelativeDirectoryPath(requestedPath);
  if (!normalized) {
    return repoPath;
  }

  const directoryPath = path.join(repoPath, ...normalized.split("/"));
  const realPath = await fs.realpath(directoryPath);
  const stat = await fs.stat(realPath);
  if (!stat.isDirectory()) {
    throw new Error("Requested path is not a directory");
  }
  if (!isPathInside(repoPath, realPath) || !isPathInside(containingRoot, realPath)) {
    throw new Error("Requested directory is outside configured projects");
  }
  return realPath;
}

function normalizeRelativeDirectoryPath(requestedPath: string | undefined): string {
  const trimmed = requestedPath?.trim();
  if (!trimmed || trimmed === ".") {
    return "";
  }
  if (path.isAbsolute(trimmed) || /[\0\r\n]/.test(trimmed)) {
    throw new Error("Directory path is unsafe");
  }
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (parts.includes("..")) {
    throw new Error("Directory path is unsafe");
  }
  return parts.join("/");
}

export function isEditableProjectFile(relativePath: string): boolean {
  if (/[\0\r\n]/.test(relativePath)) {
    return false;
  }
  const baseName = path.basename(relativePath);
  if (editableFilenames.has(baseName) || baseName.startsWith(".env.")) {
    return true;
  }
  return editableExtensions.has(path.extname(baseName));
}

async function listDirectory(repoPath: string, directoryPath: string, containingRoot: string): Promise<ProjectFileTreeItem[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const items: ProjectFileTreeItem[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    const relativePath = path.relative(repoPath, absolutePath).split(path.sep).join("/");
    if (!relativePath || relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
      continue;
    }

    const realPath = await fs.realpath(absolutePath).catch(() => null);
    const stat = entry.isSymbolicLink()
      ? await fs.stat(absolutePath).catch(() => null)
      : null;
    const contained = Boolean(
      realPath &&
      isPathInside(repoPath, realPath) &&
      isPathInside(containingRoot, realPath),
    );
    const isDirectory = entry.isDirectory() || Boolean(stat?.isDirectory());
    const isFile = entry.isFile() || Boolean(stat?.isFile());

    if (isDirectory) {
      items.push({
        name: entry.name,
        path: relativePath,
        kind: "directory",
        editable: false,
        children: contained && !entry.isSymbolicLink() ? undefined : [],
      });
    } else if (isFile || entry.isSymbolicLink()) {
      items.push({
        name: entry.name,
        path: relativePath,
        kind: "file",
        editable: contained && isEditableProjectFile(relativePath),
      });
    }
  }

  return items.sort(compareTreeItems);
}

function compareTreeItems(a: ProjectFileTreeItem, b: ProjectFileTreeItem): number {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}
