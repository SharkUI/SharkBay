export type WorkflowProjectCandidate = {
  id: string;
  uri: string;
  name: string;
  providerId: string;
  providerKind: "local" | "container" | "wsl";
  displayPath: string;
  rootUri: string;
  iconSources?: Array<{ kind: "local" | "favicon"; url: string; label: string }>;
  services?: Array<{ id: string; label: string; command: string; script: string; cwdUri: string }>;
  dirtyWorktree?: boolean | null;
};

export type WorkflowProjectActivityState = "working" | "idle" | "attention";
export type WorkflowCodeGraphStatusState = "disabled" | "unsupported" | "not-installed" | "uninitialized" | "stale" | "indexed" | "error";

export function validTerminalResizeDimensions(cols: number | null | undefined, rows: number | null | undefined): boolean {
  return typeof cols === "number"
    && typeof rows === "number"
    && Number.isFinite(cols)
    && Number.isFinite(rows)
    && Math.floor(cols) >= 1
    && Math.floor(rows) >= 1;
}

export function resolveSelectedCandidate(
  candidates: WorkflowProjectCandidate[],
  selectedId: string | null,
): WorkflowProjectCandidate | null {
  return candidates.find((item) => item.id === selectedId) ?? candidates[0] ?? null;
}

export function projectActivityForCandidate(
  candidate: Pick<WorkflowProjectCandidate, "id" | "uri">,
  statesByProjectId: Record<string, WorkflowProjectActivityState>,
): WorkflowProjectActivityState | null {
  return statesByProjectId[candidate.id] ?? statesByProjectId[candidate.uri] ?? null;
}

export function shouldEnsureCodeGraphForSelection(input: {
  providerKind: WorkflowProjectCandidate["providerKind"];
  isGitManaged: boolean | null;
  statusState: WorkflowCodeGraphStatusState;
}): boolean {
  return input.providerKind === "local"
    && input.isGitManaged === true
    && input.statusState === "uninitialized";
}

export function firstHttpUrl(data: string): string | null {
  const text = stripTerminalControlSequences(data);
  const urls = [...text.matchAll(/https?:\/\/[^\s'"<>）)]+/gu)]
    .map((match) => ({ url: match[0], end: (match.index ?? 0) + match[0].length }))
    .filter((match) => isCompleteHttpUrlMatch(text, match) && isHttpUrl(match.url));
  return urls.find((match) => isLocalBrowserUrl(match.url))?.url ?? urls[0]?.url ?? null;
}

export type ServiceUrlObservation = {
  output: string;
  url: string | null;
};

const serviceUrlObservationLimit = 4096;

export function observeServiceUrl(previousOutput: string | null | undefined, data: string): ServiceUrlObservation {
  const combined = `${previousOutput ?? ""}${data}`;
  const output = combined.length > serviceUrlObservationLimit ? combined.slice(-serviceUrlObservationLimit) : combined;
  return { output, url: firstHttpUrl(output) };
}

export function shouldKeepCurrentServiceUrl(currentUrl: string | null, nextUrl: string): boolean {
  return Boolean(currentUrl && isLocalBrowserUrl(currentUrl) && !isLocalBrowserUrl(nextUrl));
}

export function formatSessionModelName(model: string): string {
  const normalized = model.trim();
  if (!normalized) return model;

  const lower = normalized.toLowerCase();
  if (lower.includes("opus")) return "Opus";
  if (lower.includes("sonnet")) return "Sonnet";
  if (lower.includes("haiku")) return "Haiku";
  if (lower.includes("gemini")) return normalized.split("/").pop()?.replace(/^models-/, "") ?? normalized;
  if (/^(?:gpt|o\d|codex)(?:[-.][\w.]+)*$/iu.test(normalized)) return normalized;

  const last = normalized.split("/").pop() ?? normalized;
  return last.length > 16 ? last.slice(0, 16) : last;
}

export function isLocalBrowserUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

function stripTerminalControlSequences(data: string): string {
  return data
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function isCompleteHttpUrlMatch(text: string, match: { url: string; end: number }): boolean {
  if (match.url.endsWith(":")) return false;
  if (match.end < text.length) return true;
  if (match.url.endsWith("/")) return true;
  return !/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):?$/iu.test(match.url);
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
