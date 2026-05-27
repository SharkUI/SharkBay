export type WorkflowProjectCandidate = {
  id: string;
  uri: string;
  name: string;
  providerId: string;
  providerKind: "local" | "ssh" | "container" | "wsl";
  displayPath: string;
  rootUri: string;
  iconSources?: Array<{ kind: "local" | "favicon"; url: string; label: string }>;
  services?: Array<{ id: string; label: string; command: string; script: string; cwdUri: string }>;
  dirtyWorktree?: boolean | null;
};

export type WorkflowProjectTerminalActivityState = "working" | "idle";
export type WorkflowTerminalActivityState = "idle" | "working" | "done";
export type WorkflowCodeGraphStatusState = "disabled" | "unsupported" | "not-installed" | "uninitialized" | "stale" | "indexed" | "error";

export type WorkflowTerminalActivityTab = {
  activityState: WorkflowTerminalActivityState;
  session: { service?: unknown };
};

export type WorkflowTerminalActivitySpace = {
  projectId: string;
  tabs: WorkflowTerminalActivityTab[];
};

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

export function shouldResetTerminalObservationForInput(data: string): boolean {
  return data.replace(/\u001b\[(?:I|O|\?1004[hl])/g, "").length > 0;
}

export function projectTerminalActivityStates(
  spaces: Iterable<WorkflowTerminalActivitySpace>,
): Record<string, WorkflowProjectTerminalActivityState> {
  const nextStates: Record<string, WorkflowProjectTerminalActivityState> = {};
  for (const space of spaces) {
    const activityTabs = space.tabs.filter((tab) => !tab.session.service);
    if (activityTabs.some((tab) => tab.activityState === "working")) {
      nextStates[space.projectId] = "working";
    } else if (activityTabs.some((tab) => tab.activityState === "done")) {
      nextStates[space.projectId] = "idle";
    }
  }
  return nextStates;
}

export function terminalActivityForCandidate(
  candidate: Pick<WorkflowProjectCandidate, "id" | "uri">,
  statesByProjectId: Record<string, WorkflowProjectTerminalActivityState>,
): WorkflowProjectTerminalActivityState | null {
  return statesByProjectId[candidate.id] ?? statesByProjectId[candidate.uri] ?? null;
}

export function terminalActivityAfterQuiet(activityState: WorkflowTerminalActivityState): WorkflowTerminalActivityState {
  return activityState === "working" ? "done" : "idle";
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
