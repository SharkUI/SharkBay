import { promises as fs } from "node:fs";
import path from "node:path";
import { getConfiguredRoots } from "./config.js";
import { localPathFromProjectUri } from "../core/project-uri.js";
import { resolveReadableRepoFile, resolveRepoPath } from "./path-safety.js";
import type {
  IpcRuntimeLike,
  ReadFileInput,
  ReadFileResult,
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
    await fs.writeFile(filePath, input.content, "utf8");
    return { ok: true, size: byteSize, relativePath: input.relativePath };
  } catch (error) {
    return classifyFileError(error);
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
