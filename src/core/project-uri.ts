import path from "node:path";
import type { ExecutionTargetKind } from "../shared/types.js";

export type ParsedProjectUri =
  | { kind: "local"; path: string; targetId: "local" }
  | { kind: "ssh"; uri: string; machineId: string; path: string; targetId: string }
  | { kind: "container" | "wsl"; uri: string; targetId: string };

export function parseProjectUri(projectUri: string): ParsedProjectUri {
  if (projectUri.startsWith("local:")) {
    const localPath = decodeURI(projectUri.slice("local:".length));
    if (!path.isAbsolute(localPath)) {
      throw new Error("Local project URI must contain an absolute path");
    }
    return { kind: "local", path: localPath, targetId: "local" };
  }
  if (projectUri.startsWith("ssh://")) {
    const withoutScheme = projectUri.slice("ssh://".length);
    const slashIndex = withoutScheme.indexOf("/");
    const machineId = slashIndex >= 0 ? decodeURIComponent(withoutScheme.slice(0, slashIndex)) : "";
    const remotePath = slashIndex >= 0 ? decodeURI(withoutScheme.slice(slashIndex)) : "";
    if (!machineId || !remotePath.startsWith("/")) {
      throw new Error("SSH project URI must contain a machine id and absolute path");
    }
    return { kind: "ssh", uri: projectUri, machineId, path: remotePath, targetId: machineId };
  }
  if (projectUri.startsWith("container://")) {
    return parseOpaqueTargetUri(projectUri, "container");
  }
  if (projectUri.startsWith("wsl://")) {
    return parseOpaqueTargetUri(projectUri, "wsl");
  }
  throw new Error("Unsupported project URI");
}

export function executionTargetKindForUri(projectUri: string): ExecutionTargetKind {
  return parseProjectUri(projectUri).kind;
}

export function executionTargetKindForTargetId(targetId: string): ExecutionTargetKind {
  if (targetId === "local") return "local";
  if (targetId.startsWith("container:")) return "container";
  if (targetId.startsWith("wsl:")) return "wsl";
  return "ssh";
}

export function toLocalProjectUri(projectPath: string): string {
  return `local:${encodeURI(path.resolve(projectPath))}`;
}

export function toSshProjectUri(machineId: string, projectPath: string): string {
  const normalizedPath = projectPath.trim();
  if (!machineId.trim()) {
    throw new Error("Remote machine id is required");
  }
  if (!normalizedPath.startsWith("/")) {
    throw new Error("Remote project path must be absolute");
  }
  return `ssh://${encodeURIComponent(machineId.trim())}${encodeURI(normalizedPath)}`;
}

export function localPathFromProjectUri(projectUri: string): string {
  const parsed = parseProjectUri(projectUri);
  if (parsed.kind !== "local") {
    throw new Error("Project URI is not handled by the local provider");
  }
  return parsed.path;
}

export function displayPathFromProjectUri(projectUri: string): string {
  const parsed = parseProjectUri(projectUri);
  if (parsed.kind === "local") return parsed.path;
  return parsed.uri;
}

function parseOpaqueTargetUri(projectUri: string, kind: "container" | "wsl"): ParsedProjectUri {
  const withoutScheme = projectUri.slice(`${kind}://`.length);
  const slashIndex = withoutScheme.indexOf("/");
  const targetId = slashIndex >= 0 ? decodeURIComponent(withoutScheme.slice(0, slashIndex)) : decodeURIComponent(withoutScheme);
  if (!targetId) {
    throw new Error(`${kind} project URI must contain a target id`);
  }
  return { kind, uri: projectUri, targetId };
}
