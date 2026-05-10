export type WorkflowProjectCandidate = {
  id: string;
  name: string;
  path: string;
  rootPath: string;
  iconSources?: Array<{ kind: "local" | "favicon"; url: string; label: string }>;
  services?: Array<{ id: string; label: string; command: string; script: string; cwd: string }>;
  dirtyWorktree?: boolean | null;
};

export type WorkflowProjectTerminalActivityState = "working" | "idle";

export type WorkflowTerminalActivityTab = {
  activityState: "idle" | "working" | "done";
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
  return data.replace(/\u001b\[(?:I|O)/g, "").length > 0;
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
  candidate: Pick<WorkflowProjectCandidate, "id" | "path">,
  statesByProjectId: Record<string, WorkflowProjectTerminalActivityState>,
): WorkflowProjectTerminalActivityState | null {
  return statesByProjectId[candidate.id] ?? statesByProjectId[candidate.path] ?? null;
}

export function firstHttpUrl(data: string): string | null {
  const text = data.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, " ");
  const urls = [...text.matchAll(/https?:\/\/[^\s'"<>）)]+/gu)].map((match) => match[0]).filter(Boolean);
  return urls.find((url) => isLocalBrowserUrl(url)) ?? urls[0] ?? null;
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
