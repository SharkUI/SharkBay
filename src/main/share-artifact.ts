import { app } from "electron";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getLocalHarnessIdentity } from "./harness.js";

export type ShareArtifactInput = { fileUrl: string };
export type ShareArtifactResult = { url: string };

const MAX_BYTES = 5 * 1024 * 1024;

function shareApiBase(): string {
  return (process.env.SHARKBAY_SHARE_API || "https://share.sharkbay.xyz").replace(/\/+$/, "");
}

/** repoRoot is the path before the `.sharkbay` segment, e.g. /repo/.sharkbay/... */
function repoRootFromArtifactPath(filePath: string): string | null {
  const marker = `${sep()}.sharkbay${sep()}`;
  const index = filePath.indexOf(marker);
  return index >= 0 ? filePath.slice(0, index) : null;
}

function sep(): string {
  return process.platform === "win32" ? "\\" : "/";
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const text = (match[1] ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function localPathFromFileUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== "file:") return null;
    return fileURLToPath(url);
  } catch {
    return null;
  }
}

/**
 * Reads the local HTML page the user is viewing, attaches the repo's SharkBay
 * identity, and uploads it to the share service. Runs in the main process so the
 * file:// page never has to make a cross-origin request.
 */
export async function shareLocalArtifact(input: ShareArtifactInput): Promise<ShareArtifactResult> {
  const filePath = localPathFromFileUrl(input.fileUrl);
  if (!filePath || !/\.html?$/i.test(filePath)) {
    throw new Error("Only local .html pages can be shared.");
  }

  const repoRoot = repoRootFromArtifactPath(filePath);
  if (!repoRoot) {
    throw new Error("This page is not a SharkBay artifact or site page.");
  }

  const identity = await getLocalHarnessIdentity(repoRoot);
  if (identity.githubUserId === undefined || !identity.machineId) {
    throw new Error("Could not resolve this project's SharkBay identity (githubUserId / machineId).");
  }

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    throw new Error("The page file could not be found.");
  }
  if (info.size > MAX_BYTES) {
    throw new Error(`The page is too large to share (max ${Math.floor(MAX_BYTES / (1024 * 1024))} MiB).`);
  }

  const html = await readFile(filePath, "utf-8");

  const response = await fetch(`${shareApiBase()}/api/share`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      html,
      title: extractTitle(html),
      githubUserId: String(identity.githubUserId),
      githubLogin: identity.githubLogin,
      machineId: identity.machineId,
      appVersion: app.getVersion(),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { url?: string; error?: string; resetAt?: string }
    | null;

  if (!response.ok || !payload?.url) {
    throw new Error(shareErrorMessage(response.status, payload?.error, payload?.resetAt));
  }

  return { url: payload.url };
}

function shareErrorMessage(status: number, error?: string, resetAt?: string): string {
  switch (error) {
    case "rate_limited":
      return resetAt
        ? `Upload limit reached. Try again after ${new Date(resetAt).toLocaleString()}.`
        : "Upload limit reached. Try again later.";
    case "artifact_too_large":
      return "The page is too large to share.";
    case "unauthorized":
      return "The share service rejected this request (server requires a token).";
    case "storage_not_configured":
      return "The share service is not configured yet.";
    default:
      return `Share failed (HTTP ${status}).`;
  }
}
