import path from "node:path";
import type { ExecutionTargetKind } from "../shared/types.js";

export type ParsedProjectUri =
  | { kind: "local"; path: string; targetId: "local" }
  | { kind: "container" | "wsl"; uri: string; targetId: string };

export function parseProjectUri(projectUri: string): ParsedProjectUri {
  if (projectUri.startsWith("local:")) {
    const localPath = decodeURI(projectUri.slice("local:".length));
    if (!path.isAbsolute(localPath)) {
      throw new Error("Local project URI must contain an absolute path");
    }
    return { kind: "local", path: localPath, targetId: "local" };
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
  return "local";
}

export function toLocalProjectUri(projectPath: string): string {
  return `local:${encodeURI(path.resolve(projectPath))}`;
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
