import { promises as fs } from "node:fs";
import path from "node:path";
import { getConfiguredRoots } from "./config.js";
import { localPathFromProjectUri } from "../core/project-uri.js";
import { resolveReadableRepoFile, resolveRepoPath } from "./path-safety.js";
import type {
  DeleteFileInput,
  DeleteFileResult,
  IpcRuntimeLike,
  ReadFileInput,
  ReadFileResult,
  RenameFileInput,
  RenameFileResult,
  WriteFileInput,
  WriteFileResult,
} from "../shared/types.js";

const maxFileSizeBytes = 5 * 1024 * 1024;

export async function readLocalProjectFile(runtime: IpcRuntimeLike, input: ReadFileInput): Promise<ReadFileResult> {
  try {
    const repoPath = localPathFromProjectUri(input.projectUri);
    const config = await getConfiguredRoots(runtime);
    const safeRepo = await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects);
    const filePath = await resolveReadableRepoFile(safeRepo.repoPath, config.configuredRoots, input.relativePath, config.configuredProjects);
    const stat = await fs.stat(filePath);
    if (stat.size > maxFileSizeBytes) {
      return { ok: false, reason: "too-large", message: `File exceeds ${formatBytes(maxFileSizeBytes)} limit (${formatBytes(stat.size)})` };
    }
    const buffer = await fs.readFile(filePath);
    if (containsBinaryBytes(buffer)) {
      return { ok: false, reason: "binary", message: "File appears to be binary" };
    }
    return { ok: true, content: buffer.toString("utf8"), size: stat.size, relativePath: input.relativePath };
  } catch (error) {
    return classifyFileError(error);
  }
}

export async function writeLocalProjectFile(runtime: IpcRuntimeLike, input: WriteFileInput): Promise<WriteFileResult> {
  try {
    if (typeof input.content !== "string") {
      return { ok: false, reason: "io-error", message: "Content must be a string" };
    }
    const byteSize = Buffer.byteLength(input.content, "utf8");
    if (byteSize > maxFileSizeBytes) {
      return { ok: false, reason: "too-large", message: `Content exceeds ${formatBytes(maxFileSizeBytes)} limit` };
    }
    const repoPath = localPathFromProjectUri(input.projectUri);
    const config = await getConfiguredRoots(runtime);
    const safeRepo = await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects);
    const filePath = await resolveReadableRepoFile(safeRepo.repoPath, config.configuredRoots, input.relativePath, config.configuredProjects);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.content, "utf8");
    return { ok: true, size: byteSize, relativePath: input.relativePath };
  } catch (error) {
    return classifyFileError(error);
  }
}

export async function deleteLocalProjectFile(runtime: IpcRuntimeLike, input: DeleteFileInput): Promise<DeleteFileResult> {
  try {
    const repoPath = localPathFromProjectUri(input.projectUri);
    const config = await getConfiguredRoots(runtime);
    const safeRepo = await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects);
    const filePath = await resolveReadableRepoFile(safeRepo.repoPath, config.configuredRoots, input.relativePath, config.configuredProjects);
    await fs.rm(filePath, { recursive: true });
    return { ok: true, relativePath: input.relativePath };
  } catch (error) {
    return classifyFileError(error);
  }
}

export async function renameLocalProjectFile(runtime: IpcRuntimeLike, input: RenameFileInput): Promise<RenameFileResult> {
  try {
    const repoPath = localPathFromProjectUri(input.projectUri);
    const config = await getConfiguredRoots(runtime);
    const safeRepo = await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects);
    const filePath = await resolveReadableRepoFile(safeRepo.repoPath, config.configuredRoots, input.relativePath, config.configuredProjects);
    const dir = path.dirname(filePath);
    const newPath = path.join(dir, input.newName);
    const newRelativePath = path.relative(safeRepo.repoPath, newPath).split(path.sep).join("/");
    // Verify new path is still inside repo
    await resolveReadableRepoFile(safeRepo.repoPath, config.configuredRoots, newRelativePath, config.configuredProjects).catch(() => {
      // resolveReadableRepoFile throws if file doesn't exist; we just need the path check
    });
    const realNew = path.resolve(dir, input.newName);
    if (!realNew.startsWith(safeRepo.repoPath)) {
      return { ok: false, reason: "unsafe-path", message: "New name resolves outside project" };
    }
    try { await fs.stat(newPath); return { ok: false, reason: "already-exists", message: "A file with that name already exists" }; } catch {}
    await fs.rename(filePath, newPath);
    return { ok: true, relativePath: input.relativePath, newRelativePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string } | null)?.code;
    if (code === "ENOENT") return { ok: false, reason: "not-found", message };
    if (code === "EACCES" || code === "EPERM") return { ok: false, reason: "permission", message };
    if (message.toLowerCase().includes("unsafe") || message.toLowerCase().includes("outside")) return { ok: false, reason: "unsafe-path", message };
    return { ok: false, reason: "io-error", message };
  }
}

function containsBinaryBytes(buffer: Buffer): boolean {
  const inspectLength = Math.min(buffer.length, 8192);
  for (let index = 0; index < inspectLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

function classifyFileError(error: unknown): { ok: false; reason: "not-found" | "permission" | "unsafe-path" | "io-error"; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code;
  const lower = message.toLowerCase();
  let reason: "not-found" | "permission" | "unsafe-path" | "io-error";
  if (code === "ENOENT") reason = "not-found";
  else if (code === "EACCES" || code === "EPERM") reason = "permission";
  else if (lower.includes("unsafe") || lower.includes("outside")) reason = "unsafe-path";
  else reason = "io-error";
  return { ok: false, reason, message };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { maxFileSizeBytes };
