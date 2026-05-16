import path from "node:path";

export type ParsedProjectUri =
  | { kind: "local"; path: string }
  | { kind: "ssh"; uri: string; machineId: string; path: string }
  | { kind: "container" | "wsl"; uri: string };

export function toLocalProjectUri(projectPath: string): string {
  return `local:${encodeURI(path.resolve(projectPath))}`;
}

export function parseProjectUri(projectUri: string): ParsedProjectUri {
  if (projectUri.startsWith("local:")) {
    const localPath = decodeURI(projectUri.slice("local:".length));
    if (!path.isAbsolute(localPath)) {
      throw new Error("Local project URI must contain an absolute path");
    }
    return { kind: "local", path: localPath };
  }
  if (projectUri.startsWith("ssh://")) {
    const withoutScheme = projectUri.slice("ssh://".length);
    const slashIndex = withoutScheme.indexOf("/");
    const machineId = slashIndex >= 0 ? decodeURIComponent(withoutScheme.slice(0, slashIndex)) : "";
    const remotePath = slashIndex >= 0 ? decodeURI(withoutScheme.slice(slashIndex)) : "";
    if (!machineId || !remotePath.startsWith("/")) {
      throw new Error("SSH project URI must contain a machine id and absolute path");
    }
    return { kind: "ssh", uri: projectUri, machineId, path: remotePath };
  }
  if (projectUri.startsWith("container://")) return { kind: "container", uri: projectUri };
  if (projectUri.startsWith("wsl://")) return { kind: "wsl", uri: projectUri };
  throw new Error("Unsupported project URI");
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
  return parsed.kind === "local" ? parsed.path : parsed.uri;
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
