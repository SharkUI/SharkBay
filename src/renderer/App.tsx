import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import defaultProjectIconUrl from "./assets/shark-fin.png";
import { CodeEditor } from "./code-editor";
import type {
  AgentCli,
  AgentProjectStatusEvent,
  AppConfig,
  AppearanceTheme,
  BrowserBounds,
  BrowserSession,
  BrowserUpdateEvent,
  DiagnosticsSnapshot,
  InstallLogEvent,
  InstallRecipe,
  InstallToolResult,
  MachineProfile,
  PluginSummary,
  ProjectCandidate,
  ProjectDetail,
  ProjectFileTreeItem,
  ProjectProfile,
  ProjectSummary,
  RemoteMachine,
  RemoteMachineInput,
  RemoteMachineTestResult,
  RemoteDetectedPort,
  RemotePortForward,
  RootRecord,
  ScanResult,
  SharkBayBridge,
  TaskViewModel,
  TeamworkStatus,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalCreateInput,
  TerminalSession,
  TerminalUpdateEvent,
} from "./types";
import {
  firstHttpUrl,
  projectTerminalActivityStates,
  resolveSelectedCandidate,
  shouldKeepCurrentServiceUrl,
  shouldResetTerminalObservationForInput,
  terminalActivityForCandidate,
  validTerminalResizeDimensions,
} from "./workflow";
import type { WorkflowProjectTerminalActivityState } from "./workflow";

type View = "dashboard" | "settings";
type DetailTab = "team" | "git" | "stack" | "files" | "forwards";
type SettingsSection = "local-machine" | "appearance" | "extensions" | "diagnostics" | `remote-machine:${string}`;

const remoteConnectionMethods: Array<{
  id: RemoteMachineInput["authMode"];
  label: string;
  description: string;
}> = [
  {
    id: "system-ssh-config",
    label: "Use my SSH config",
    description: "Best if you already run ssh server-name in Terminal.",
  },
  {
    id: "ssh-agent",
    label: "Enter server address",
    description: "Use host, port, username, and optionally a saved password.",
  },
  {
    id: "key-file",
    label: "Use a specific key file",
    description: "Choose this when the server needs a particular private key path.",
  },
];

type Toast = {
  tone: "info" | "error" | "success";
  message: string;
};

type RefreshOptions = {
  showToast?: boolean;
  setBusy?: boolean;
};

type Disposable = {
  dispose: () => void;
};

type TerminalActivityState = "idle" | "working" | "done";
type ProjectTerminalActivityState = WorkflowProjectTerminalActivityState;

type TerminalShellTab = {
  kind: "terminal";
  session: TerminalSession;
  terminal: XTerm;
  fitAddon: FitAddon;
  disposables: Disposable[];
  activityState: TerminalActivityState;
  outputBurstStartedAt: number | null;
};

type BrowserTab = {
  kind: "browser";
  browser: BrowserSession;
  addressValue: string;
};

type EditorTab = {
  kind: "editor";
  id: string;
  projectUri: string;
  relativePath: string;
  name: string;
  content: string;
  savedContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  readOnly: boolean;
};

type TerminalTab = TerminalShellTab | BrowserTab | EditorTab;
type ActiveTerminalTabKind = TerminalTab["kind"] | null;

type TerminalSpace = {
  projectId: string;
  projectName: string;
  uri: string;
  displayPath: string;
  tabs: TerminalTab[];
  activeId: string | null;
  serviceUrl: string | null;
};

type TerminalPaneHandle = {
  openFileInEditor: (projectUri: string, projectName: string, relativePath: string) => Promise<void>;
  openGitDiff: (projectUri: string, projectName: string, relativePath: string) => Promise<void>;
  openBrowserTab: (projectUri: string, projectName: string, initialUrl: string) => Promise<void>;
};

type AgentStatusByProjectPath = Record<string, string>;

const minProjectColumnWidth = 216;
const minDetailColumnWidth = 340;
const minTerminalColumnWidth = 420;
const terminalWorkingThresholdMs = 5000;
const terminalQuietDoneMs = 5000;
const defaultProjectColumnWidth = minProjectColumnWidth;
const defaultDetailColumnWidth = minDetailColumnWidth;
const resizerColumnWidth = 12;
const columnResizeStep = 40;
const detailColumnStorageKey = "sharkbay.detailColumnWidth.v2";
const projectColumnStorageKey = "sharkbay.projectColumnWidth.v2";
const detailTabs: Array<{ id: DetailTab; label: string; remoteOnly?: boolean; localOnly?: boolean }> = [
  { id: "team", label: "Team", localOnly: true },
  { id: "git", label: "Git" },
  { id: "stack", label: "Stack" },
  { id: "files", label: "Files" },
  { id: "forwards", label: "Port forwards", remoteOnly: true },
];
const appearanceThemes: Array<{ id: AppearanceTheme; label: string }> = [
  { id: "morning", label: "Morning" },
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
];

const terminalThemes: Record<AppearanceTheme, NonNullable<ConstructorParameters<typeof XTerm>[0]>["theme"]> = {
  day: {
    background: "#f7f1e4",
    foreground: "#263235",
    cursor: "#2d5860",
    selectionBackground: "#d8cab1",
    black: "#1f2528",
    blue: "#2d6474",
    cyan: "#367f86",
    green: "#4c845d",
    magenta: "#7a677f",
    red: "#b85f51",
    white: "#fffdfa",
    yellow: "#9a6b16",
  },
  night: {
    background: "#101719",
    foreground: "#d9e5df",
    cursor: "#93d7a4",
    selectionBackground: "#38575d",
    black: "#0d1213",
    blue: "#82b7c4",
    cyan: "#8eced2",
    green: "#93d7a4",
    magenta: "#c6a7d8",
    red: "#e58b7e",
    white: "#edf2ef",
    yellow: "#d7bd78",
  },
  morning: {
    background: "#101719",
    foreground: "#d9e5df",
    cursor: "#93d7a4",
    selectionBackground: "#38575d",
    black: "#000000",
    red: "#cd3131",
    green: "#0dbc79",
    yellow: "#e5e510",
    blue: "#2472c8",
    magenta: "#bc3fbc",
    cyan: "#11a8cd",
    white: "#e5e5e5",
    brightBlack: "#666666",
    brightRed: "#f14c4c",
    brightGreen: "#23d18b",
    brightYellow: "#f5f543",
    brightBlue: "#3b8eea",
    brightMagenta: "#d670d6",
    brightCyan: "#29b8db",
    brightWhite: "#e5e5e5",
  },
};

function getBridge(): SharkBayBridge {
  if (typeof window === "undefined" || !window.sharkBay) {
    throw new Error("The SharkBay preload API is not available.");
  }
  return window.sharkBay;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAppConfig(value: unknown): value is AppConfig {
  return Boolean(value && typeof value === "object" && "configuredRoots" in value);
}

function normalizeAppearanceTheme(value: unknown): AppearanceTheme {
  if (value === "morning" || value === "classic") return "morning";
  return value === "night" ? "night" : "day";
}

function normalizeRoots(raw: AppConfig | RootRecord[] | string[] | undefined): RootRecord[] {
  if (!raw) return [];
  if (isAppConfig(raw)) return raw.configuredRoots.map((root) => ({ path: root }));
  return raw.map((root) => {
    if (typeof root === "string") return { path: root };
    return { ...root, path: root.path || root.inputPath || "", unavailable: root.unavailable ?? root.available === false };
  });
}

function normalizeScan(raw: ScanResult | ProjectCandidate[]): ScanResult {
  if (Array.isArray(raw)) return { candidates: raw };
  return { ...raw, candidates: raw.candidates ?? [] };
}

async function listRoots(): Promise<RootRecord[]> {
  const bridge = getBridge();
  const handler = bridge.config?.listRoots;
  if (!handler) throw new Error("Root listing is not exposed by the preload API.");
  return normalizeRoots(await handler());
}

async function updateAppearanceTheme(theme: AppearanceTheme): Promise<AppConfig> {
  const handler = getBridge().config?.setAppearanceTheme;
  if (!handler) throw new Error("Appearance theme settings are not exposed by the preload API.");
  return handler({ theme });
}

async function addRoot(path: string): Promise<void> {
  const handler = getBridge().config?.addRoot;
  if (!handler) throw new Error("Root add is not exposed by the preload API.");
  await handler({ path, rootPath: path });
}

async function removeRoot(path: string): Promise<void> {
  const handler = getBridge().config?.removeRoot;
  if (!handler) throw new Error("Root remove is not exposed by the preload API.");
  await handler({ path, rootPath: path });
}

async function addProject(path: string): Promise<void> {
  const handler = getBridge().config?.addProject;
  if (!handler) throw new Error("Project add is not exposed by the preload API.");
  await handler({ path });
}

async function addProjectUri(uri: string): Promise<void> {
  const handler = getBridge().config?.addProject;
  if (!handler) throw new Error("Project add is not exposed by the preload API.");
  await handler({ uri });
}

async function removeProject(pathOrUri: string): Promise<void> {
  const handler = getBridge().config?.removeProject;
  if (!handler) throw new Error("Project remove is not exposed by the preload API.");
  await handler(pathOrUri.startsWith("ssh://") ? { uri: pathOrUri } : { path: pathOrUri });
}

async function renameProjectAlias(uri: string, name: string): Promise<void> {
  const handler = getBridge().config?.renameProject;
  if (!handler) throw new Error("Project rename is not exposed by the preload API.");
  await handler({ uri, name });
}

async function addRemoteMachine(input: RemoteMachineInput): Promise<AppConfig> {
  const handler = getBridge().config?.addRemoteMachine;
  if (!handler) throw new Error("Remote machine add is not exposed by the preload API.");
  return handler(input);
}

async function removeRemoteMachine(id: string): Promise<AppConfig> {
  const handler = getBridge().config?.removeRemoteMachine;
  if (!handler) throw new Error("Remote machine remove is not exposed by the preload API.");
  return handler({ id });
}

async function testRemoteMachine(input: { id: string } | RemoteMachineInput): Promise<RemoteMachineTestResult> {
  const handler = getBridge().config?.testRemoteMachine;
  if (!handler) throw new Error("Remote machine connection testing is not exposed by the preload API.");
  return handler(input);
}

async function pickAndAddProjects(): Promise<string[]> {
  const picker = getBridge().config?.pickProjectFolder;
  if (!picker) throw new Error("Folder picker is not exposed by the preload API.");
  const result = await picker();
  if (result.cancelled || result.paths.length === 0) return [];
  const addHandler = getBridge().config?.addProject;
  if (!addHandler) throw new Error("Project add is not exposed by the preload API.");
  for (const p of result.paths) {
    await addHandler({ path: p });
  }
  return result.paths;
}

async function scanProjects(): Promise<ScanResult> {
  const handler = getBridge().projects?.scan;
  if (!handler) throw new Error("Project scanning is not exposed by the preload API.");
  return normalizeScan(await handler());
}

async function getProjectDetail(candidate: ProjectCandidate): Promise<ProjectDetail> {
  const handler = getBridge().projects?.getDetail;
  if (!handler) throw new Error("Project detail is not exposed by the preload API.");
  return handler({ projectUri: candidate.uri });
}

async function listProjectFiles(project: ProjectCandidate | ProjectDetail, directoryPath?: string) {
  const handler = getBridge().projects?.listFiles;
  if (!handler) throw new Error("Project files are not exposed by the preload API.");
  return handler({ projectUri: project.uri, directoryPath });
}

async function createTerminal(
  cwdUri: string,
  title?: string,
  options: Pick<TerminalCreateInput, "agentId" | "initialCommand" | "service"> = {},
): Promise<TerminalSession> {
  const handler = getBridge().terminal?.create;
  if (!handler) throw new Error("Terminal sessions are not exposed by the preload API.");
  return handler({ cwdUri, title, ...options });
}

async function sendTerminalInput(sessionId: string, data: string): Promise<void> {
  const handler = getBridge().terminal?.input;
  if (!handler) throw new Error("Terminal input is not exposed by the preload API.");
  await handler({ sessionId, data });
}

async function resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
  if (!validTerminalResizeDimensions(cols, rows)) return;
  const handler = getBridge().terminal?.resize;
  if (!handler) throw new Error("Terminal resize is not exposed by the preload API.");
  await handler({ sessionId, cols: Math.floor(cols), rows: Math.floor(rows) });
}

async function closeTerminal(sessionId: string): Promise<void> {
  const handler = getBridge().terminal?.close;
  if (!handler) throw new Error("Terminal close is not exposed by the preload API.");
  await handler({ sessionId });
}

async function createBrowser(initialUrl: string): Promise<BrowserSession> {
  const handler = getBridge().browser?.create;
  if (!handler) throw new Error("Browser sessions are not exposed by the preload API.");
  return handler({ initialUrl, bounds: hiddenBrowserBounds() });
}

async function navigateBrowser(browserId: string, url: string): Promise<BrowserSession> {
  const handler = getBridge().browser?.navigate;
  if (!handler) throw new Error("Browser navigation is not exposed by the preload API.");
  return handler({ browserId, url });
}

async function resizeBrowser(browserId: string, bounds: BrowserBounds, active = false): Promise<void> {
  const handler = getBridge().browser?.resize;
  if (!handler) throw new Error("Browser resize is not exposed by the preload API.");
  await handler({ browserId, bounds, active });
}

async function closeBrowser(browserId: string): Promise<void> {
  const handler = getBridge().browser?.close;
  if (!handler) throw new Error("Browser close is not exposed by the preload API.");
  await handler({ browserId });
}

async function browserAction(action: "goBack" | "goForward" | "reload", browserId: string): Promise<void> {
  const handler = getBridge().browser?.[action];
  if (!handler) throw new Error("Browser controls are not exposed by the preload API.");
  await handler({ browserId });
}

function editorCommandFor(relativePath: string): string {
  const quotedPath = shellQuote(relativePath);
  return `if command -v vim >/dev/null 2>&1; then vim -- ${quotedPath}; else nano -- ${quotedPath}; fi`;
}

function gitDiffCommandFor(relativePath: string): string {
  const quotedPath = shellQuote(relativePath);
  return `git --no-pager diff -- ${quotedPath}`;
}

function explainEarlyTerminalExit(tab: TerminalShellTab, event: TerminalExitEvent): string | null {
  const exitCode = event.exitCode;
  if (exitCode === null || exitCode === 0) return null;
  const createdAt = Date.parse(tab.session.createdAt);
  if (Number.isFinite(createdAt) && Date.now() - createdAt > 5000) return null;
  const isRemote = tab.session.cwdUri.startsWith("ssh://");
  if (exitCode === 255 && isRemote) return "SSH connection failed. Check the remote machine is reachable and your auth still works.";
  if (exitCode === 2) return isRemote
    ? "Shell exited immediately. The project path may not exist on the remote — re-add the project with the correct path."
    : "Shell exited immediately (exit 2). Check the project directory exists and is readable.";
  if (exitCode === 127) return "Command not found. Check the shell or the initial command.";
  if (exitCode === 126) return "Command not executable. Check file permissions.";
  if (exitCode === 1) return "Shell exited with an error right after starting. See the terminal output for details.";
  return null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function storedColumnWidth(key: string, fallback: number, min: number): number {
  if (typeof window === "undefined") return fallback;
  const saved = Number(window.localStorage.getItem(key));
  return Number.isFinite(saved) && saved >= min ? saved : fallback;
}

function formatScanTime(value: string | null): string {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatHistoryTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const hasClock = /T|\d{1,2}:\d{2}/.test(value);
  return new Intl.DateTimeFormat("en", {
    year: "numeric", month: "2-digit", day: "2-digit",
    ...(hasClock ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  }).format(parsed);
}

function formatRelativeTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatHistoryTime(value);

  const diffSeconds = Math.round((parsed.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const [unit, secondsPerUnit] = units.find(([, seconds]) => absSeconds >= seconds) ?? ["second", 1];
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(diffSeconds / secondsPerUnit), unit);
}

function appearanceDescription(theme: AppearanceTheme): string {
  if (theme === "morning") return "Morning icon and original dark terminal";
  if (theme === "night") return "Night icon and dark colors";
  return "Day icon and colors";
}

function toRemoteProjectUri(machineId: string, remotePath: string): string {
  return `ssh://${encodeURIComponent(machineId)}${encodeURI(remotePath)}`;
}

function localPathFromCandidate(candidate: ProjectCandidate): string | null {
  if (candidate.providerKind !== "local" || !candidate.uri.startsWith("local:")) return null;
  try {
    return decodeURI(candidate.uri.slice("local:".length));
  } catch {
    return null;
  }
}

function remoteProjectLabel(uri: string, machines: RemoteMachine[]): string {
  const match = /^ssh:\/\/([^/]+)(\/.*)$/.exec(uri);
  if (!match) return uri;
  const machineId = decodeURIComponent(match[1] ?? "");
  const remotePath = decodeURI(match[2] ?? "");
  const machine = machines.find((item) => item.id === machineId);
  return `${machine?.label ?? machineId}:${remotePath}`;
}

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [roots, setRoots] = useState<RootRecord[]>([]);
  const [configuredProjects, setConfiguredProjects] = useState<string[]>([]);
  const [configuredRemoteProjects, setConfiguredRemoteProjects] = useState<string[]>([]);
  const [remoteMachines, setRemoteMachines] = useState<RemoteMachine[]>([]);
  const [projectAliases, setProjectAliases] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<ProjectCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>("day");
  const refreshInFlight = useRef(false);

  const bridgeAvailable = typeof window !== "undefined" && Boolean(window.sharkBay);

  const selectedCandidate = useMemo(() => resolveSelectedCandidate(candidates, selectedId), [candidates, selectedId]);

  async function refreshRoots() {
    setRoots(await listRoots());
  }

  async function refreshProjects(options: RefreshOptions = {}): Promise<{ candidates: ProjectCandidate[] }> {
    const setBusy = options.setBusy ?? true;
    if (setBusy) setLoading(true);
    setScanErrors([]);

    try {
      const bridge = getBridge();
      const configHandler = bridge.config?.listRoots;
      if (!configHandler) throw new Error("Root listing is not exposed by the preload API.");
      const [rootConfig, scan] = await Promise.all([configHandler(), scanProjects()]);
      const rootList = normalizeRoots(rootConfig);
      if (isAppConfig(rootConfig)) {
        setAppearanceTheme(normalizeAppearanceTheme(rootConfig.appearanceTheme));
        setConfiguredProjects(rootConfig.configuredProjects ?? []);
        setConfiguredRemoteProjects(rootConfig.configuredRemoteProjects ?? []);
        setRemoteMachines(rootConfig.configuredRemoteMachines ?? []);
        setProjectAliases(rootConfig.projectAliases ?? {});
      }
      const nextCandidates = scan.candidates ?? [];
      const normalizedRootErrors = normalizeRoots(scan.roots);
      const rootErrors = [
        ...(scan.errors ?? []),
        ...normalizedRootErrors.filter((r) => r.unavailable).map((root) => `${root.path}: ${root.error ?? "unavailable"}`),
      ];
      const nextRoots = scan.roots ? normalizeRoots(scan.roots) : rootList;

      setRoots(nextRoots);
      setCandidates(nextCandidates);
      setScanErrors(rootErrors);
      setLastScanAt(new Date().toISOString());
      setSelectedId((current) => {
        if (current && nextCandidates.some((c) => c.id === current)) return current;
        return nextCandidates[0]?.id ?? null;
      });
      return { candidates: nextCandidates };
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
      return { candidates };
    } finally {
      if (setBusy) setLoading(false);
    }
  }

  async function refreshDetail(candidate = selectedCandidate, options: RefreshOptions = {}) {
    if (!candidate) { setDetail(null); return; }
    try {
      const nextDetail = await getProjectDetail(candidate);
      setDetail(nextDetail);
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
      setDetail(null);
    }
  }

  async function refreshWorkspace(options: RefreshOptions = { showToast: true }) {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      await refreshProjects(options);
      if (selectedCandidate) await refreshDetail(selectedCandidate, options);
    } finally {
      refreshInFlight.current = false;
    }
  }

  useEffect(() => {
    if (!bridgeAvailable) return;
    void refreshProjects();
  }, [bridgeAvailable]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    const unsubscribe = getBridge().app?.onOpenSettings?.(() => setView("settings"));
    return () => unsubscribe?.();
  }, [bridgeAvailable]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    const timer = window.setInterval(() => {
      void refreshWorkspace({ showToast: false, setBusy: false });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [bridgeAvailable, selectedCandidate?.id]);

  useEffect(() => {
    setDetail(null);
    if (selectedCandidate) void refreshDetail(selectedCandidate);
  }, [selectedCandidate?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className="app-shell" data-theme={appearanceTheme}>
      <main className="workspace">
        <div className="workspace-body">
          <div aria-hidden={view !== "dashboard"} className={cx("view-surface", view !== "dashboard" && "is-hidden")}>
            <DashboardView
              appearanceTheme={appearanceTheme}
              bridgeAvailable={bridgeAvailable}
              detail={detail}
              filteredCandidates={candidates}
              isVisible={view === "dashboard"}
              loading={loading}
              remoteMachines={remoteMachines}
              scanErrors={scanErrors}
              selectedCandidate={selectedCandidate}
              setSelectedId={setSelectedId}
              setToast={setToast}
              onRefresh={refreshWorkspace}
              onOpenSettings={() => setView("settings")}
              onAddProject={async (pathOrUri) => { pathOrUri.startsWith("ssh://") ? await addProjectUri(pathOrUri) : await addProject(pathOrUri); await refreshProjects({ showToast: true }); }}
              onPickProject={async () => {
                const paths = await pickAndAddProjects();
                if (paths.length) {
                  setToast({ tone: "success", message: paths.length === 1 ? "Project added." : `${paths.length} projects added.` });
                  await refreshProjects({ showToast: false });
                }
              }}
              onRemoveProject={async (uri) => { await removeProject(uri); await refreshProjects({ showToast: true }); }}
              onRenameProject={async (uri, name) => { await renameProjectAlias(uri, name); await refreshProjects({ showToast: false }); }}
              projectAliases={projectAliases}
            />
          </div>
          {view === "settings" ? (
            <div className="view-surface settings-surface">
              <SettingsView
                appearanceTheme={appearanceTheme}
                roots={roots}
                configuredProjects={configuredProjects}
                configuredRemoteProjects={configuredRemoteProjects}
                remoteMachines={remoteMachines}
                bridgeAvailable={bridgeAvailable}
                lastScanAt={lastScanAt}
                loading={loading}
                candidates={candidates}
                scanErrors={scanErrors}
                setToast={setToast}
                onBack={() => setView("dashboard")}
                onScan={async () => { await refreshProjects({ showToast: true }); }}
                onAdd={async (path) => { await addRoot(path); await refreshRoots(); await refreshProjects({ showToast: true }); }}
                onRemove={async (path) => { await removeRoot(path); await refreshRoots(); await refreshProjects({ showToast: true }); }}
                onRemoveProject={async (path) => { await removeProject(path); await refreshProjects({ showToast: true }); }}
                onAddRemoteMachine={async (input) => {
                  const config = await addRemoteMachine(input);
                  setRemoteMachines(config.configuredRemoteMachines ?? []);
                  await refreshProjects({ showToast: false, setBusy: false });
                }}
                onRemoveRemoteMachine={async (id) => {
                  const config = await removeRemoteMachine(id);
                  setRemoteMachines(config.configuredRemoteMachines ?? []);
                }}
                onTestRemoteMachine={testRemoteMachine}
                onThemeChange={async (theme) => {
                  const config = await updateAppearanceTheme(theme);
                  setAppearanceTheme(normalizeAppearanceTheme(config.appearanceTheme));
                }}
              />
            </div>
          ) : null}
        </div>
      </main>
      {toast ? <ToastBanner toast={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

function ToastBanner({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div className={cx("toast-banner", `is-${toast.tone}`)} role="status" aria-live="polite">
      <span>{toast.message}</span>
      <button aria-label="Dismiss notification" type="button" onClick={onClose}>x</button>
    </div>
  );
}

function DashboardView({
  appearanceTheme,
  bridgeAvailable,
  detail,
  filteredCandidates,
  isVisible,
  loading,
  remoteMachines,
  projectAliases,
  scanErrors,
  selectedCandidate,
  setSelectedId,
  setToast,
  onRefresh,
  onOpenSettings,
  onAddProject,
  onPickProject,
  onRemoveProject,
  onRenameProject,
}: {
  appearanceTheme: AppearanceTheme;
  bridgeAvailable: boolean;
  detail: ProjectDetail | null;
  filteredCandidates: ProjectCandidate[];
  isVisible: boolean;
  loading: boolean;
  remoteMachines: RemoteMachine[];
  projectAliases: Record<string, string>;
  scanErrors: string[];
  selectedCandidate: ProjectCandidate | null;
  setSelectedId: (value: string) => void;
  setToast: (toast: Toast) => void;
  onRefresh: () => Promise<void>;
  onOpenSettings: () => void;
  onAddProject: (pathOrUri: string) => Promise<void>;
  onPickProject: () => Promise<void>;
  onRemoveProject: (uri: string) => Promise<void>;
  onRenameProject: (uri: string, name: string) => Promise<void>;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const terminalPaneRef = useRef<TerminalPaneHandle | null>(null);
  const [addProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
  const [runningServiceProjectIds, setRunningServiceProjectIds] = useState<Set<string>>(() => new Set());
  const [terminalActivityByProjectId, setTerminalActivityByProjectId] = useState<Record<string, ProjectTerminalActivityState>>({});
  const [agentClis, setAgentClis] = useState<AgentCli[]>([]);
  const [agentListVersion, setAgentListVersion] = useState(0);
  const [agentStatusByProjectPath, setAgentStatusByProjectPath] = useState<AgentStatusByProjectPath>({});
  const [activeTerminalTabKind, setActiveTerminalTabKind] = useState<ActiveTerminalTabKind>(null);
  const [projectColumnWidth, setProjectColumnWidth] = useState(() =>
    storedColumnWidth(projectColumnStorageKey, defaultProjectColumnWidth, minProjectColumnWidth),
  );
  const [detailColumnWidth, setDetailColumnWidth] = useState(() =>
    storedColumnWidth(detailColumnStorageKey, defaultDetailColumnWidth, minDetailColumnWidth),
  );
  const detailPanelHidden = activeTerminalTabKind === "browser";

  function normalizeColumnWidths(projectWidth: number, detailWidth: number, gridWidth: number, detailHidden = detailPanelHidden) {
    const availableWidth = gridWidth - resizerColumnWidth * (detailHidden ? 1 : 2);
    const minimumWidth = minProjectColumnWidth + minTerminalColumnWidth + (detailHidden ? 0 : minDetailColumnWidth);
    if (availableWidth <= minimumWidth) {
      return { projectWidth: minProjectColumnWidth, detailWidth: detailHidden ? detailWidth : minDetailColumnWidth };
    }
    const nextProjectWidth = clamp(projectWidth, minProjectColumnWidth, availableWidth - minTerminalColumnWidth - (detailHidden ? 0 : minDetailColumnWidth));
    const nextDetailWidth = detailHidden ? detailWidth : clamp(detailWidth, minDetailColumnWidth, availableWidth - nextProjectWidth - minTerminalColumnWidth);
    return { projectWidth: Math.round(nextProjectWidth), detailWidth: Math.round(nextDetailWidth) };
  }

  function persistColumnWidths(projectWidth: number, detailWidth: number, gridWidth = gridRef.current?.getBoundingClientRect().width) {
    const next = gridWidth
      ? normalizeColumnWidths(projectWidth, detailWidth, gridWidth)
      : { projectWidth: Math.max(minProjectColumnWidth, Math.round(projectWidth)), detailWidth: Math.max(minDetailColumnWidth, Math.round(detailWidth)) };
    setProjectColumnWidth(next.projectWidth);
    setDetailColumnWidth(next.detailWidth);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(projectColumnStorageKey, String(next.projectWidth));
      window.localStorage.setItem(detailColumnStorageKey, String(next.detailWidth));
    }
  }

  function startColumnResize(target: "project" | "detail", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const grid = event.currentTarget.parentElement;
    if (!grid) return;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = grid.getBoundingClientRect();
      if (target === "project") persistColumnWidths(moveEvent.clientX - rect.left, detailColumnWidth, rect.width);
      else persistColumnWidths(projectColumnWidth, rect.right - moveEvent.clientX, rect.width);
    };
    const onPointerUp = () => {
      document.body.classList.remove("is-resizing-columns");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    document.body.classList.add("is-resizing-columns");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function resizeWithKeyboard(target: "project" | "detail", event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? columnResizeStep : -columnResizeStep;
    if (target === "project") persistColumnWidths(projectColumnWidth + delta, detailColumnWidth);
    else persistColumnWidths(projectColumnWidth, detailColumnWidth + (event.key === "ArrowLeft" ? columnResizeStep : -columnResizeStep));
  }

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) persistColumnWidths(projectColumnWidth, detailColumnWidth, width);
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [detailColumnWidth, detailPanelHidden, projectColumnWidth]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    let cancelled = false;
    const listClis = getBridge().agents?.listClis;
    if (!listClis) return;
    setAgentClis([]);
    void listClis({ cwdUri: selectedCandidate?.uri })
      .then((clis) => { if (!cancelled) setAgentClis(clis); })
      .catch((error) => { if (!cancelled) setToast({ tone: "error", message: asMessage(error) }); });
    return () => { cancelled = true; };
  }, [bridgeAvailable, selectedCandidate?.uri, setToast, agentListVersion]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    const unsubscribe = getBridge().agents?.onStatus?.((event: AgentProjectStatusEvent) => {
      setAgentStatusByProjectPath((current) =>
        current[event.projectPath] === event.text ? current : { ...current, [event.projectPath]: event.text }
      );
    });
    return () => unsubscribe?.();
  }, [bridgeAvailable]);

  const gridStyle = {
    gridTemplateColumns: detailPanelHidden
      ? `${projectColumnWidth}px ${resizerColumnWidth}px minmax(${minTerminalColumnWidth}px, 1fr) 0px 0px`
      : `${projectColumnWidth}px ${resizerColumnWidth}px minmax(${minTerminalColumnWidth}px, 1fr) ${resizerColumnWidth}px ${detailColumnWidth}px`,
  } satisfies CSSProperties;

  return (
    <div className={cx("dashboard-grid", detailPanelHidden && "is-detail-hidden")} ref={gridRef} style={gridStyle}>
      <section className="project-panel">
        <div className="project-window-drag-strip" aria-hidden="true" />
        <div className="project-panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 4px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", opacity: 0.6 }}>Projects</span>
          <button aria-label="Add project" className="icon-button" title="Add project" type="button" onClick={() => setAddProjectDialogOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        {scanErrors.length ? (
          <div className="inline-errors">
            {scanErrors.map((error) => (<div key={error}>{error}</div>))}
          </div>
        ) : null}
        <div className="project-sections">
          {filteredCandidates.length ? (
            <ProjectList
              agentStatusByProjectPath={agentStatusByProjectPath}
              candidates={filteredCandidates}
              projectAliases={projectAliases}
              runningServiceProjectIds={runningServiceProjectIds}
              terminalActivityByProjectId={terminalActivityByProjectId}
              selectedId={selectedCandidate?.id ?? null}
              onSelect={setSelectedId}
              onRemoveProject={onRemoveProject}
              onRenameProject={onRenameProject}
            />
          ) : (
            <div className="empty-state compact-title-row" style={{ padding: "24px 16px" }}>
              <strong>No projects</strong>
              <span>Add a project directory to get started.</span>
              <button className="button" type="button" style={{ marginTop: "12px" }} onClick={() => setAddProjectDialogOpen(true)}>Add Project</button>
            </div>
          )}
        </div>
      </section>

      <div aria-label="Resize project column" aria-orientation="vertical" className="column-resizer" role="separator" tabIndex={0}
        onKeyDown={(event) => resizeWithKeyboard("project", event)}
        onPointerDown={(event) => startColumnResize("project", event)}
      />

      <section className="panel terminal-panel">
        <TerminalPane
          ref={terminalPaneRef}
          appearanceTheme={appearanceTheme}
          agentClis={agentClis}
          candidate={selectedCandidate}
          projectAliases={projectAliases}
          bridgeAvailable={bridgeAvailable}
          isVisible={isVisible}
          setToast={setToast}
          onActiveTabKindChange={setActiveTerminalTabKind}
          onAgentListRefreshRequested={() => setAgentListVersion((current) => current + 1)}
          onRunningServiceProjectIdsChange={(nextIds) =>
            setRunningServiceProjectIds((currentIds) => sameStringSet(currentIds, nextIds) ? currentIds : nextIds)
          }
          onTerminalActivityProjectStatesChange={(nextStates) =>
            setTerminalActivityByProjectId((currentStates) => sameProjectTerminalActivityStates(currentStates, nextStates) ? currentStates : nextStates)
          }
        />
      </section>

      <div aria-label="Resize terminal and detail columns" aria-orientation="vertical" className="column-resizer detail-column-resizer" role="separator" tabIndex={detailPanelHidden ? -1 : 0}
        aria-hidden={detailPanelHidden}
        onKeyDown={(event) => resizeWithKeyboard("detail", event)}
        onPointerDown={(event) => startColumnResize("detail", event)}
      />

      <section className="detail-panel" aria-hidden={detailPanelHidden}>
        {selectedCandidate ? (
          <ProjectDetailPane
            detail={detail}
            candidate={selectedCandidate}
            setToast={setToast}
            onRefresh={onRefresh}
            onOpenFileInEditor={(relativePath) =>
              terminalPaneRef.current?.openFileInEditor(selectedCandidate.uri, projectAliases[selectedCandidate.uri] || selectedCandidate.name, relativePath) ?? Promise.resolve()
            }
            onOpenGitDiff={(relativePath) =>
              terminalPaneRef.current?.openGitDiff(selectedCandidate.uri, projectAliases[selectedCandidate.uri] || selectedCandidate.name, relativePath) ?? Promise.resolve()
            }
            onOpenBrowserTab={(url) =>
              terminalPaneRef.current?.openBrowserTab(selectedCandidate.uri, projectAliases[selectedCandidate.uri] || selectedCandidate.name, url) ?? Promise.resolve()
            }
          />
        ) : (
          <EmptyState title="No project selected" body="Select a project to get started." />
        )}
      </section>

      {addProjectDialogOpen ? (
        <AddProjectDialog
          remoteMachines={remoteMachines}
          setToast={setToast}
          onAdd={async (pathOrUri) => { await onAddProject(pathOrUri); setAddProjectDialogOpen(false); }}
          onClose={() => setAddProjectDialogOpen(false)}
          onPickLocal={async () => { await onPickProject(); setAddProjectDialogOpen(false); }}
        />
      ) : null}
    </div>
  );
}

const TerminalPane = forwardRef<TerminalPaneHandle, {
  appearanceTheme: AppearanceTheme;
  agentClis: AgentCli[];
  bridgeAvailable: boolean;
  candidate: ProjectCandidate | null;
  projectAliases: Record<string, string>;
  isVisible: boolean;
  setToast: (toast: Toast) => void;
  onActiveTabKindChange: (kind: ActiveTerminalTabKind) => void;
  onAgentListRefreshRequested: () => void;
  onRunningServiceProjectIdsChange: (projectIds: Set<string>) => void;
  onTerminalActivityProjectStatesChange: (states: Record<string, ProjectTerminalActivityState>) => void;
}>(function TerminalPane({ appearanceTheme, agentClis, bridgeAvailable, candidate, projectAliases, isVisible, setToast, onActiveTabKindChange, onAgentListRefreshRequested, onRunningServiceProjectIdsChange, onTerminalActivityProjectStatesChange }, ref) {
  const [spaces, setSpaces] = useState<Record<string, TerminalSpace>>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [installAgentDialogOpen, setInstallAgentDialogOpen] = useState(false);
  const spacesRef = useRef<Record<string, TerminalSpace>>({});
  const activeProjectIdRef = useRef<string | null>(null);
  const creatingProjects = useRef(new Set<string>());
  const quietTimers = useRef(new Map<string, ReturnType<typeof window.setTimeout>>());
  const selectedSpace = candidate?.id ? spaces[candidate.id] ?? null : null;
  const canCreate = bridgeAvailable && Boolean(candidate?.uri) && (candidate?.providerKind === "local" || candidate?.providerKind === "ssh");
  const services = candidate?.services ?? [];

  useEffect(() => { spacesRef.current = spaces; }, [spaces]);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => () => { for (const timer of quietTimers.current.values()) window.clearTimeout(timer); quietTimers.current.clear(); }, []);

  useEffect(() => {
    const hasDirtyEditor = Object.values(spaces).some((space) =>
      space.tabs.some((tab) => tab.kind === "editor" && tab.content !== tab.savedContent),
    );
    if (!hasDirtyEditor) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [spaces]);

  useEffect(() => {
    const runningProjectIds = new Set(
      Object.values(spaces).filter((space) => space.tabs.some((tab) => isRunningServiceTab(tab))).map((space) => space.projectId),
    );
    onRunningServiceProjectIdsChange(runningProjectIds);
  }, [onRunningServiceProjectIdsChange, spaces]);

  useEffect(() => { onTerminalActivityProjectStatesChange(projectTerminalActivityStates(terminalActivitySpaces(Object.values(spaces)))); }, [onTerminalActivityProjectStatesChange, spaces]);
  useEffect(() => { onActiveTabKindChange(activeTabKindForProject(spaces, activeProjectId)); }, [activeProjectId, onActiveTabKindChange, spaces]);

  useEffect(() => {
    for (const space of Object.values(spacesRef.current)) {
      for (const tab of space.tabs) {
        if (tab.kind === "terminal") tab.terminal.options.theme = terminalThemes[appearanceTheme];
      }
    }
  }, [appearanceTheme]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    const terminal = getBridge().terminal;
    if (!terminal?.onData || !terminal.onExit) return;
    const offData = terminal.onData((event) => appendTerminalOutput(event));
    const offExit = terminal.onExit((event) => markTerminalExit(event));
    const offUpdate = terminal.onUpdate ? terminal.onUpdate((event) => updateTerminalSession(event)) : () => undefined;
    return () => { offData(); offExit(); offUpdate(); };
  }, [bridgeAvailable]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    const unsubscribe = getBridge().browser?.onUpdate?.((event: BrowserUpdateEvent) => updateBrowserSession(event.browser));
    return () => unsubscribe?.();
  }, [bridgeAvailable]);

  useEffect(() => {
    if (!candidate?.uri || !bridgeAvailable) { if (!candidate) setActiveProjectId(null); return; }
    setActiveProjectId(candidate.id);
    setSpaces((current) => {
      if (current[candidate.id]) return current;
      return { ...current, [candidate.id]: { projectId: candidate.id, projectName: displayProjectName ?? candidate.name, uri: candidate.uri, displayPath: candidate.displayPath, tabs: [], activeId: null, serviceUrl: null } };
    });
    if (!isVisible) return;
    const existing = spacesRef.current[candidate.id];
    if (existing?.tabs.length) return;
    if (creatingProjects.current.has(candidate.id)) return;
    creatingProjects.current.add(candidate.id);
    void openProjectTab(candidate.id, candidate.uri, displayProjectName ?? candidate.name, candidate.displayPath, true).finally(() => { creatingProjects.current.delete(candidate.id); });
  }, [bridgeAvailable, candidate?.id, candidate?.uri, isVisible]);

  async function openCurrentProjectTab() {
    if (!candidate?.uri) return;
    await openProjectTab(candidate.id, candidate.uri, displayProjectName ?? candidate.name, candidate.displayPath);
  }

  async function openAgentProjectTab(agent: AgentCli) {
    if (!candidate?.uri) return;
    const isRemote = candidate.providerKind === "ssh";
    const launchCommand = isRemote ? agent.command : (agent.executablePath || agent.command);
    await openProjectTab(candidate.id, candidate.uri, displayProjectName ?? candidate.name, candidate.displayPath, false, { agentId: agent.id, initialCommand: shellQuote(launchCommand) });
  }

  async function openBrowserProjectTab() {
    if (!candidate?.uri) return;
    const initialUrl = selectedSpace?.tabs.some((tab) => isRunningServiceTab(tab)) ? selectedSpace.serviceUrl ?? "about:blank" : "about:blank";
    await openBrowserTab(candidate.id, candidate.uri, displayProjectName ?? candidate.name, candidate.displayPath, initialUrl);
  }

  useImperativeHandle(ref, () => ({
    openFileInEditor: async (projectUri, projectName, relativePath) => {
      await openEditorTab(projectUri, projectName, selectedSpace?.displayPath ?? projectUri, relativePath);
    },
    openGitDiff: async (projectUri, projectName, relativePath) => {
      await openProjectTab(projectUri, projectUri, projectName, selectedSpace?.displayPath ?? projectUri, false, { initialCommand: gitDiffCommandFor(relativePath) });
    },
    openBrowserTab: async (projectUri, projectName, initialUrl) => {
      await openBrowserTab(projectUri, projectUri, projectName, selectedSpace?.displayPath ?? projectUri, initialUrl);
    },
  }));

  async function openEditorTab(projectUri: string, projectName: string, displayPath: string, relativePath: string) {
    const editorTabId = `editor:${projectUri}:${relativePath}`;
    const existingSpace = spacesRef.current[projectUri];
    const existingTab = existingSpace?.tabs.find((tab): tab is EditorTab => tab.kind === "editor" && tab.id === editorTabId);
    if (existingTab) {
      setActiveTab(projectUri, editorTabId);
      setActiveProjectId(projectUri);
      onActiveTabKindChange("editor");
      return;
    }
    const baseName = relativePath.split("/").pop() ?? relativePath;
    const tab: EditorTab = {
      kind: "editor",
      id: editorTabId,
      projectUri,
      relativePath,
      name: baseName,
      content: "",
      savedContent: "",
      loading: true,
      saving: false,
      error: null,
      readOnly: false,
    };
    onActiveTabKindChange("editor");
    setSpaces((current) => {
      const existing = current[projectUri] ?? { projectId: projectUri, projectName, uri: projectUri, displayPath, tabs: [], activeId: null, serviceUrl: null };
      return { ...current, [projectUri]: { ...existing, projectName, uri: projectUri, displayPath, tabs: [...existing.tabs, tab], activeId: editorTabId } };
    });
    setActiveProjectId(projectUri);

    const reader = getBridge().projects?.readFile;
    if (!reader) {
      updateEditorTab(projectUri, editorTabId, { loading: false, error: "File reading is not available", readOnly: true });
      return;
    }
    try {
      const result = await reader({ projectUri, relativePath });
      if (result.ok) {
        updateEditorTab(projectUri, editorTabId, { loading: false, content: result.content, savedContent: result.content, error: null });
      } else {
        const readOnly = result.reason === "binary" || result.reason === "too-large";
        updateEditorTab(projectUri, editorTabId, { loading: false, error: result.message, readOnly });
      }
    } catch (error) {
      updateEditorTab(projectUri, editorTabId, { loading: false, error: asMessage(error), readOnly: true });
    }
  }

  function updateEditorTab(projectUri: string, tabId: string, patch: Partial<EditorTab>) {
    setSpaces((current) => {
      const space = current[projectUri];
      if (!space) return current;
      const nextTabs = space.tabs.map((tab) => (tab.kind === "editor" && tab.id === tabId ? { ...tab, ...patch } : tab));
      return { ...current, [projectUri]: { ...space, tabs: nextTabs } };
    });
  }

  function updateEditorContent(projectUri: string, tabId: string, content: string) {
    updateEditorTab(projectUri, tabId, { content });
  }

  async function saveEditorTab(projectUri: string, tabId: string) {
    const space = spacesRef.current[projectUri];
    const tab = space?.tabs.find((item): item is EditorTab => item.kind === "editor" && item.id === tabId);
    if (!tab || tab.saving || tab.readOnly) return;
    const writer = getBridge().projects?.writeFile;
    if (!writer) {
      setToast({ tone: "error", message: "File writing is not available" });
      return;
    }
    updateEditorTab(projectUri, tabId, { saving: true });
    try {
      const result = await writer({ projectUri, relativePath: tab.relativePath, content: tab.content });
      if (result.ok) {
        updateEditorTab(projectUri, tabId, { saving: false, savedContent: tab.content, error: null });
        setToast({ tone: "success", message: `Saved ${tab.relativePath}` });
      } else {
        updateEditorTab(projectUri, tabId, { saving: false, error: result.message });
        setToast({ tone: "error", message: result.message });
      }
    } catch (error) {
      updateEditorTab(projectUri, tabId, { saving: false, error: asMessage(error) });
      setToast({ tone: "error", message: asMessage(error) });
    }
  }

  async function openProjectTab(projectId: string, cwdUri: string, projectName: string, displayPath: string, quiet = false, options: Pick<TerminalCreateInput, "agentId" | "initialCommand" | "service"> = {}) {
    try {
      const session = await createTerminal(cwdUri, projectName, options);
      const terminal = createXTerm(session.id, appearanceTheme, setToast, recordTerminalInputActivity);
      const tab: TerminalTab = { kind: "terminal", session, terminal: terminal.instance, fitAddon: terminal.fitAddon, disposables: terminal.disposables, activityState: "idle", outputBurstStartedAt: null };
      onActiveTabKindChange("terminal");
      setSpaces((current) => {
        const existing = current[projectId] ?? { projectId, projectName, uri: cwdUri, displayPath, tabs: [], activeId: null, serviceUrl: null };
        return { ...current, [projectId]: { ...existing, projectName, uri: cwdUri, displayPath, tabs: [...existing.tabs, tab], activeId: session.id } };
      });
      setActiveProjectId(projectId);
    } catch (error) { if (!quiet) setToast({ tone: "error", message: asMessage(error) }); }
  }

  async function openBrowserTab(projectId: string, uri: string, projectName: string, displayPath: string, initialUrl: string) {
    try {
      const browser = await createBrowser(initialUrl);
      const tab: TerminalTab = { kind: "browser", browser, addressValue: browser.url === "about:blank" ? "" : browser.url };
      onActiveTabKindChange("browser");
      setSpaces((current) => {
        const existing = current[projectId] ?? { projectId, projectName, uri, displayPath, tabs: [], activeId: null, serviceUrl: null };
        return { ...current, [projectId]: { ...existing, projectName, uri, displayPath, tabs: [...existing.tabs, tab], activeId: browser.id } };
      });
      setActiveProjectId(projectId);
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    }
  }

  async function toggleService(service: NonNullable<ProjectCandidate["services"]>[number]) {
    if (!candidate?.uri) return;
    const existing = selectedSpace?.tabs.find((tab): tab is TerminalShellTab => tab.kind === "terminal" && tab.session.service?.id === service.id && tab.session.status === "running");
    if (existing) { await closeTab(existing.session.id); return; }
    await openProjectTab(candidate.id, service.cwdUri, displayProjectName ?? candidate.name, candidate.displayPath, false, { initialCommand: service.command, service: { id: service.id, label: service.label, command: service.command } });
  }

  function appendTerminalOutput(event: TerminalDataEvent) {
    const tab = findTerminalTab(spacesRef.current, event.sessionId);
    tab?.terminal.write(event.data);
    if (tab && isRunningServiceTab(tab)) recordServiceUrl(event.sessionId, event.data);
    recordTerminalOutputActivity(event.sessionId);
  }

  function recordTerminalOutputActivity(sessionId: string) {
    const tab = findTerminalTab(spacesRef.current, sessionId);
    if (!tab || tab.session.status !== "running") return;
    const now = Date.now();
    setSpaces((current) => mapTerminalTab(current, sessionId, (currentTab) => {
      if (currentTab.session.status !== "running") return currentTab;
      const burstStartedAt = currentTab.outputBurstStartedAt ?? now;
      const sustained = now - burstStartedAt >= terminalWorkingThresholdMs;
      return { ...currentTab, activityState: sustained ? "working" : currentTab.activityState === "done" ? "idle" : currentTab.activityState, outputBurstStartedAt: burstStartedAt };
    }));
    scheduleTerminalQuietTimer(sessionId);
  }

  function recordTerminalInputActivity(sessionId: string) {
    clearTerminalQuietTimer(sessionId);
    setSpaces((current) => mapTerminalTab(current, sessionId, (currentTab) => ({ ...currentTab, activityState: currentTab.activityState === "done" ? "done" : "idle", outputBurstStartedAt: null })));
  }

  function scheduleTerminalQuietTimer(sessionId: string) {
    const existingTimer = quietTimers.current.get(sessionId);
    if (existingTimer) window.clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
      quietTimers.current.delete(sessionId);
      const isCurrentTab = isCurrentOpenTerminalTab(spacesRef.current, sessionId, activeProjectIdRef.current);
      setSpaces((current) => mapTerminalTab(current, sessionId, (currentTab) => ({ ...currentTab, activityState: currentTab.activityState === "working" && !isCurrentTab ? "done" : "idle", outputBurstStartedAt: null })));
    }, terminalQuietDoneMs);
    quietTimers.current.set(sessionId, timer);
  }

  function clearTerminalQuietTimer(sessionId: string) {
    const timer = quietTimers.current.get(sessionId);
    if (!timer) return;
    window.clearTimeout(timer);
    quietTimers.current.delete(sessionId);
  }

  function clearTerminalDoneState(sessionId: string) {
    const tab = findTerminalTab(spacesRef.current, sessionId);
    if (tab?.activityState !== "done") return;
    setSpaces((current) => mapTerminalTab(current, sessionId, (currentTab) => ({ ...currentTab, activityState: "idle" })));
  }

  function markTerminalExit(event: TerminalExitEvent) {
    clearTerminalQuietTimer(event.sessionId);
    const message = `\r\n[process exited${event.exitCode === null ? "" : ` with code ${event.exitCode}`}${event.signal ? `, signal ${event.signal}` : ""}]\r\n`;
    const match = findTerminalTabWithSpace(spacesRef.current, event.sessionId);
    match?.tab.terminal.write(message);
    if (match?.tab) {
      const hint = explainEarlyTerminalExit(match.tab, event);
      if (hint) setToast({ tone: "error", message: hint });
    }
    setSpaces((current) => mapTerminalTab(current, event.sessionId, (currentTab) => ({ ...currentTab, activityState: "idle", outputBurstStartedAt: null, session: { ...currentTab.session, status: "exited" } })));
  }

  function updateTerminalSession(event: TerminalUpdateEvent) {
    setSpaces((current) => mapTerminalTab(current, event.session.id, (currentTab) => ({ ...currentTab, session: event.session })));
  }

  function updateBrowserSession(browser: BrowserSession) {
    setSpaces((current) => mapBrowserTab(current, browser.id, (currentTab) => ({
      ...currentTab,
      browser,
      addressValue: browser.url === "about:blank" ? "" : browser.url,
    })));
  }

  function updateBrowserAddress(browserId: string, value: string) {
    setSpaces((current) => mapBrowserTab(current, browserId, (currentTab) => ({ ...currentTab, addressValue: value })));
  }

  function recordServiceUrl(sessionId: string, data: string) {
    const url = firstHttpUrl(data);
    if (!url) return;
    const match = findTerminalTabWithSpace(spacesRef.current, sessionId);
    if (!match?.tab.session.service) return;
    setSpaces((current) => {
      const space = current[match.space.projectId];
      if (!space || space.serviceUrl === url || shouldKeepCurrentServiceUrl(space.serviceUrl, url)) return current;
      return { ...current, [space.projectId]: { ...space, serviceUrl: url } };
    });
  }

  async function closeTab(tabId: string) {
    const match = findTabWithSpace(spacesRef.current, tabId);
    if (match?.tab.kind === "editor") {
      const tab = match.tab;
      if (tab.content !== tab.savedContent) {
        const confirmed = window.confirm(`${tab.name} has unsaved changes. Close without saving?`);
        if (!confirmed) return;
      }
      removeTab(tabId, match);
      return;
    }
    try {
      if (match?.tab.kind === "browser") await closeBrowser(tabId);
      else await closeTerminal(tabId);
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      removeTab(tabId, match);
    }
  }

  function removeTab(tabId: string, match: ReturnType<typeof findTabWithSpace>) {
    if (match?.tab.kind === "terminal") {
      clearTerminalQuietTimer(tabId);
      match.tab.disposables.forEach((d) => d.dispose());
      match.tab.terminal.dispose();
    }
    setSpaces((current) => {
      if (!match) return current;
      const space = current[match.space.projectId];
      if (!space) return current;
      const nextTabs = space.tabs.filter((tab) => tabIdForTab(tab) !== tabId);
      const closingActive = space.activeId === tabId;
      const fallback = nextTabs[match.index] ?? nextTabs[match.index - 1] ?? null;
      return { ...current, [space.projectId]: { ...space, tabs: nextTabs, activeId: closingActive ? fallback ? tabIdForTab(fallback) : null : space.activeId } };
    });
  }

  function setActiveTab(projectId: string, sessionId: string) {
    const nextKind = tabKindForId(spacesRef.current[projectId], sessionId);
    onActiveTabKindChange(nextKind);
    setSpaces((current) => {
      const space = current[projectId];
      if (!space) return current;
      return { ...current, [projectId]: { ...space, activeId: sessionId } };
    });
  }

  const displayProjectName = candidate ? (projectAliases[candidate.uri] || candidate.name) : null;
  const terminalHeading = displayProjectName ?? "Terminal";

  return (
    <div className="terminal-layout">
      <div className="terminal-header">
        <div>
          <h3>{terminalHeading}</h3>
          <div className="path-line">{selectedSpace?.displayPath ?? candidate?.displayPath ?? "Select a project"}</div>
        </div>
        {services.length ? (
          <div className="service-actions" aria-label="Project services">
            {services.map((service) => {
              const running = Boolean(selectedSpace?.tabs.some((tab) => tab.kind === "terminal" && tab.session.service?.id === service.id && tab.session.status === "running"));
              return (
                <button aria-label={`${running ? "Stop" : "Start"} ${service.label}`} className={cx("service-pill", running && "is-running")} disabled={!canCreate} key={service.id} title={`${running ? "Stop" : "Start"} ${service.command}`} type="button" onClick={() => void toggleService(service)}>
                  <span className="service-dot" aria-hidden="true" />
                  <span className="service-pill-label">{service.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="terminal-space-stack">
        {Object.values(spaces).map((space) => (
          <div className={cx("terminal-space", space.projectId === activeProjectId && "is-active")} key={space.projectId}>
            <div className="terminal-tabs">
              {space.tabs.length ? (
                <div className="terminal-tab-list" role="tablist">
                  {space.tabs.map((tab) => {
                    const tabId = tabIdForTab(tab);
                    const isActiveTab = tabId === space.activeId;
                    const tabTitle = titleForTab(tab);
                    return (
                      <div className={cx("terminal-tab", isActiveTab && "is-active")} key={tabId} role="tab" aria-selected={isActiveTab}>
                        <button className="terminal-tab-main" type="button" onClick={() => { setActiveTab(space.projectId, tabId); if (tab.kind === "terminal") clearTerminalDoneState(tab.session.id); }}>
                          {tab.kind === "terminal" ? (
                            <span className={cx("terminal-state", tab.session.service && tab.session.status === "running" && "is-service-running", tab.activityState === "working" && "is-working", !isActiveTab && tab.activityState === "done" && "is-done", tab.session.status === "exited" && "is-exited")} />
                          ) : tab.kind === "browser" ? (
                            <BrowserTabIcon browser={tab.browser} />
                          ) : (
                            <EditorTabIcon dirty={tab.content !== tab.savedContent} />
                          )}
                          <span className="truncate">{tabTitle}{tab.kind === "editor" && tab.content !== tab.savedContent ? " •" : ""}</span>
                        </button>
                        <button aria-label={`Close ${tabTitle}`} className="terminal-tab-close" type="button" onClick={(event) => { event.stopPropagation(); void closeTab(tabId); }}>x</button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <button aria-label="New terminal tab" className="icon-button terminal-tab-add" disabled={!canCreate} title="New terminal tab" type="button" onClick={() => void openCurrentProjectTab()}><PlusIcon /></button>
              <button aria-label="Open browser" className="icon-button terminal-tab-add terminal-browser-button" disabled={!canCreate} title="Browser" type="button" onClick={() => void openBrowserProjectTab()}><GlobeIcon /></button>
              {agentClis.map((agent) => (
                <button aria-label={agent.label} className="icon-button terminal-tab-add terminal-agent-button" disabled={!canCreate} key={agent.id} title={agent.label} type="button" onClick={() => void openAgentProjectTab(agent)}>
                  <AgentCliIcon agent={agent} />
                </button>
              ))}
              <button aria-label="Install agent" className="icon-button terminal-tab-add terminal-agent-install-button" disabled={!candidate?.providerId} title="Install agent CLI" type="button" onClick={() => setInstallAgentDialogOpen(true)}>
                <DownloadIcon />
              </button>
            </div>
            <div className="xterm-surface-stack">
              {space.tabs.map((tab) => {
                const active = isVisible && space.projectId === activeProjectId && tabIdForTab(tab) === space.activeId;
                if (tab.kind === "terminal") {
                  return <XTermSurface active={active} key={tab.session.id} tab={tab} onResize={(cols, rows) => void resizeTerminal(tab.session.id, cols, rows).catch((error) => setToast({ tone: "error", message: asMessage(error) }))} />;
                }
                if (tab.kind === "browser") {
                  return <BrowserSurface active={active} key={tab.browser.id} setToast={setToast} tab={tab} onAddressChange={(value) => updateBrowserAddress(tab.browser.id, value)} onBrowserUpdate={(browser) => updateBrowserSession(browser)} />;
                }
                return (
                  <EditorSurface
                    active={active}
                    appearanceTheme={appearanceTheme}
                    key={tab.id}
                    tab={tab}
                    onChange={(content) => updateEditorContent(tab.projectUri, tab.id, content)}
                    onSave={() => void saveEditorTab(tab.projectUri, tab.id)}
                  />
                );
              })}
              {!space.tabs.length ? (<div className="xterm-empty-state"><EmptyState title="No terminal open" body="Open a tab for the selected project." /></div>) : null}
            </div>
          </div>
        ))}
        {!Object.values(spaces).length ? (
          <div className="terminal-space is-active terminal-empty-space">
            <div className="terminal-tabs">
              <button aria-label="New terminal tab" className="icon-button terminal-tab-add" disabled={!canCreate} title="New terminal tab" type="button" onClick={() => void openCurrentProjectTab()}><PlusIcon /></button>
              <button aria-label="Open browser" className="icon-button terminal-tab-add terminal-browser-button" disabled={!canCreate} title="Browser" type="button" onClick={() => void openBrowserProjectTab()}><GlobeIcon /></button>
              {agentClis.map((agent) => (
                <button aria-label={agent.label} className="icon-button terminal-tab-add terminal-agent-button" disabled={!canCreate} key={agent.id} title={agent.label} type="button" onClick={() => void openAgentProjectTab(agent)}>
                  <AgentCliIcon agent={agent} />
                </button>
              ))}
              <button aria-label="Install agent" className="icon-button terminal-tab-add terminal-agent-install-button" disabled={!candidate?.providerId} title="Install agent CLI" type="button" onClick={() => setInstallAgentDialogOpen(true)}>
                <DownloadIcon />
              </button>
            </div>
            <div className="xterm-surface-stack"><div className="xterm-empty-state"><EmptyState title="No terminal open" body={candidate ? "Open a tab for the selected project." : "Select a project to start a shell."} /></div></div>
          </div>
        ) : null}
      </div>
      {installAgentDialogOpen && candidate?.providerId ? (
        <InstallAgentDialog
          targetId={candidate.providerId}
          targetLabel={candidate.providerKind === "ssh" ? candidate.displayPath : "Local Machine"}
          installedAgentIds={agentClis.map((agent) => agent.id)}
          onClose={() => setInstallAgentDialogOpen(false)}
          onInstalled={onAgentListRefreshRequested}
          setToast={setToast}
        />
      ) : null}
    </div>
  );
});

function BrowserSurface({
  active,
  onAddressChange,
  onBrowserUpdate,
  setToast,
  tab,
}: {
  active: boolean;
  onAddressChange: (value: string) => void;
  onBrowserUpdate: (browser: BrowserSession) => void;
  setToast: (toast: Toast) => void;
  tab: BrowserTab;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let secondFrame = 0;
    const resize = () => {
      const bounds = active && hostRef.current ? browserBoundsForElement(hostRef.current) : hiddenBrowserBounds();
      if (active && (!bounds.width || !bounds.height)) return;
      void resizeBrowser(tab.browser.id, bounds, active).catch((error) => setToast({ tone: "error", message: asMessage(error) }));
    };
    const scheduleResize = () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
      frame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(resize);
      });
    };
    scheduleResize();
    const observer = new ResizeObserver(() => scheduleResize());
    if (hostRef.current) observer.observe(hostRef.current);
    window.addEventListener("resize", scheduleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleResize);
      void resizeBrowser(tab.browser.id, hiddenBrowserBounds(), false).catch(() => undefined);
    };
  }, [active, setToast, tab.browser.id]);

  async function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const browser = await navigateBrowser(tab.browser.id, tab.addressValue);
      onBrowserUpdate(browser);
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    }
  }

  return (
    <div aria-hidden={!active} className={cx("browser-surface", active && "is-active")}>
      <div className="browser-toolbar">
        <button aria-label="Back" className="icon-button browser-tool-button" disabled={!tab.browser.canGoBack} title="Back" type="button" onClick={() => void browserAction("goBack", tab.browser.id).catch((error) => setToast({ tone: "error", message: asMessage(error) }))}><ArrowLeftIcon /></button>
        <button aria-label="Forward" className="icon-button browser-tool-button" disabled={!tab.browser.canGoForward} title="Forward" type="button" onClick={() => void browserAction("goForward", tab.browser.id).catch((error) => setToast({ tone: "error", message: asMessage(error) }))}><ArrowRightIcon /></button>
        <button aria-label="Reload" className="icon-button browser-tool-button" title="Reload" type="button" onClick={() => void browserAction("reload", tab.browser.id).catch((error) => setToast({ tone: "error", message: asMessage(error) }))}><RefreshIcon /></button>
        <form className="browser-address-form" onSubmit={(event) => void submitAddress(event)}>
          <input aria-label="Browser address" className="browser-address-input" placeholder="about:blank" value={tab.addressValue} onChange={(event) => onAddressChange(event.target.value)} />
        </form>
      </div>
      <div className="browser-view-host" ref={hostRef} />
    </div>
  );
}

function XTermSurface({ active, onResize, tab }: { active: boolean; onResize: (cols: number, rows: number) => void; tab: TerminalShellTab }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef(false);
  const onResizeRef = useRef(onResize);
  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);
  useEffect(() => { if (!hostRef.current || openedRef.current) return; tab.terminal.open(hostRef.current); openedRef.current = true; }, [tab]);
  useEffect(() => {
    if (!active || !openedRef.current) return;
    const fitAndResize = () => {
      const dimensions = tab.fitAddon.proposeDimensions();
      if (!dimensions || !validTerminalResizeDimensions(dimensions.cols, dimensions.rows)) return;
      tab.fitAddon.fit();
      onResizeRef.current(Math.floor(dimensions.cols), Math.floor(dimensions.rows));
    };
    const frame = window.requestAnimationFrame(() => {
      fitAndResize();
      if (!isUserEditingElsewhere()) tab.terminal.focus();
    });
    const observer = new ResizeObserver(() => fitAndResize());
    if (hostRef.current) observer.observe(hostRef.current);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, [active, tab]);
  return <div aria-hidden={!active} className={cx("xterm-surface", active && "is-active")} ref={hostRef} />;
}

function isUserEditingElsewhere(): boolean {
  const node = document.activeElement as HTMLElement | null;
  if (!node) return false;
  if (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT") return true;
  return node.isContentEditable === true;
}

function createXTerm(sessionId: string, appearanceTheme: AppearanceTheme, setToast: (toast: Toast) => void, onInput: (sessionId: string) => void) {
  const instance = new XTerm({ allowTransparency: false, cursorBlink: true, fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace', fontSize: 12, scrollback: 5000, theme: terminalThemes[appearanceTheme] });
  const fitAddon = new FitAddon();
  instance.loadAddon(fitAddon);
  instance.loadAddon(new WebLinksAddon());
  const inputDisposable = instance.onData((data) => { if (shouldResetTerminalObservationForInput(data)) onInput(sessionId); void sendTerminalInput(sessionId, data).catch((error) => setToast({ tone: "error", message: asMessage(error) })); });
  return { instance, fitAddon, disposables: [inputDisposable] };
}

function findTerminalTab(spaces: Record<string, TerminalSpace>, sessionId: string): TerminalShellTab | null {
  return findTerminalTabWithSpace(spaces, sessionId)?.tab ?? null;
}

function findTerminalTabWithSpace(spaces: Record<string, TerminalSpace>, sessionId: string): { space: TerminalSpace; tab: TerminalShellTab; index: number } | null {
  for (const space of Object.values(spaces)) {
    const index = space.tabs.findIndex((tab) => tab.kind === "terminal" && tab.session.id === sessionId);
    if (index >= 0) {
      const tab = space.tabs[index];
      if (tab?.kind === "terminal") return { space, tab, index };
    }
  }
  return null;
}

function findTabWithSpace(spaces: Record<string, TerminalSpace>, tabId: string): { space: TerminalSpace; tab: TerminalTab; index: number } | null {
  for (const space of Object.values(spaces)) {
    const index = space.tabs.findIndex((tab) => tabIdForTab(tab) === tabId);
    if (index >= 0) { const tab = space.tabs[index]; if (tab) return { space, tab, index }; }
  }
  return null;
}

function isCurrentOpenTerminalTab(spaces: Record<string, TerminalSpace>, sessionId: string, activeProjectId: string | null): boolean {
  const match = findTerminalTabWithSpace(spaces, sessionId);
  return Boolean(match && match.space.projectId === activeProjectId && match.space.activeId === sessionId);
}

function mapTerminalTab(spaces: Record<string, TerminalSpace>, sessionId: string, mapTab: (tab: TerminalShellTab) => TerminalShellTab): Record<string, TerminalSpace> {
  return mapTabById(spaces, sessionId, (tab) => tab.kind === "terminal" ? mapTab(tab) : tab);
}

function mapBrowserTab(spaces: Record<string, TerminalSpace>, browserId: string, mapTab: (tab: BrowserTab) => BrowserTab): Record<string, TerminalSpace> {
  return mapTabById(spaces, browserId, (tab) => tab.kind === "browser" ? mapTab(tab) : tab);
}

function mapTabById(spaces: Record<string, TerminalSpace>, tabId: string, mapTab: (tab: TerminalTab) => TerminalTab): Record<string, TerminalSpace> {
  let changed = false;
  const nextSpaces = Object.fromEntries(Object.entries(spaces).map(([projectId, space]) => {
    let spaceChanged = false;
    const nextTabs = space.tabs.map((tab) => {
      if (tabIdForTab(tab) !== tabId) return tab;
      spaceChanged = true;
      changed = true;
      return mapTab(tab);
    });
    return [projectId, spaceChanged ? { ...space, tabs: nextTabs } : space];
  }));
  return changed ? nextSpaces : spaces;
}

function terminalActivitySpaces(spaces: TerminalSpace[]) {
  return spaces.map((space) => ({
    projectId: space.projectId,
    tabs: space.tabs
      .filter((tab): tab is TerminalShellTab => tab.kind === "terminal")
      .map((tab) => ({ activityState: tab.activityState, session: tab.session })),
  }));
}

function isRunningServiceTab(tab: TerminalTab): boolean {
  return tab.kind === "terminal" && Boolean(tab.session.service) && tab.session.status === "running";
}

function tabIdForTab(tab: TerminalTab): string {
  if (tab.kind === "terminal") return tab.session.id;
  if (tab.kind === "browser") return tab.browser.id;
  return tab.id;
}

function titleForTab(tab: TerminalTab): string {
  if (tab.kind === "terminal") return tab.session.title;
  if (tab.kind === "browser") return tab.browser.title || "Browser";
  return tab.name;
}

function activeTabKindForProject(spaces: Record<string, TerminalSpace>, activeProjectId: string | null): ActiveTerminalTabKind {
  if (!activeProjectId) return null;
  const space = spaces[activeProjectId];
  return tabKindForId(space, space?.activeId ?? null);
}

function tabKindForId(space: TerminalSpace | null | undefined, tabId: string | null): ActiveTerminalTabKind {
  if (!space || !tabId) return null;
  return space.tabs.find((tab) => tabIdForTab(tab) === tabId)?.kind ?? null;
}

function hiddenBrowserBounds(): BrowserBounds {
  return { x: -10000, y: -10000, width: 1, height: 1 };
}

function browserBoundsForElement(element: HTMLElement): BrowserBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.top)),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) { if (!right.has(value)) return false; }
  return true;
}

function sameProjectTerminalActivityStates(left: Record<string, ProjectTerminalActivityState>, right: Record<string, ProjectTerminalActivityState>): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function ProjectList({ agentStatusByProjectPath, candidates, projectAliases, runningServiceProjectIds, terminalActivityByProjectId, selectedId, onSelect, onRemoveProject, onRenameProject }: {
  agentStatusByProjectPath: AgentStatusByProjectPath;
  candidates: ProjectCandidate[];
  projectAliases: Record<string, string>;
  runningServiceProjectIds: Set<string>;
  terminalActivityByProjectId: Record<string, ProjectTerminalActivityState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemoveProject: (uri: string) => Promise<void>;
  onRenameProject: (uri: string, name: string) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<{ uri: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(null);
    }
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(null);
    }
    document.addEventListener("pointerdown", handleClick, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("pointerdown", handleClick, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  function commitRename(candidate: ProjectCandidate) {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (trimmed && trimmed !== candidate.name) {
      void onRenameProject(candidate.uri, trimmed);
    }
  }

  if (!candidates.length) return null;
  return (
    <section className="project-section">
      <div className="project-list" aria-label="Projects">
        {candidates.map((candidate) => {
          const hasRunningService = runningServiceProjectIds.has(candidate.id);
          const terminalActivity = terminalActivityForCandidate(candidate, terminalActivityByProjectId);
          const hasProjectStatus = Boolean(terminalActivity);
          const subtitle = agentStatusByProjectPath[candidate.displayPath] ?? candidate.displayPath;
          const displayName = projectAliases[candidate.uri] || candidate.name;
          const isRenaming = renamingId === candidate.id;
          return (
            <button className={cx("project-row", selectedId === candidate.id && "is-selected")} key={candidate.id} onClick={() => onSelect(candidate.id)}>
              <ProjectIcon name={displayName} sources={candidate.iconSources ?? []} />
              <span className="project-row-main">
                <span className="cell-title">
                  {hasRunningService ? <span className="project-service-dot" aria-label="Service running" /> : null}
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      className="project-rename-input"
                      value={renameValue}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => commitRename(candidate)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") commitRename(candidate);
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span className="cell-title-text truncate">{displayName}</span>
                  )}
                </span>
                <span className="cell-subtitle truncate" title={subtitle}>{subtitle}</span>
              </span>
              <span className="project-row-status">
                {hasProjectStatus && terminalActivity ? (
                  <span className={cx("terminal-activity-pill", terminalActivity === "working" ? "is-working" : "is-attention")}>{terminalActivity === "working" ? "working" : "attention"}</span>
                ) : null}
                <button
                  aria-label="Project menu"
                  className="icon-button project-menu-trigger"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuOpen({ id: candidate.id, x: rect.right, y: rect.bottom + 4 });
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="3.5" r="1.2" fill="currentColor"/>
                    <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
                    <circle cx="8" cy="12.5" r="1.2" fill="currentColor"/>
                  </svg>
                </button>
              </span>
            </button>
          );
        })}
      </div>
      {confirmRemove ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !removing) setConfirmRemove(null); }}>
          <section aria-modal="true" className="modal-panel" role="dialog" aria-labelledby="confirm-remove-project-title" style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <div>
                <h3 id="confirm-remove-project-title">Remove project?</h3>
                <p>This removes <strong>{confirmRemove.name}</strong> from SharkBay. Files on disk are not deleted.</p>
              </div>
              <button aria-label="Close" className="icon-button" disabled={removing} type="button" onClick={() => setConfirmRemove(null)}>x</button>
            </div>
            <div className="remote-machine-form-actions" style={{ padding: "12px 16px 16px" }}>
              <button className="button secondary" disabled={removing} type="button" onClick={() => setConfirmRemove(null)}>Cancel</button>
              <button className="button is-danger" disabled={removing} type="button" onClick={async () => {
                const target = confirmRemove;
                if (!target) return;
                setRemoving(true);
                try { await onRemoveProject(target.uri); setConfirmRemove(null); } finally { setRemoving(false); }
              }}>{removing ? "Removing" : "Remove"}</button>
            </div>
          </section>
        </div>
      ) : null}
      {menuOpen ? (
        <div ref={menuRef} className="project-context-menu" style={{ top: menuOpen.y, left: menuOpen.x }}>
          <button
            className="project-context-menu-item"
            type="button"
            onClick={() => {
              const candidate = candidates.find((c) => c.id === menuOpen.id);
              setMenuOpen(null);
              if (candidate) {
                setRenameValue(projectAliases[candidate.uri] || candidate.name);
                setRenamingId(candidate.id);
              }
            }}
          >
            Rename
          </button>
          <button
            className="project-context-menu-item is-danger"
            type="button"
            onClick={() => {
              const candidate = candidates.find((c) => c.id === menuOpen.id);
              setMenuOpen(null);
              if (candidate) setConfirmRemove({ uri: candidate.uri, name: projectAliases[candidate.uri] || candidate.name });
            }}
          >
            Remove Project
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProjectIcon({ name, sources }: { name: string; sources: NonNullable<ProjectCandidate["iconSources"]> }) {
  const signature = sources.map((s) => s.url).join("|");
  const [failedCount, setFailedCount] = useState(0);
  useEffect(() => { setFailedCount(0); }, [signature]);
  const source = sources[failedCount];
  const imageUrl = source?.url ?? defaultProjectIconUrl;
  const isSharkAppIcon = source?.kind === "local" && /^shark(?:-(?:morning|day|night))?\.png$/u.test(source.label);
  return (
    <span className={cx("project-icon", !source && "is-default", isSharkAppIcon && "is-shark-app")} aria-hidden="true" title={`${name} icon`}>
      <img
        alt=""
        draggable={false}
        src={imageUrl}
        onError={() => setFailedCount((current) => {
          if (current < sources.length) return current + 1;
          return sources.length;
        })}
      />
    </span>
  );
}

function BrowserTabIcon({ browser }: { browser: BrowserSession }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = !failed && browser.faviconUrl ? browser.faviconUrl : defaultProjectIconUrl;
  useEffect(() => { setFailed(false); }, [browser.faviconUrl]);
  return (
    <span className={cx("browser-tab-icon", !browser.faviconUrl || failed ? "is-default" : "has-favicon")} aria-hidden="true">
      <img alt="" draggable={false} src={imageUrl} onError={() => setFailed(true)} />
    </span>
  );
}

function EditorTabIcon({ dirty }: { dirty: boolean }) {
  return (
    <span className={cx("editor-tab-icon", dirty && "is-dirty")} aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path d="M3 2.5h6.5L13 6v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9.5 2.5V6H13" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </span>
  );
}

function EditorSurface({ active, appearanceTheme, tab, onChange, onSave }: {
  active: boolean;
  appearanceTheme: AppearanceTheme;
  tab: EditorTab;
  onChange: (content: string) => void;
  onSave: () => void;
}) {
  const dirty = tab.content !== tab.savedContent;
  return (
    <div aria-hidden={!active} className={cx("editor-surface", active && "is-active")}>
      <div className="editor-toolbar">
        <span className="editor-path truncate" title={tab.relativePath}>{tab.relativePath}</span>
        <div className="editor-toolbar-spacer" />
        {tab.error ? <span className="editor-error truncate" title={tab.error}>{tab.error}</span> : null}
        {tab.readOnly ? <span className="editor-badge">Read-only</span> : null}
        <button className="button compact" disabled={!dirty || tab.saving || tab.readOnly || tab.loading} type="button" onClick={onSave}>
          {tab.saving ? "Saving" : dirty ? "Save" : "Saved"}
        </button>
      </div>
      <div className="editor-body">
        {tab.loading ? (
          <div className="editor-loading">Loading…</div>
        ) : (
          <CodeEditor
            appearanceTheme={appearanceTheme}
            initialContent={tab.content}
            relativePath={tab.relativePath}
            readOnly={tab.readOnly}
            onChange={onChange}
            onSave={onSave}
          />
        )}
      </div>
    </div>
  );
}

function ProjectDetailPane({ detail, candidate, setToast, onRefresh, onOpenFileInEditor, onOpenGitDiff, onOpenBrowserTab }: {
  detail: ProjectDetail | null;
  candidate: ProjectCandidate;
  setToast: (toast: Toast) => void;
  onRefresh: () => Promise<void>;
  onOpenFileInEditor: (relativePath: string) => Promise<void>;
  onOpenGitDiff: (relativePath: string) => Promise<void>;
  onOpenBrowserTab: (url: string) => Promise<void>;
}) {
  const isRemote = candidate.providerKind === "ssh";
  const isLocal = candidate.providerKind === "local";
  const availableTabs = detailTabs.filter((tab) => (!tab.remoteOnly || isRemote) && (!tab.localOnly || isLocal));
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("git");

  useEffect(() => { setActiveDetailTab("git"); }, [candidate.id]);

  function handleDetailTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: DetailTab) {
    const currentIndex = availableTabs.findIndex((item) => item.id === tab);
    const lastIndex = availableTabs.length - 1;
    let nextTab: DetailTab | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextTab = availableTabs[currentIndex === lastIndex ? 0 : currentIndex + 1]?.id ?? "git";
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextTab = availableTabs[currentIndex <= 0 ? lastIndex : currentIndex - 1]?.id ?? "git";
    if (!nextTab) return;
    event.preventDefault();
    setActiveDetailTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`project-detail-tab-${nextTab}`)?.focus());
  }

  return (
    <div className="detail-layout">
      <div className="detail-tab-cards" role="tablist" aria-label="Project detail sections">
        {availableTabs.map((tab) => (
          <button aria-controls={`project-detail-tabpanel-${tab.id}`} aria-selected={activeDetailTab === tab.id} className={cx("detail-tab-card", activeDetailTab === tab.id && "is-active")} id={`project-detail-tab-${tab.id}`} key={tab.id} role="tab" tabIndex={activeDetailTab === tab.id ? 0 : -1} type="button" onKeyDown={(event) => handleDetailTabKeyDown(event, tab.id)} onClick={() => setActiveDetailTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      <div aria-labelledby="project-detail-tab-git" className="detail-tab-panel" hidden={activeDetailTab !== "git"} id="project-detail-tabpanel-git" role="tabpanel">
        <GitDetailTab detail={detail} candidate={candidate} setToast={setToast} onOpenFileInEditor={onOpenFileInEditor} onOpenGitDiff={onOpenGitDiff} />
      </div>
      {isLocal ? (
        <div aria-labelledby="project-detail-tab-team" className="detail-tab-panel" hidden={activeDetailTab !== "team"} id="project-detail-tabpanel-team" role="tabpanel">
          <TasksDetailTab active={activeDetailTab === "team"} candidate={candidate} setToast={setToast} onOpenBrowserTab={onOpenBrowserTab} onRefresh={onRefresh} />
        </div>
      ) : null}
      <div aria-labelledby="project-detail-tab-stack" className="detail-tab-panel" hidden={activeDetailTab !== "stack"} id="project-detail-tabpanel-stack" role="tabpanel">
        <StackDetailTab active={activeDetailTab === "stack"} candidate={candidate} setToast={setToast} />
      </div>
      <div aria-labelledby="project-detail-tab-files" className="detail-tab-panel" hidden={activeDetailTab !== "files"} id="project-detail-tabpanel-files" role="tabpanel">
        <FilesDetailTab active={activeDetailTab === "files"} candidate={candidate} detail={detail} setToast={setToast} onOpenFileInEditor={onOpenFileInEditor} />
      </div>
      {isRemote ? (
        <div aria-labelledby="project-detail-tab-forwards" className="detail-tab-panel" hidden={activeDetailTab !== "forwards"} id="project-detail-tabpanel-forwards" role="tabpanel">
          <PortForwardsDetailTab active={activeDetailTab === "forwards"} candidate={candidate} setToast={setToast} />
        </div>
      ) : null}
    </div>
  );
}

function GitDetailTab({ detail, candidate, setToast, onOpenFileInEditor, onOpenGitDiff }: { detail: ProjectDetail | null; candidate: ProjectCandidate; setToast: (toast: Toast) => void; onOpenFileInEditor: (relativePath: string) => Promise<void>; onOpenGitDiff: (relativePath: string) => Promise<void> }) {
  return (
    <>
      <ProjectFactsCard detail={detail} candidate={candidate} />
      <DirtyFilesPanel detail={detail} setToast={setToast} onOpenFileInEditor={onOpenFileInEditor} onOpenGitDiff={onOpenGitDiff} />
      {detail?.gitHistory?.length || detail?.currentBranch ? (
        <GitHistoryItems events={detail?.gitHistory ?? []} />
      ) : (
        <EmptyState title="No git history" body="Restart SharkBay once to load Git history." />
      )}
    </>
  );
}

function taskPill(task: TaskViewModel): { label: string; cls: string } {
  if (task.status === "completed" && task.sync === "failed") return { label: "Sync failed", cls: "phase-blocked" };
  if (task.status === "completed") return { label: "Done", cls: "phase-done" };
  if (task.status === "active") return { label: "Active", cls: "phase-done" };
  if (task.status === "paused") return { label: "Paused", cls: "phase-blocked" };
  if (task.status === "blocked") return { label: "Blocked", cls: "phase-blocked" };
  if (task.status === "abandoned") return { label: "Dropped", cls: "phase-blocked" };
  return { label: task.status, cls: "phase-waiting" };
}

function TasksDetailTab({ active, candidate, setToast, onOpenBrowserTab, onRefresh }: {
  active: boolean;
  candidate: ProjectCandidate;
  setToast: (toast: Toast) => void;
  onOpenBrowserTab: (url: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const repoPath = localPathFromCandidate(candidate);
  const [tasks, setTasks] = useState<TaskViewModel[]>([]);
  const [status, setStatus] = useState<TeamworkStatus | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"install" | "sync" | "site" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const selected = useMemo(
    () => selectedTaskId ? tasks.find((task) => task.taskId === selectedTaskId) ?? null : null,
    [selectedTaskId, tasks],
  );

  useEffect(() => {
    if (!active || !repoPath) return;
    let cancelled = false;
    const activeRepoPath = repoPath;
    const teamwork = getBridge().teamwork;
    const getTasks = teamwork?.getTasks;
    const getStatus = teamwork?.getStatus;
    if (!getTasks || !getStatus) {
      setLoadError("Teamwork APIs are not exposed by the preload bridge.");
      return;
    }
    const getTasksHandler: NonNullable<NonNullable<SharkBayBridge["teamwork"]>["getTasks"]> = getTasks;
    const getStatusHandler: NonNullable<NonNullable<SharkBayBridge["teamwork"]>["getStatus"]> = getStatus;

    async function refresh(showToast: boolean) {
      try {
        const [nextTasks, nextStatus] = await Promise.all([
          getTasksHandler({ repoPath: activeRepoPath }),
          getStatusHandler({ repoPath: activeRepoPath }),
        ]);
        if (cancelled) return;
        setTasks(nextTasks);
        setStatus(nextStatus);
        setSelectedTaskId((current) => current && nextTasks.some((task) => task.taskId === current) ? current : null);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        const message = asMessage(error);
        setLoadError(message);
        if (showToast) setToast({ tone: "error", message });
      }
    }

    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), 3000);
    const unsubscribe = teamwork?.onTasksChanged?.((event) => {
      if (event.repoPath === activeRepoPath) {
        setTasks(event.tasks);
        setSelectedTaskId((current) => current && event.tasks.some((task) => task.taskId === current) ? current : null);
      }
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unsubscribe?.();
    };
  }, [active, repoPath, setToast]);

  async function installTeamworkHarness() {
    if (!repoPath) return;
    setBusyAction("install");
    try {
      const install = getBridge().teamwork?.install;
      if (!install) throw new Error("Teamwork install API is not available.");
      const nextStatus = await install({ repoPath });
      setStatus(nextStatus);
      setToast({ tone: "success", message: "Teamwork installed." });
      await onRefresh();
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  async function syncNow() {
    if (!repoPath) return;
    setBusyAction("sync");
    try {
      const sync = getBridge().teamwork?.syncNow;
      const getStatus = getBridge().teamwork?.getStatus;
      const getTasks = getBridge().teamwork?.getTasks;
      if (!sync) throw new Error("Teamwork sync API is not available.");
      await sync({ repoPath });
      if (getStatus) setStatus(await getStatus({ repoPath }));
      if (getTasks) setTasks(await getTasks({ repoPath }));
      setToast({ tone: "success", message: "Teamwork synced." });
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  async function openKnowledgeSite() {
    if (!repoPath) return;
    setBusyAction("site");
    try {
      const generate = getBridge().knowledgeSite?.generate;
      const getPath = getBridge().knowledgeSite?.getPath;
      if (!generate || !getPath) throw new Error("Knowledge Site API is not available.");
      await generate({ repoPath });
      const sitePath = await getPath({ repoPath });
      await onOpenBrowserTab(`file://${sitePath}`);
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  if (!repoPath) return <EmptyState title="Teamwork unavailable" body="Teamwork is available for local Git projects." />;

  if (selected) {
    const pill = taskPill(selected);
    return (
      <div className="mock-task-detail">
        <div className="task-detail-header">
          <button className="icon-button" type="button" onClick={() => setSelectedTaskId(null)} aria-label="Back to task list">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="task-avatar task-detail-avatar">
            {selected.owner.avatarUrl ? <img alt="" src={selected.owner.avatarUrl} /> : selected.owner.githubLogin.slice(0, 2).toUpperCase()}
          </span>
          <div className="task-detail-title">
            <h3>{selected.title}</h3>
            <span>{selected.taskTag} · {selected.owner.githubLogin}</span>
          </div>
          <strong className={cx("phase-pill", pill.cls)}>{pill.label}</strong>
        </div>
        <div className="task-detail-compact">
          <pre className="task-detail-pre">{selected.rawMarkdown}</pre>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="subpanel project-facts-card teamwork-facts-card">
        <div className="panel-title-row compact-title-row">
          <h4>Teamwork</h4>
          {status?.installed ? <button className="button secondary compact" disabled={busyAction !== null} type="button" onClick={() => void syncNow()}>{busyAction === "sync" ? "Syncing" : "Sync"}</button> : null}
        </div>
        <div className="project-facts-list">
          <div className="repository-fact"><span>Status</span><strong>{status?.installed ? "Installed" : status?.harnessInstalled ? "Harness only" : "Not installed"}</strong></div>
          {status?.repo ? <div className="repository-fact"><span>Repo</span><strong>{status.repo}</strong></div> : null}
          {status?.githubLogin ? <div className="repository-fact"><span>User</span><strong>{status.githubLogin}</strong></div> : null}
          {status?.pendingCount ? <div className="repository-fact"><span>Pending</span><strong>{String(status.pendingCount)}</strong></div> : null}
          {(loadError || status?.lastError) ? <div className="repository-fact is-warn"><span>Error</span><strong>{loadError || status?.lastError}</strong></div> : null}
        </div>
      </section>

      {status && !status.installed ? (
        <section className="subpanel confirm-panel teamwork-action-card">
          <div>
            <h4>Install Teamwork</h4>
            <p className="summary-text">Requires a GitHub origin and write access. Installation creates the local harness and enables team sync.</p>
          </div>
          <div className="button-row">
            <button className="button compact" disabled={busyAction !== null} type="button" onClick={() => void installTeamworkHarness()}>
              {busyAction === "install" ? "Installing" : "Install Teamwork"}
            </button>
          </div>
        </section>
      ) : null}

      {status?.installed ? (
        <section className="subpanel confirm-panel teamwork-action-card">
          <div>
            <h4>Knowledge Site</h4>
            <p className="summary-text">Browse project docs and team task history as a local site.</p>
          </div>
          <div className="button-row">
            <button className="button compact" disabled={busyAction !== null} type="button" onClick={() => void openKnowledgeSite()}>
              {busyAction === "site" ? "Opening" : "Open Site"}
            </button>
          </div>
        </section>
      ) : null}

      <div className="queue-list task-list-direct">
        {tasks.map((task) => {
          const pill = taskPill(task);
          const createdTime = task.createdAt ? formatRelativeTime(task.createdAt) : null;
          return (
            <button className="queue-item" key={task.taskId} type="button" onClick={() => setSelectedTaskId(task.taskId)}>
              <span className="task-avatar">
                {task.owner.avatarUrl ? <img alt="" src={task.owner.avatarUrl} /> : task.owner.githubLogin.slice(0, 2).toUpperCase()}
              </span>
              <span className="task-row-main">
                <span className="task-title">{task.title}</span>
                <small>{task.taskTag} · {task.owner.githubLogin}{createdTime ? ` · ${createdTime}` : ""}</small>
              </span>
              <span className={cx("phase-pill", pill.cls)}>{pill.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ProjectFactsCard({ detail, candidate }: { detail: ProjectDetail | null; candidate: ProjectCandidate }) {
  const worktree = detail?.dirtyWorktree === null ? null : detail?.dirtyWorktree ? "Dirty" : "Clean";
  const facts = [
    { label: "Path", value: detail?.displayPath ?? candidate.displayPath },
    { label: "URI", value: detail?.uri ?? candidate.uri },
    { label: "Repo URL", value: detail?.repoUrl },
    { label: "Branch", value: detail?.currentBranch },
    { label: "Worktree", value: worktree, tone: detail?.dirtyWorktree ? "warn" as const : undefined },
  ].filter((fact): fact is { label: string; value: string; tone?: "warn" } => Boolean(fact.value));

  return (
    <section className="subpanel project-facts-card">
      <div className="panel-title-row compact-title-row">
        <h4>Repository</h4>
      </div>
      <div className="project-facts-list">
        {facts.map((fact) => (
          <div className={cx("repository-fact", fact.tone === "warn" && "is-warn")} key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function StackDetailTab({ active, candidate, setToast }: { active: boolean; candidate: ProjectCandidate; setToast: (toast: Toast) => void }) {
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const forceRefreshRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const readProject = getBridge().profiles?.readProject;
    if (!readProject) { setLoadError("Project profile API is not available."); return; }
    const wasForcedRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;
    setBusy(true);
    setLoadError(null);
    readProject({ projectUri: candidate.uri, options: wasForcedRefresh ? { refresh: true } : undefined })
      .then((next) => { if (!cancelled) setProfile(next); })
      .catch((error) => { if (!cancelled) setLoadError(asMessage(error)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [active, candidate.uri, fetchKey]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setFetchKey((current) => current + 1), 30000);
    return () => window.clearInterval(timer);
  }, [active, candidate.uri]);

  function refresh() {
    forceRefreshRef.current = true;
    setFetchKey((current) => current + 1);
    setToast({ tone: "info", message: "Refreshing project profile" });
  }

  if (loadError) return <div className="inline-connection-result is-error" role="status">{loadError}</div>;
  if (!profile && busy) return <div className="empty-state compact-title-row" style={{ padding: "24px 16px" }}><span>Loading project profile…</span></div>;
  if (!profile) return <EmptyState title="No project profile" body="Open the Stack tab again to detect this project." />;

  const commandEntries = Object.entries(profile.commands).filter(([, value]) => value);
  return (
    <>
      <section className="subpanel project-facts-card">
        <div className="panel-title-row compact-title-row">
          <h4>Stack</h4>
          <button aria-label="Refresh project profile" className="icon-button" disabled={busy} type="button" onClick={refresh}><RefreshIcon /></button>
        </div>
        <div className="project-facts-list">
          {profile.languages.length ? <ProfileChipFact label="Languages" items={profile.languages.map((item) => item.id)} /> : null}
          {profile.frameworks.length ? <ProfileChipFact label="Frameworks" items={profile.frameworks.map((item) => item.id)} /> : null}
          {profile.packageManagers.length ? <ProfileChipFact label="Package managers" items={profile.packageManagers.map((item) => item.id)} /> : null}
          {profile.structure.monorepo ? <div className="repository-fact"><span>Structure</span><strong>Monorepo</strong></div> : null}
        </div>
      </section>
      {commandEntries.length ? (
        <section className="subpanel project-facts-card">
          <div className="panel-title-row compact-title-row"><h4>Commands</h4></div>
          <div className="project-facts-list">
            {commandEntries.map(([key, value]) => (
              <div className="repository-fact" key={key}><span>{key}</span><strong>{value}</strong></div>
            ))}
          </div>
        </section>
      ) : null}
      {profile.services.length ? (
        <section className="subpanel project-facts-card">
          <div className="panel-title-row compact-title-row"><h4>Services</h4></div>
          <div className="project-facts-list">
            {profile.services.map((service) => (
              <div className="repository-fact" key={service.id}><span>{service.label}</span><strong>{service.command}</strong></div>
            ))}
          </div>
        </section>
      ) : null}
      {profile.env.files.length || profile.env.exampleFiles.length ? (
        <section className="subpanel project-facts-card">
          <div className="panel-title-row compact-title-row"><h4>Env files</h4></div>
          <div className="project-facts-list">
            {profile.env.files.map((file) => (<div className="repository-fact" key={`env-${file}`}><span>env</span><strong>{file}</strong></div>))}
            {profile.env.exampleFiles.map((file) => (<div className="repository-fact" key={`example-${file}`}><span>example</span><strong>{file}</strong></div>))}
          </div>
        </section>
      ) : null}
      {profile.structure.importantFiles.length ? (
        <section className="subpanel project-facts-card">
          <div className="panel-title-row compact-title-row"><h4>Important files</h4></div>
          <div className="project-facts-list">
            {profile.structure.importantFiles.map((file) => (<div className="repository-fact" key={file}><span>file</span><strong>{file}</strong></div>))}
          </div>
        </section>
      ) : null}
      {profile.warnings.length ? (
        <section className="subpanel project-facts-card">
          <div className="panel-title-row compact-title-row"><h4>Warnings</h4></div>
          <div className="project-facts-list">
            {profile.warnings.map((warning, index) => (<div className="repository-fact is-warn" key={`${warning.code}-${index}`}><span>{warning.code}</span><strong>{warning.message}</strong></div>))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ProfileChipFact({ label, items }: { label: string; items: string[] }) {
  return <div className="repository-fact"><span>{label}</span><strong>{items.join(", ")}</strong></div>;
}

function DirtyFilesPanel({ detail, setToast, onOpenFileInEditor, onOpenGitDiff }: { detail: ProjectDetail | null; setToast: (toast: Toast) => void; onOpenFileInEditor: (relativePath: string) => Promise<void>; onOpenGitDiff: (relativePath: string) => Promise<void> }) {
  const files = detail?.gitDirtyFiles ?? [];
  if (!files.length) return null;
  return (
    <section className="subpanel dirty-files-card">
      <div className="panel-title-row compact-title-row">
        <h4>Dirty Files</h4>
        <span className="form-note">{files.length} changed</span>
      </div>
      <div className="dirty-file-list">
        {files.map((file) => (
          <button
            className="dirty-file-row"
            key={`${file.status}-${file.path}`}
            title={`${file.status} ${file.path}`}
            type="button"
            onDoubleClick={() => void (file.status === "??" ? onOpenFileInEditor(file.path) : onOpenGitDiff(file.path)).catch((error) => setToast({ tone: "error", message: asMessage(error) }))}
          >
            <span className="dirty-file-status">{file.status}</span>
            <span className="dirty-file-path">{file.path}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function GitHistoryItems({ events }: { events: NonNullable<ProjectDetail["gitHistory"]> }) {
  const visible = events ?? [];
  return (
    <div className="decision-list">
      {visible.map((event) => {
        const actionMatch = /^([^:]+:)(?:\s*(.*))?$/u.exec(event.action);
        return (
          <div className="decision-item" key={`${event.selector}-${event.hash}-${event.date}`}>
            <div className="decision-action">
              {actionMatch ? (
                <>
                  <strong>{actionMatch[1]}</strong>
                  {actionMatch[2] ? ` ${actionMatch[2]}` : null}
                </>
              ) : event.action}
            </div>
            <div className="decision-side-meta">
              <span className="decision-meta">{event.hash.slice(0, 7)}</span>
              <span className="history-time">{formatRelativeTime(event.date)}</span>
            </div>
          </div>
        );
      })}
      {!visible.length ? <div className="muted-row">Restart SharkBay once to load Git history.</div> : null}
    </div>
  );
}

function PortForwardsDetailTab({ active, candidate, setToast }: {
  active: boolean;
  candidate: ProjectCandidate;
  setToast: (toast: Toast) => void;
}) {
  const machineId = candidate.providerId;
  const [forwards, setForwards] = useState<RemotePortForward[]>([]);
  const [detectedPorts, setDetectedPorts] = useState<RemoteDetectedPort[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [remotePort, setRemotePort] = useState("8080");
  const [localPort, setLocalPort] = useState("8080");
  const [busy, setBusy] = useState(false);
  const [forwardingKey, setForwardingKey] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function refresh() {
    const listHandler = getBridge().portForwards?.list;
    const detectHandler = getBridge().portForwards?.detect;
    if (!listHandler) return;
    setLoading(true);
    setDetecting(Boolean(detectHandler));
    try {
      const [items, detected] = await Promise.all([
        listHandler({ machineId }),
        detectHandler?.({ machineId }) ?? Promise.resolve([]),
      ]);
      setForwards(items);
      setDetectedPorts(detected);
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setLoading(false);
      setDetecting(false);
    }
  }

  useEffect(() => { if (active) void refresh(); }, [active, machineId]);
  useEffect(() => {
    const unsubscribe = getBridge().portForwards?.onUpdate?.((event) => {
      if (event.forward.machineId !== machineId) return;
      setForwards((current) => {
        const exists = current.some((item) => item.id === event.forward.id);
        if (event.forward.status === "stopped" && !exists) return current;
        if (!exists) return [...current, event.forward];
        return current.map((item) => (item.id === event.forward.id ? event.forward : item));
      });
      setDetectedPorts((current) => current.map((port) => (
        port.remotePort === event.forward.remotePort && port.machineId === event.forward.machineId
          ? { ...port, forwarded: event.forward.status === "running" || event.forward.status === "starting", forwardId: event.forward.id, localPort: event.forward.localPort, status: event.forward.status }
          : port
      )));
    });
    return () => unsubscribe?.();
  }, [machineId]);

  async function addForward(event: FormEvent) {
    event.preventDefault();
    const handler = getBridge().portForwards?.create;
    if (!handler) return;
    const remote = Number.parseInt(remotePort, 10);
    const local = Number.parseInt(localPort, 10);
    if (!Number.isInteger(remote) || remote < 1 || remote > 65535 || !Number.isInteger(local) || local < 1 || local > 65535) {
      setToast({ tone: "error", message: "Ports must be integers between 1 and 65535." });
      return;
    }
    setBusy(true);
    try {
      await handler({ machineId, remotePort: remote, localPort: local });
      setToast({ tone: "success", message: `Forwarding localhost:${local} → ${candidate.providerId}:${remote}` });
      await refresh();
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function removeForward(id: string) {
    const handler = getBridge().portForwards?.remove;
    if (!handler) return;
    setRemovingId(id);
    try {
      await handler({ id });
      setForwards((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setRemovingId(null);
    }
  }

  async function forwardDetected(port: RemoteDetectedPort, openAfterStart: boolean) {
    const handler = getBridge().portForwards?.create;
    if (!handler) return;
    const key = detectedPortKey(port);
    setForwardingKey(key);
    try {
      const forward = await handler({ machineId, remotePort: port.remotePort, remoteHost: port.remoteHost });
      setToast({ tone: "success", message: `Forwarding localhost:${forward.localPort} → ${candidate.providerId}:${port.remotePort}` });
      if (openAfterStart) openForward(forward, port.protocol);
      await refresh();
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setForwardingKey(null);
    }
  }

  function openForward(forward: RemotePortForward, protocol: "http" | "https" | null = "http") {
    window.open(`${protocol ?? "http"}://127.0.0.1:${forward.localPort}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="subpanel port-forwards-panel">
      <header className="port-forwards-toolbar">
        <div className="port-forwards-title-block">
          <h4>Port forwards</h4>
          <span>{candidate.providerId}</span>
        </div>
        <div className="port-forwards-summary">
          <span>{detectedPorts.length} detected</span>
          <span>{forwards.length} active</span>
          <button className="button secondary compact" disabled={detecting} type="button" onClick={() => void refresh()}>
            {detecting ? "Scanning" : "Scan"}
          </button>
        </div>
      </header>

      <div className="port-forward-section">
        <div className="port-forward-section-header">
          <h5>Detected</h5>
          <span>One-click tunnels for listening remote services.</span>
        </div>
        {detecting && !detectedPorts.length ? (
          <div className="port-forward-empty">Scanning remote listeners...</div>
        ) : detectedPorts.length ? (
          <div className="port-forward-table">
            {detectedPorts.map((port) => {
              const forward = port.forwardId ? forwards.find((item) => item.id === port.forwardId) : forwards.find((item) => item.remotePort === port.remotePort && item.remoteHost === port.remoteHost);
              const key = detectedPortKey(port);
              return (
                <div className={cx("port-forward-row", port.forwarded ? "is-running" : "is-detected")} key={key}>
                  <div className="port-forward-service">
                    <strong>{port.label}</strong>
                    <span>{port.processName ? `${port.processName}${port.pid ? ` · pid ${port.pid}` : ""}` : "remote process"}</span>
                  </div>
                  <div className="port-forward-route">
                    <span>{port.remoteHost}:{port.remotePort}</span>
                    <span>{port.forwarded ? `127.0.0.1:${port.localPort}` : "not forwarded"}</span>
                  </div>
                  <span className={cx("port-forward-status", port.forwarded ? "is-running" : "is-detected")}>{port.forwarded ? "active" : "detected"}</span>
                  <div className="port-forward-row-actions">
                    {port.forwarded && forward ? (
                      <button className="button secondary compact" type="button" onClick={() => openForward(forward, port.protocol)}>Open</button>
                    ) : (
                      <>
                        <button className="button secondary compact" disabled={forwardingKey === key} type="button" onClick={() => void forwardDetected(port, false)}>
                          {forwardingKey === key ? "Starting" : "Forward"}
                        </button>
                        {port.protocol ? (
                          <button className="button compact" disabled={forwardingKey === key} type="button" onClick={() => void forwardDetected(port, true)}>Open</button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="port-forward-empty">No listening ports detected.</div>
        )}
      </div>

      <div className="port-forward-section">
        <div className="port-forward-section-header">
          <h5>Manual</h5>
          <span>Use this when a service is not discoverable yet.</span>
        </div>
        <form className="port-forward-form" onSubmit={(event) => void addForward(event)}>
          <label><span>Remote</span><input className="input" inputMode="numeric" value={remotePort} onChange={(event) => setRemotePort(event.target.value)} placeholder="8080" /></label>
          <label><span>Local</span><input className="input" inputMode="numeric" value={localPort} onChange={(event) => setLocalPort(event.target.value)} placeholder="auto" /></label>
          <button className="button compact" disabled={busy} type="submit">{busy ? "Starting" : "Forward"}</button>
        </form>
      </div>

      <div className="port-forward-section">
        <div className="port-forward-section-header">
          <h5>Active</h5>
          <span>{forwards.length} tunnel{forwards.length === 1 ? "" : "s"} running or recently stopped.</span>
        </div>
        {loading && !forwards.length ? (
          <div className="port-forward-empty">Loading forwards...</div>
        ) : forwards.length ? (
          <div className="port-forward-table">
            {forwards.map((forward) => (
              <div className={cx("port-forward-row", `is-${forward.status}`)} key={forward.id}>
                <div className="port-forward-service">
                  <strong>localhost:{forward.localPort}</strong>
                  <span>{forward.status}</span>
                </div>
                <div className="port-forward-route">
                  <span>127.0.0.1:{forward.localPort}</span>
                  <span>{forward.remoteHost}:{forward.remotePort}</span>
                </div>
                <span className={cx("port-forward-status", `is-${forward.status}`)}>{forward.status}</span>
                <div className="port-forward-row-actions">
                  {forward.status === "running" ? <button className="button secondary compact" type="button" onClick={() => openForward(forward)}>Open</button> : null}
                  <button className="button secondary compact" disabled={removingId === forward.id} type="button" onClick={() => void removeForward(forward.id)}>
                    {removingId === forward.id ? "Stopping" : "Stop"}
                  </button>
                </div>
                {forward.error ? <div className="port-forward-error">{forward.error}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="port-forward-empty">No active forwards.</div>
        )}
      </div>
    </section>
  );
}

function detectedPortKey(port: RemoteDetectedPort): string {
  return `${port.machineId}:${port.remoteHost}:${port.remotePort}`;
}

function FilesDetailTab({ active, candidate, detail, setToast, onOpenFileInEditor }: {
  active: boolean;
  candidate: ProjectCandidate;
  detail: ProjectDetail | null;
  setToast: (toast: Toast) => void;
  onOpenFileInEditor: (relativePath: string) => Promise<void>;
}) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; files: ProjectFileTreeItem[] }>({ loading: false, error: null, files: [] });
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set());
  const activeFilesProjectUri = useRef(candidate.uri);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    activeFilesProjectUri.current = candidate.uri;
    setExpandedDirectories(new Set());
    setLoadingDirectories(new Set());
    setState({ loading: true, error: null, files: [] });
    void listProjectFiles(candidate).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setState({ loading: false, error: result.message, files: [] }); return; }
      setState({ loading: false, error: null, files: result.files });
    }).catch((error) => { if (!cancelled) setState({ loading: false, error: asMessage(error), files: [] }); });
    return () => { cancelled = true; };
  }, [active, candidate.id, candidate.uri]);

  async function openFile(item: ProjectFileTreeItem) {
    if (item.kind !== "file") return;
    try { await onOpenFileInEditor(item.path); } catch (error) { setToast({ tone: "error", message: asMessage(error) }); }
  }

  async function toggleDirectory(item: ProjectFileTreeItem) {
    if (loadingDirectories.has(item.path)) return;
    if (expandedDirectories.has(item.path)) {
      setExpandedDirectories((current) => { const next = new Set(current); next.delete(item.path); return next; });
      return;
    }

    if (item.children === undefined) {
      setLoadingDirectories((current) => new Set(current).add(item.path));
      try {
        const result = await listProjectFiles(candidate, item.path);
        if (activeFilesProjectUri.current !== candidate.uri) return;
        if (!result.ok) throw new Error(result.message);
        setState((current) => ({ ...current, files: updateProjectFileChildren(current.files, item.path, result.files) }));
      } catch (error) {
        setToast({ tone: "error", message: asMessage(error) });
        return;
      } finally {
        if (activeFilesProjectUri.current === candidate.uri) {
          setLoadingDirectories((current) => { const next = new Set(current); next.delete(item.path); return next; });
        }
      }
    }

    setExpandedDirectories((current) => new Set(current).add(item.path));
  }

  if (state.loading && !state.files.length) return <EmptyState title="Loading files" body="Reading project files." />;
  if (state.error) return <EmptyState title="Files unavailable" body={state.error} />;
  if (!state.files.length) return <EmptyState title="No files" body="This project has no visible files." />;

  return (
    <section className="subpanel files-card">
      <div className="project-file-tree" role="tree" aria-label="Project files">
        {state.files.map((item) => (
          <ProjectFileTreeItemRow key={item.path} item={item} level={1} expandedDirectories={expandedDirectories} loadingDirectories={loadingDirectories} onToggleDirectory={toggleDirectory} onOpenFile={openFile} />
        ))}
      </div>
    </section>
  );
}

function ProjectFileTreeItemRow({ item, level, expandedDirectories, loadingDirectories, onToggleDirectory, onOpenFile }: {
  item: ProjectFileTreeItem; level: number; expandedDirectories: Set<string>; loadingDirectories: Set<string>;
  onToggleDirectory: (item: ProjectFileTreeItem) => Promise<void>; onOpenFile: (item: ProjectFileTreeItem) => Promise<void>;
}) {
  const expandable = item.kind === "directory" && (item.children === undefined || item.children.length > 0);
  const expanded = expandable && expandedDirectories.has(item.path);
  const loading = loadingDirectories.has(item.path);
  const disabled = false;

  return (
    <>
      <div
        aria-disabled={disabled || undefined}
        aria-expanded={item.kind === "directory" ? expanded : undefined}
        className={cx("project-file-row", item.kind === "directory" && "is-directory", disabled && "is-disabled")}
        role="treeitem"
        style={{ "--file-tree-level": level } as CSSProperties}
        title={item.path}
      >
        {item.kind === "directory" ? (
          <button
            aria-label={`${expanded ? "Collapse" : "Expand"} ${item.name}`}
            className="project-file-toggle"
            disabled={!expandable}
            type="button"
            onClick={() => void onToggleDirectory(item)}
          >
            {loading ? "." : expandable ? (expanded ? "-" : "+") : ""}
          </button>
        ) : (
          <span className="project-file-toggle" aria-hidden="true" />
        )}
        <button
          className="project-file-action"
          disabled={disabled}
          type="button"
          onDoubleClick={() => void onOpenFile(item)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (item.kind === "directory" && expandable) {
                void onToggleDirectory(item);
                return;
              }
              void onOpenFile(item);
            }
          }}
        >
          <ProjectFileIcon item={item} expanded={expanded} />
          <span className="project-file-name">{item.name}</span>
        </button>
      </div>
      {expanded ? item.children?.map((child) => (
        <ProjectFileTreeItemRow key={child.path} item={child} level={level + 1} expandedDirectories={expandedDirectories} loadingDirectories={loadingDirectories} onToggleDirectory={onToggleDirectory} onOpenFile={onOpenFile} />
      )) : null}
    </>
  );
}

function ProjectFileIcon({ item, expanded }: { item: ProjectFileTreeItem; expanded: boolean }) {
  if (item.kind === "directory") {
    return (
      <span className={cx("project-file-icon", "is-folder", expanded && "is-open")} aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          <path d={expanded ? "M2 5.2h12.1v1.7H2z" : "M2 4.4h4.7l1.2 1.2H14v1.7H2z"} />
          <path d={expanded ? "M2.4 6.4h11.2l-1 5.2H3.4z" : "M2.6 6.4h10.8v5.2H2.6z"} />
        </svg>
      </span>
    );
  }
  return (
    <span className={cx("project-file-icon", fileIconClassName(item.name))} aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="M4 2.2h5.5L12 4.7v9.1H4z" />
        <path d="M9.3 2.4v2.7h2.5" />
      </svg>
    </span>
  );
}

function fileIconClassName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (/\.(tsx?|jsx?|mjs|cjs)$/u.test(lower)) return "is-code";
  if (/\.(css|scss|sass|less|html)$/u.test(lower)) return "is-style";
  if (/\.(json|ya?ml|toml|ini|env(?:\..*)?)$/u.test(lower) || lower.startsWith(".env")) return "is-config";
  if (/\.(md|mdx|txt|rst)$/u.test(lower)) return "is-doc";
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/u.test(lower)) return "is-image";
  return "is-file";
}

function updateProjectFileChildren(items: ProjectFileTreeItem[], targetPath: string, children: ProjectFileTreeItem[]): ProjectFileTreeItem[] {
  return items.map((item) => {
    if (item.path === targetPath) return { ...item, children };
    if (item.children) return { ...item, children: updateProjectFileChildren(item.children, targetPath, children) };
    return item;
  });
}

function SettingsView({ appearanceTheme, roots, configuredProjects, configuredRemoteProjects, remoteMachines, bridgeAvailable, lastScanAt, loading, candidates, scanErrors, setToast, onBack, onScan, onAdd, onRemove, onRemoveProject, onAddRemoteMachine, onRemoveRemoteMachine, onTestRemoteMachine, onThemeChange }: {
  appearanceTheme: AppearanceTheme; roots: RootRecord[]; configuredProjects: string[]; configuredRemoteProjects: string[]; remoteMachines: RemoteMachine[]; bridgeAvailable: boolean; lastScanAt: string | null; loading: boolean; candidates: ProjectCandidate[]; scanErrors: string[]; setToast: (toast: Toast) => void;
  onBack: () => void; onScan: () => Promise<void>; onAdd: (path: string) => Promise<void>; onRemove: (path: string) => Promise<void>; onRemoveProject: (path: string) => Promise<void>;
  onAddRemoteMachine: (input: RemoteMachineInput) => Promise<void>; onRemoveRemoteMachine: (id: string) => Promise<void>; onTestRemoteMachine: (input: { id: string } | RemoteMachineInput) => Promise<RemoteMachineTestResult>; onThemeChange: (theme: AppearanceTheme) => Promise<void>;
}) {
  const unavailableRootCount = roots.filter((root) => root.unavailable || root.available === false).length;
  const [activeSection, setActiveSection] = useState<SettingsSection>("local-machine");
  const [remoteMachineModalOpen, setRemoteMachineModalOpen] = useState(false);
  const activeRemoteMachineId = activeSection.startsWith("remote-machine:") ? activeSection.slice("remote-machine:".length) : null;
  const activeRemoteMachine = activeRemoteMachineId ? remoteMachines.find((machine) => machine.id === activeRemoteMachineId) ?? null : null;

  function sectionMeta(section: SettingsSection): string {
    if (section === "local-machine") {
      const projectCount = configuredProjects.length + configuredRemoteProjects.length;
      const projectLabel = `${projectCount} project${projectCount === 1 ? "" : "s"}`;
      const rootLabel = `${roots.length} root${roots.length === 1 ? "" : "s"}`;
      return `${projectLabel}, ${rootLabel}`;
    }
    if (section.startsWith("remote-machine:")) return "Remote";
    if (section === "extensions") return "Plugins";
    if (section === "diagnostics") return "Activity & latency";
    return appearanceThemes.find((theme) => theme.id === appearanceTheme)?.label ?? "Theme";
  }

  async function addRemoteMachine(input: RemoteMachineInput): Promise<void> {
    await onAddRemoteMachine(input);
    setRemoteMachineModalOpen(false);
  }

  return (
    <div className="settings-layout">
      <div className="detail-header settings-header">
        <button aria-label="Back to projects" className="icon-button" title="Back to projects" type="button" onClick={onBack}><ArrowLeftIcon /></button>
        <div><h3>Settings</h3><div className="path-line">Manage local and remote machines</div></div>
      </div>
      <div className="settings-shell">
        <aside className="settings-nav" aria-label="Settings sections">
          <div className="settings-nav-group">
            <button aria-current={activeSection === "local-machine" ? "page" : undefined} className={cx("settings-nav-item", activeSection === "local-machine" && "is-selected")} type="button" onClick={() => setActiveSection("local-machine")}>
              <span>Local Machine</span><small>{sectionMeta("local-machine")}</small>
            </button>
            <div className="settings-nav-section-title">
              <span>Remote machines</span>
              <button aria-label="Add remote machine" className="settings-add-remote-button" disabled={!bridgeAvailable} title="Add remote machine" type="button" onClick={() => setRemoteMachineModalOpen(true)}>
                <PlusIcon />
              </button>
            </div>
            {remoteMachines.map((machine) => {
              const sectionId = `remote-machine:${machine.id}` as const;
              return (
                <button aria-current={sectionId === activeSection ? "page" : undefined} className={cx("settings-nav-item", "is-remote-machine", sectionId === activeSection && "is-selected")} key={machine.id} type="button" onClick={() => setActiveSection(sectionId)}>
                  <span>{machine.label}</span>
                  <small><span>{remoteMachineAuthLabel(machine.authMode)}</span><span>{machine.sshConfigHost ?? machine.host}</span></small>
                </button>
              );
            })}
          </div>
          <div className="settings-nav-group">
            <button aria-current={activeSection === "extensions" ? "page" : undefined} className={cx("settings-nav-item", activeSection === "extensions" && "is-selected")} type="button" onClick={() => setActiveSection("extensions")}>
              <span>Extensions</span><small>{sectionMeta("extensions")}</small>
            </button>
            <button aria-current={activeSection === "diagnostics" ? "page" : undefined} className={cx("settings-nav-item", activeSection === "diagnostics" && "is-selected")} type="button" onClick={() => setActiveSection("diagnostics")}>
              <span>Diagnostics</span><small>{sectionMeta("diagnostics")}</small>
            </button>
            <button aria-current={activeSection === "appearance" ? "page" : undefined} className={cx("settings-nav-item", activeSection === "appearance" && "is-selected")} type="button" onClick={() => setActiveSection("appearance")}>
              <span>Appearance</span><small>{sectionMeta("appearance")}</small>
            </button>
          </div>
        </aside>
        <section className="settings-content" aria-label="Settings content">
          <div className="settings-section-panel" hidden={activeSection !== "local-machine"}>
            <div className="settings-section-heading"><h4>Local Machine</h4><span>{configuredProjects.length + configuredRemoteProjects.length} project{configuredProjects.length + configuredRemoteProjects.length === 1 ? "" : "s"}, {roots.length} root{roots.length === 1 ? "" : "s"}</span></div>
            <ProjectWorkflowPanel configuredProjects={configuredProjects} configuredRemoteProjects={configuredRemoteProjects} remoteMachines={remoteMachines} onRemoveProject={onRemoveProject} setToast={setToast} />
            <RootWorkflowPanel bridgeAvailable={bridgeAvailable} lastScanAt={lastScanAt} loading={loading} candidates={candidates} roots={roots} scanErrors={scanErrors} unavailableRootCount={unavailableRootCount} onAdd={onAdd} onRemove={onRemove} onScan={onScan} setToast={setToast} />
            <SettingsStatusPanel candidates={candidates} roots={roots} scanErrors={scanErrors} unavailableRootCount={unavailableRootCount} />
          </div>
          {activeRemoteMachine ? (
            <div className="settings-section-panel">
              <RemoteMachineDetailPanel machine={activeRemoteMachine} setToast={setToast} onRemove={async (id) => { await onRemoveRemoteMachine(id); setActiveSection("local-machine"); }} onTest={onTestRemoteMachine} />
            </div>
          ) : null}
          <div className="settings-section-panel" hidden={activeSection !== "extensions"}>
            <div className="settings-section-heading"><h4>Extensions</h4><span>Manage installed plugins</span></div>
            <ExtensionsSettingsPanel active={activeSection === "extensions"} setToast={setToast} />
          </div>
          <div className="settings-section-panel" hidden={activeSection !== "diagnostics"}>
            <div className="settings-section-heading"><h4>Diagnostics</h4><span>Inspect job queue, cache hits, SSH latency</span></div>
            <DiagnosticsSettingsPanel active={activeSection === "diagnostics"} setToast={setToast} />
          </div>
          <div className="settings-section-panel" hidden={activeSection !== "appearance"}>
            <div className="settings-section-heading"><h4>Appearance</h4><span>{appearanceDescription(appearanceTheme)}</span></div>
            <AppearanceSettingsPanel appearanceTheme={appearanceTheme} setToast={setToast} onThemeChange={onThemeChange} />
          </div>
        </section>
      </div>
      {remoteMachineModalOpen ? (
        <RemoteMachineDialog
          setToast={setToast}
          onAdd={addRemoteMachine}
          onClose={() => setRemoteMachineModalOpen(false)}
          onTest={onTestRemoteMachine}
        />
      ) : null}
    </div>
  );
}

function DiagnosticsSettingsPanel({ active, setToast }: { active: boolean; setToast: (toast: Toast) => void }) {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const read = getBridge().diagnostics?.read;
    if (!read) { setLoadError("Diagnostics API is not available."); return; }
    read()
      .then((next) => { if (!cancelled) { setSnapshot(next); setLoadError(null); } })
      .catch((error) => { if (!cancelled) setLoadError(asMessage(error)); });
    return () => { cancelled = true; };
  }, [active, fetchKey]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setFetchKey((current) => current + 1), 3000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (loadError) return <section className="workflow-panel"><div className="inline-connection-result is-error" role="status">{loadError}</div></section>;
  if (!snapshot) return <section className="workflow-panel"><div className="form-note">Loading diagnostics…</div></section>;

  const uptimeMs = Math.max(0, Date.parse(snapshot.collectedAt) - Date.parse(snapshot.processStartedAt));
  const terminalRate = uptimeMs > 0 ? (snapshot.terminalData.total / (uptimeMs / 1000)).toFixed(1) : "0";

  return (
    <>
      <section className="workflow-panel">
        <div className="panel-title-row compact-title-row">
          <h4>Core service</h4>
          <button aria-label="Refresh diagnostics" className="icon-button" type="button" onClick={() => { setFetchKey((current) => current + 1); setToast({ tone: "info", message: "Diagnostics refreshed" }); }}><RefreshIcon /></button>
        </div>
        <div className="settings-facts-grid">
          <Fact label="Process uptime" value={formatDurationLong(uptimeMs)} />
          <Fact label="Recent jobs" value={String(snapshot.recentJobs.length)} />
          <Fact label="Terminal events" value={`${snapshot.terminalData.total} (${terminalRate}/s)`} />
        </div>
      </section>
      <section className="workflow-panel">
        <div className="panel-title-row compact-title-row"><h4>Profile cache</h4></div>
        <div className="settings-facts-grid">
          <Fact label="Machine hits" value={String(snapshot.cache.machine.hits)} />
          <Fact label="Machine misses" value={String(snapshot.cache.machine.misses)} tone={snapshot.cache.machine.misses > snapshot.cache.machine.hits ? "warn" : undefined} />
          <Fact label="Project hits" value={String(snapshot.cache.project.hits)} />
          <Fact label="Project misses" value={String(snapshot.cache.project.misses)} tone={snapshot.cache.project.misses > snapshot.cache.project.hits ? "warn" : undefined} />
        </div>
      </section>
      <section className="workflow-panel">
        <div className="panel-title-row compact-title-row"><h4>SSH latency</h4></div>
        {snapshot.ssh.count === 0 ? (
          <div className="form-note">No SSH commands recorded yet.</div>
        ) : (
          <div className="settings-facts-grid">
            <Fact label="Samples" value={String(snapshot.ssh.count)} />
            <Fact label="Errors" value={String(snapshot.ssh.errors)} tone={snapshot.ssh.errors > 0 ? "warn" : undefined} />
            <Fact label="Avg" value={formatLatency(snapshot.ssh.avgMs)} />
            <Fact label="p50" value={formatLatency(snapshot.ssh.p50Ms)} />
            <Fact label="p95" value={formatLatency(snapshot.ssh.p95Ms)} />
            <Fact label="Max" value={formatLatency(snapshot.ssh.maxMs)} />
          </div>
        )}
      </section>
      <section className="workflow-panel">
        <div className="panel-title-row compact-title-row"><h4>Detector activity</h4></div>
        {snapshot.detectorAggregates.length === 0 ? (
          <div className="form-note">No detector runs recorded yet.</div>
        ) : (
          <div className="settings-list">
            {snapshot.detectorAggregates.map((aggregate) => (
              <div className="settings-list-row" key={aggregate.detectorKey}>
                <span className="truncate"><strong>{aggregate.detectorKey}</strong></span>
                <small className="truncate">{aggregate.runs} run{aggregate.runs === 1 ? "" : "s"} · avg {formatLatency(aggregate.avgDurationMs)}{aggregate.failureCount > 0 ? ` · ${aggregate.failureCount} failure${aggregate.failureCount === 1 ? "" : "s"}` : ""}</small>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="workflow-panel">
        <div className="panel-title-row compact-title-row"><h4>Recent jobs</h4></div>
        {snapshot.recentJobs.length === 0 ? (
          <div className="form-note">No jobs recorded yet.</div>
        ) : (
          <div className="settings-list">
            {snapshot.recentJobs.slice(0, 20).map((job) => (
              <div className={cx("settings-list-row", job.status !== "completed" && "is-warn")} key={job.id}>
                <span className="truncate"><strong>{job.kind}</strong> · {job.targetId} · {formatLatency(job.durationMs)} · {job.status}</span>
                <small className="truncate">{job.error ?? job.projectUri ?? job.finishedAt}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function formatLatency(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "-";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatDurationLong(ms: number): string {
  if (ms < 1000) return "<1 s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

function ExtensionsSettingsPanel({ active, setToast }: { active: boolean; setToast: (toast: Toast) => void }) {
  const [plugins, setPlugins] = useState<PluginSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const list = getBridge().plugins?.list;
    if (!list) { setLoadError("Plugin API is not available."); return; }
    setLoadError(null);
    list()
      .then((items) => { if (!cancelled) setPlugins(items); })
      .catch((error) => { if (!cancelled) setLoadError(asMessage(error)); });
    return () => { cancelled = true; };
  }, [active]);

  async function toggle(plugin: PluginSummary) {
    const setEnabled = getBridge().plugins?.setEnabled;
    if (!setEnabled) { setToast({ tone: "error", message: "Plugin API is not available." }); return; }
    setBusyId(plugin.id);
    try {
      const next = await setEnabled({ pluginId: plugin.id, enabled: !plugin.enabled });
      setPlugins(next);
      setToast({ tone: "success", message: `${plugin.name} ${plugin.enabled ? "disabled" : "enabled"}` });
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  if (loadError) return <section className="workflow-panel"><div className="inline-connection-result is-error" role="status">{loadError}</div></section>;
  if (!plugins) return <section className="workflow-panel"><div className="form-note">Loading plugins…</div></section>;
  if (!plugins.length) return (
    <section className="extensions-panel">
      <div className="extensions-toolbar">
        <div><h4>Extensions</h4><span>No bundled or installed plugins were found.</span></div>
        <button className="button compact" type="button" onClick={() => setToast({ tone: "info", message: "Install Extension coming soon." })}>Install Extension</button>
      </div>
      <div className="extensions-empty">No plugins found.</div>
    </section>
  );
  return (
    <section className="extensions-panel">
      <div className="extensions-toolbar">
        <div>
          <h4>Extensions</h4>
          <span>{plugins.length} plugin{plugins.length === 1 ? "" : "s"} · {plugins.filter((plugin) => plugin.enabled).length} enabled</span>
        </div>
        <button className="button compact" type="button" onClick={() => setToast({ tone: "info", message: "Install Extension coming soon." })}>Install Extension</button>
      </div>
      <div className="extensions-list">
        {plugins.map((plugin) => {
          const contributesParts = [
            plugin.contributes.machineDetectors ? `${plugin.contributes.machineDetectors} machine` : null,
            plugin.contributes.projectDetectors ? `${plugin.contributes.projectDetectors} project` : null,
            plugin.contributes.installRecipes ? `${plugin.contributes.installRecipes} install` : null,
          ].filter(Boolean);
          return (
            <div className={cx("extension-card", !plugin.enabled && "is-disabled")} key={plugin.id}>
              <div className="extension-card-main">
                <div className="extension-icon" aria-hidden="true">{plugin.name.slice(0, 1).toUpperCase()}</div>
                <div className="extension-copy">
                  <div className="extension-title-row">
                    <strong>{plugin.name}</strong>
                    <span className={cx("extension-state", plugin.enabled ? "is-enabled" : "is-disabled")}>{plugin.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div className="extension-meta">
                    <span>{plugin.id}</span>
                    <span>v{plugin.version}</span>
                    <span>{plugin.publisher}</span>
                  </div>
                  <div className="extension-tags">
                    <span className="machine-tag">{plugin.source}</span>
                    {contributesParts.map((part) => <span className="extension-chip" key={part}>{part}</span>)}
                  </div>
                </div>
              </div>
              <button
                className={cx("button", "secondary", "compact")}
                disabled={busyId === plugin.id || plugin.source === "bundled" && plugin.id === "com.sharkbay.core"}
                title={plugin.source === "bundled" && plugin.id === "com.sharkbay.core" ? "Core plugin cannot be disabled" : undefined}
                type="button"
                onClick={() => void toggle(plugin)}
              >
                {busyId === plugin.id ? "Saving…" : plugin.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AppearanceSettingsPanel({ appearanceTheme, setToast, onThemeChange }: { appearanceTheme: AppearanceTheme; setToast: (toast: Toast) => void; onThemeChange: (theme: AppearanceTheme) => Promise<void> }) {
  const [savingTheme, setSavingTheme] = useState<AppearanceTheme | null>(null);
  async function chooseTheme(theme: AppearanceTheme) {
    if (theme === appearanceTheme || savingTheme) return;
    setSavingTheme(theme);
    try { await onThemeChange(theme); } catch (error) { setToast({ tone: "error", message: asMessage(error) }); } finally { setSavingTheme(null); }
  }
  return (
    <section className="subpanel appearance-panel">
      <div className="compact-title-row"><h4>Appearance</h4><span className="path-line">{appearanceDescription(appearanceTheme)}</span></div>
      <div className="segmented-control" role="radiogroup" aria-label="Appearance theme">
        {appearanceThemes.map((theme) => {
          const selected = theme.id === appearanceTheme;
          return (
            <button aria-checked={selected} className={cx("segmented-option", selected && "is-selected")} disabled={Boolean(savingTheme)} key={theme.id} role="radio" type="button" onClick={() => void chooseTheme(theme.id)}>
              <span className={cx("theme-swatch", `theme-swatch-${theme.id}`)} aria-hidden="true" /><span>{savingTheme === theme.id ? "Saving" : theme.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RootWorkflowPanel({ bridgeAvailable, lastScanAt, loading, candidates, roots, scanErrors, unavailableRootCount, onAdd, onRemove, onScan, setToast }: {
  bridgeAvailable: boolean; lastScanAt: string | null; loading: boolean; candidates: ProjectCandidate[]; roots: RootRecord[]; scanErrors: string[]; unavailableRootCount: number;
  onAdd: (path: string) => Promise<void>; onRemove: (path: string) => Promise<void>; onScan: () => Promise<void>; setToast: (toast: Toast) => void;
}) {
  const [path, setPath] = useState("");
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const firstRun = roots.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextPath = path.trim();
    if (!nextPath) { setToast({ tone: "error", message: "Enter a configured root path before adding it." }); return; }
    setBusyPath(nextPath);
    try { await onAdd(nextPath); setPath(""); setToast({ tone: "success", message: "Root added and scanned." }); } catch (error) { setToast({ tone: "error", message: asMessage(error) }); } finally { setBusyPath(null); }
  }

  async function remove(pathToRemove: string) {
    setBusyPath(pathToRemove);
    try { await onRemove(pathToRemove); setToast({ tone: "success", message: "Root removed." }); } catch (error) { setToast({ tone: "error", message: asMessage(error) }); } finally { setBusyPath(null); }
  }

  return (
    <section className={cx("workflow-panel", firstRun && "is-first-run")}>
      <div className="workflow-copy">
        <div className="eyebrow">{firstRun ? "First run" : "Configured roots"}</div>
        <h3>{firstRun ? "Choose a parent folder to scan" : "Scan roots"}</h3>
        <p>Add one or more parent folders. The Projects view scans only these locations.</p>
      </div>
      <form className="root-form dashboard-root-form" onSubmit={(event) => void submit(event)}>
        <label><span>Folder path</span><input className="input" placeholder="/path/to/projects" value={path} onChange={(event) => setPath(event.target.value)} /></label>
        <button className="button" disabled={!bridgeAvailable || !path.trim() || Boolean(busyPath)} type="submit">{firstRun ? "Add root" : "Add another root"}</button>
      </form>
      <div className="scan-strip" aria-live="polite">
        {lastScanAt ? <span>Last scan: {formatScanTime(lastScanAt)}</span> : null}
        <span>{candidates.length} project{candidates.length === 1 ? "" : "s"}</span>
        {unavailableRootCount ? <span>{unavailableRootCount} unavailable root{unavailableRootCount === 1 ? "" : "s"}</span> : null}
        {scanErrors.length ? <span>{scanErrors.length} scan issue{scanErrors.length === 1 ? "" : "s"}</span> : null}
        <button className="button secondary compact" disabled={!bridgeAvailable || loading || roots.length === 0} type="button" onClick={() => void onScan()}>{loading ? "Scanning" : "Scan all roots"}</button>
      </div>
      {roots.length ? (
        <div className="root-list" aria-label="Configured scan roots">
          {roots.map((root) => (
            <div className={cx("root-row", (root.unavailable || root.available === false) && "is-unavailable")} key={root.path}>
              <span className="truncate" title={root.path}>{root.path}</span>
              {root.unavailable || root.available === false ? <span className="root-state">Unavailable</span> : null}
              <button className="button secondary compact" disabled={busyPath === root.path} type="button" onClick={() => void remove(root.path)}>Remove</button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProjectWorkflowPanel({ configuredProjects, configuredRemoteProjects, remoteMachines, onRemoveProject, setToast }: {
  configuredProjects: string[]; configuredRemoteProjects: string[]; remoteMachines: RemoteMachine[];
  onRemoveProject: (path: string) => Promise<void>; setToast: (toast: Toast) => void;
}) {
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const projectEntries = [
    ...configuredProjects.map((value) => ({ value, label: value, machine: "Local" })),
    ...configuredRemoteProjects.map((value) => ({ value, label: remoteProjectLabel(value, remoteMachines), machine: "Remote" })),
  ];

  async function remove(pathToRemove: string) {
    setBusyPath(pathToRemove);
    try { await onRemoveProject(pathToRemove); setToast({ tone: "success", message: "Project removed." }); } catch (error) { setToast({ tone: "error", message: asMessage(error) }); } finally { setBusyPath(null); }
  }

  return (
    <section className="workflow-panel">
      <div className="workflow-copy">
        <div className="eyebrow">Configured projects</div>
        <h3>Manage projects</h3>
        <p>Use the <strong>+</strong> button on the main screen to add local or remote projects.</p>
      </div>
      {projectEntries.length ? (
        <div className="root-list" aria-label="Configured projects">
          {projectEntries.map((project) => (
            <div className="root-row" key={project.value}>
              <span className="truncate" title={project.value}>{project.label}</span>
              <span className="machine-tag">{project.machine}</span>
              <button className="button secondary compact" disabled={busyPath === project.value} type="button" onClick={() => void remove(project.value)}>Remove</button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ padding: "0 16px 16px", opacity: 0.6, fontSize: "13px" }}>No projects configured yet.</p>
      )}
    </section>
  );
}

function AddProjectDialog({ remoteMachines, setToast, onAdd, onClose, onPickLocal }: {
  remoteMachines: RemoteMachine[];
  setToast: (toast: Toast) => void;
  onAdd: (pathOrUri: string) => Promise<void>;
  onClose: () => void;
  onPickLocal: () => Promise<void>;
}) {
  const [machineId, setMachineId] = useState("local");
  const [remotePath, setRemotePath] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Adding");
  const [pathError, setPathError] = useState<string | null>(null);
  const selectedRemoteMachine = remoteMachines.find((machine) => machine.id === machineId) ?? remoteMachines[0] ?? null;
  const isLocal = machineId === "local";
  const canAddRemote = Boolean(selectedRemoteMachine && remotePath.trim().startsWith("/") && !busy);

  async function chooseLocal() {
    setBusy(true);
    try {
      onClose();
      await onPickLocal();
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    }
  }

  async function addRemote(event: FormEvent) {
    event.preventDefault();
    setPathError(null);
    if (!selectedRemoteMachine || !remotePath.trim().startsWith("/")) {
      setPathError("Enter an absolute remote project path.");
      return;
    }
    const trimmedPath = remotePath.trim();
    setBusy(true);
    let closed = false;
    try {
      setBusyLabel("Verifying");
      const verify = getBridge().targets?.pathExists;
      if (verify) {
        const verification = await verify({ targetId: selectedRemoteMachine.id, path: trimmedPath });
        if (!verification.ok) {
          setPathError(verification.reason === "not-found"
            ? `Path does not exist on ${selectedRemoteMachine.label}: ${trimmedPath}`
            : `Could not verify path on ${selectedRemoteMachine.label}: ${verification.message}`);
          return;
        }
        if (verification.kind === "file") {
          setPathError(`That path is a file, not a directory: ${trimmedPath}`);
          return;
        }
      }
      setBusyLabel("Adding");
      onClose();
      closed = true;
      await onAdd(toRemoteProjectUri(selectedRemoteMachine.id, trimmedPath));
      setToast({ tone: "success", message: "Remote project added." });
    } catch (error) {
      if (closed) setToast({ tone: "error", message: asMessage(error) });
      else setPathError(asMessage(error));
    } finally {
      if (!closed) setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-modal="true" className="modal-panel add-project-dialog" role="dialog" aria-labelledby="add-project-dialog-title">
        <div className="modal-header">
          <div>
            <h3 id="add-project-dialog-title">Add Project</h3>
            <p>Choose where the project lives, then add its directory.</p>
          </div>
          <button aria-label="Close" className="icon-button" type="button" onClick={onClose}>x</button>
        </div>
        <form className="remote-machine-form" onSubmit={(event) => void addRemote(event)}>
          <label className="remote-machine-wide-field"><span>Machine</span>
            <select className="input" value={machineId} onChange={(event) => setMachineId(event.target.value)}>
              <option value="local">Local Machine</option>
              {remoteMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.label}</option>)}
            </select>
          </label>
          {isLocal ? (
            <div className="remote-machine-form-actions">
              <button className="button" disabled={busy} type="button" onClick={() => void chooseLocal()}>{busy ? "Selecting" : "Choose Local Folder…"}</button>
            </div>
          ) : (
            <>
              <label className="remote-machine-wide-field"><span>Remote project path</span><input className="input" placeholder={selectedRemoteMachine?.defaultProjectPath ?? "/home/app/project"} value={remotePath} onChange={(event) => { setRemotePath(event.target.value); setPathError(null); }} /></label>
              <div className="remote-machine-form-note">SharkBay verifies the path exists on the remote before adding the project.</div>
              {pathError ? (
                <div className="inline-connection-result is-error" role="status" aria-live="polite">{pathError}</div>
              ) : null}
              <div className="remote-machine-form-actions">
                <button className="button" disabled={!canAddRemote} type="submit">{busy ? busyLabel : "Add Remote Project"}</button>
              </div>
            </>
          )}
        </form>
      </section>
    </div>
  );
}

function RemoteMachineDialog({ setToast, onAdd, onClose, onTest }: {
  setToast: (toast: Toast) => void;
  onAdd: (input: RemoteMachineInput) => Promise<void>;
  onClose: () => void;
  onTest: (input: { id: string } | RemoteMachineInput) => Promise<RemoteMachineTestResult>;
}) {
  const [label, setLabel] = useState("");
  const [authMode, setAuthMode] = useState<RemoteMachineInput["authMode"]>("system-ssh-config");
  const [sshConfigHost, setSshConfigHost] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [password, setPassword] = useState("");
  const [defaultProjectPath, setDefaultProjectPath] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [connectionResult, setConnectionResult] = useState<RemoteMachineTestResult | null>(null);
  const connectionReady = authMode === "system-ssh-config"
    ? Boolean(sshConfigHost.trim())
    : Boolean(host.trim())
      && (authMode !== "key-file" || Boolean(keyPath.trim()));
  const canTest = Boolean(connectionReady && !busyAction);
  const canSubmit = Boolean(label.trim() && connectionReady && !busyAction);

  function input(): RemoteMachineInput {
    return {
      label: label.trim(),
      authMode: authMode === "ssh-agent" && password ? "password" : authMode,
      sshConfigHost: authMode === "system-ssh-config" ? sshConfigHost.trim() : undefined,
      host: authMode === "system-ssh-config" ? undefined : host.trim(),
      port: authMode === "system-ssh-config" ? undefined : Number.parseInt(port, 10) || 22,
      username: authMode === "system-ssh-config" ? undefined : username.trim() || undefined,
      keyPath: authMode === "key-file" ? keyPath.trim() : undefined,
      password: authMode === "ssh-agent" && password ? password : undefined,
      defaultProjectPath: defaultProjectPath.trim() || undefined,
    };
  }

  async function testDraft() {
    setBusyAction("test-draft");
    setConnectionResult(null);
    try {
      const result = await onTest({ ...input(), label: label.trim() || "Remote machine" });
      setConnectionResult(result);
      setToast({ tone: result.ok ? "success" : "error", message: result.message });
    } catch (error) {
      const message = asMessage(error);
      setConnectionResult({ ok: false, message });
      setToast({ tone: "error", message });
    } finally {
      setBusyAction(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusyAction("save");
    try {
      await onAdd(input());
      setToast({ tone: "success", message: "Remote machine saved." });
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-modal="true" className="modal-panel remote-machine-dialog" role="dialog" aria-labelledby="remote-machine-dialog-title">
        <div className="modal-header">
          <div>
            <h3 id="remote-machine-dialog-title">Add Remote Machine</h3>
            <p>Connect through SSH. Passwords are saved in the system Keychain; private key contents are never stored.</p>
          </div>
          <button aria-label="Close" className="icon-button" type="button" onClick={onClose}>x</button>
        </div>
        <form className="remote-machine-form" onSubmit={(event) => void submit(event)}>
          <label><span>Machine name</span><input className="input" placeholder="GPU Worker" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
          <div className="remote-machine-wide-field remote-connection-methods">
            <div className="remote-machine-field-label">How do you connect to this server?</div>
            <div className="remote-connection-method-grid">
              {remoteConnectionMethods.map((method) => (
                <button
                  aria-pressed={authMode === method.id}
                  className={cx("remote-connection-method", authMode === method.id && "is-selected")}
                  key={method.id}
                  type="button"
                  onClick={() => setAuthMode(method.id)}
                >
                  <strong>{method.label}</strong>
                  <span>{method.description}</span>
                </button>
              ))}
            </div>
          </div>
          {authMode === "system-ssh-config" ? (
            <label className="remote-machine-wide-field"><span>Server name in SSH config</span><input className="input" placeholder="gpu-01" value={sshConfigHost} onChange={(event) => setSshConfigHost(event.target.value)} /></label>
          ) : (
            <>
              <label><span>Server address</span><input className="input" placeholder="1.2.3.4 or server.example.com" value={host} onChange={(event) => setHost(event.target.value)} /></label>
              <label><span>Port</span><input className="input" inputMode="numeric" placeholder="22" value={port} onChange={(event) => setPort(event.target.value)} /></label>
              <label><span>Username</span><input className="input" placeholder="ubuntu" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
              {authMode === "key-file" ? <label><span>Key file path</span><input className="input" placeholder="~/.ssh/id_ed25519" value={keyPath} onChange={(event) => setKeyPath(event.target.value)} /></label> : null}
              {authMode === "ssh-agent" ? <label><span>Password optional</span><input className="input" type="password" placeholder="Leave empty to use SSH agent/keychain" value={password} onChange={(event) => setPassword(event.target.value)} /></label> : null}
            </>
          )}
          <label className="remote-machine-wide-field"><span>Default project path</span><input className="input" placeholder="/home/app" value={defaultProjectPath} onChange={(event) => setDefaultProjectPath(event.target.value)} /></label>
          <div className="remote-machine-form-note">
            {authMode === "system-ssh-config"
              ? "Enter the name you already use after ssh, for example gpu-01 from ssh gpu-01."
              : authMode === "ssh-agent"
                ? "Leave password empty to use SSH agent/keychain. If provided, SharkBay stores it in the system Keychain."
                : authMode === "key-file"
                  ? "SharkBay stores only the key file path, never the private key contents."
                  : "SharkBay stores the password in the system Keychain and keeps only a secret reference in app config."}
          </div>
          {connectionResult ? (
            <div className={cx("inline-connection-result", connectionResult.ok ? "is-success" : "is-error")} role="status" aria-live="polite">
              {connectionResult.message}
            </div>
          ) : null}
          <div className="remote-machine-form-actions">
            <button className="button secondary" disabled={!canTest} type="button" onClick={() => void testDraft()}>{busyAction === "test-draft" ? "Testing" : "Test Connection"}</button>
            <button className="button" disabled={!canSubmit} type="submit">{busyAction === "save" ? "Saving" : "Save"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RemoteMachineDetailPanel({ machine, setToast, onRemove, onTest }: {
  machine: RemoteMachine;
  setToast: (toast: Toast) => void;
  onRemove: (id: string) => Promise<void>;
  onTest: (input: { id: string }) => Promise<RemoteMachineTestResult>;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [connectionResult, setConnectionResult] = useState<RemoteMachineTestResult | null>(null);
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  async function test() {
    setBusyAction("test");
    setConnectionResult(null);
    try {
      const result = await onTest({ id: machine.id });
      setConnectionResult(result);
      setToast({ tone: result.ok ? "success" : "error", message: `${machine.label}: ${result.message}` });
      if (result.ok) setProfileReloadKey((current) => current + 1);
    } catch (error) {
      const message = asMessage(error);
      setConnectionResult({ ok: false, message });
      setToast({ tone: "error", message });
    } finally {
      setBusyAction(null);
    }
  }
  async function remove() {
    setBusyAction("remove");
    try {
      await onRemove(machine.id);
      setToast({ tone: "success", message: "Remote machine removed." });
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }
  return (
    <>
      <section className="remote-machine-detail-card">
        <header className="remote-machine-detail-hero">
          <div>
            <span className="machine-tag">Remote</span>
            <h4>{machine.label}</h4>
            <p>{machine.sshConfigHost ?? machine.host}</p>
          </div>
          <div className="remote-machine-detail-actions">
            <button className="button secondary compact" disabled={Boolean(busyAction)} type="button" onClick={() => void test()}>{busyAction === "test" ? "Testing" : "Test"}</button>
            <button className="button secondary compact" disabled={Boolean(busyAction)} type="button" onClick={() => void remove()}>{busyAction === "remove" ? "Removing" : "Remove"}</button>
          </div>
        </header>
        <dl className="remote-machine-attributes">
          <div><dt>Connection</dt><dd>{remoteMachineAuthLabel(machine.authMode)}</dd></div>
          <div><dt>Host</dt><dd>{machine.sshConfigHost ?? machine.host}</dd></div>
          <div><dt>Port</dt><dd>{machine.port}</dd></div>
          <div><dt>Default project path</dt><dd>{machine.defaultProjectPath ?? "-"}</dd></div>
        </dl>
        {connectionResult ? (
          <div className={cx("inline-connection-result", connectionResult.ok ? "is-success" : "is-error")} role="status" aria-live="polite">
            {connectionResult.message}
          </div>
        ) : null}
      </section>
      <MachineProfileCard targetId={machine.id} setToast={setToast} reloadKey={profileReloadKey} />
    </>
  );
}

function MachineProfileCard({ targetId, setToast, reloadKey }: { targetId: string; setToast: (toast: Toast) => void; reloadKey: number }) {
  const [profile, setProfile] = useState<MachineProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localReloadKey, setLocalReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const readMachine = getBridge().profiles?.readMachine;
    if (!readMachine) { setLoadError("Machine profile API is not available."); return; }
    const wantsRefresh = reloadKey > 0 || localReloadKey > 0;
    setBusy(true);
    setLoadError(null);
    readMachine({ targetId, options: wantsRefresh ? { refresh: true } : undefined })
      .then((next) => { if (!cancelled) setProfile(next); })
      .catch((error) => { if (!cancelled) setLoadError(asMessage(error)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [targetId, reloadKey, localReloadKey]);

  function refresh() {
    setLocalReloadKey((current) => current + 1);
    setToast({ tone: "info", message: "Refreshing machine profile" });
  }

  return (
    <section className="machine-profile-panel">
      <header className="machine-profile-header">
        <div>
          <h4>Machine profile</h4>
          <span>{busy ? "Refreshing" : profile ? "Last detected capabilities" : "Not probed yet"}</span>
        </div>
        <button aria-label="Refresh machine profile" className="icon-button" disabled={busy} type="button" onClick={refresh}><RefreshIcon /></button>
      </header>
      {loadError ? (
        <div className="inline-connection-result is-error" role="status">{loadError}</div>
      ) : !profile && busy ? (
        <div className="machine-profile-empty">Probing machine...</div>
      ) : !profile ? (
        <div className="machine-profile-empty">No profile yet. Use Test Connection or Refresh to probe.</div>
      ) : (
        <>
          <dl className="machine-profile-summary">
            <div><dt>OS</dt><dd>{profile.os.name ? `${profile.os.name}${profile.os.version ? ` ${profile.os.version}` : ""}` : "Unknown"}</dd></div>
            <div><dt>Arch</dt><dd>{profile.os.arch ?? "-"}</dd></div>
            <div><dt>Hostname</dt><dd>{profile.hostname ?? "-"}</dd></div>
            <div><dt>Shell</dt><dd>{profile.shell.name ?? profile.shell.path ?? "-"}</dd></div>
          </dl>
          <ToolList title="Agents" tools={profile.agents} />
          <ToolList title="Languages" tools={profile.languages} />
          <ToolList title="Tools" tools={profile.tools} />
          <ToolList title="Package managers" tools={profile.packageManagers} />
          {profile.warnings.length ? (
            <div className="settings-list">
              {profile.warnings.map((warning, index) => (
                <div className="settings-list-row" key={`${warning.code}-${index}`}><span className="truncate">{warning.code}</span><small className="truncate">{warning.message}</small></div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function ToolList({ title, tools }: { title: string; tools: MachineProfile["tools"] }) {
  if (!tools.length) return null;
  return (
    <section className="machine-tool-section">
      <div className="machine-tool-section-title">
        <h5>{title}</h5>
        <span>{tools.filter((tool) => tool.available).length}/{tools.length} available</span>
      </div>
      <div className="machine-tool-list">
        {tools.map((tool) => (
          <div className={cx("machine-tool-row", !tool.available && "is-missing")} key={tool.id}>
            <span className={cx("machine-tool-state", tool.available ? "is-available" : "is-missing")} />
            <strong>{tool.id}</strong>
            <span>{tool.available ? (tool.version ?? tool.path ?? "available") : "missing"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function remoteMachineAuthLabel(authMode: RemoteMachine["authMode"]): string {
  if (authMode === "ssh-agent") return "SSH agent";
  if (authMode === "key-file") return "Key file";
  if (authMode === "password") return "Password";
  return "SSH config";
}

function SettingsStatusPanel({ candidates, roots, scanErrors, unavailableRootCount }: { candidates: ProjectCandidate[]; roots: RootRecord[]; scanErrors: string[]; unavailableRootCount: number }) {
  const unavailableRoots = roots.filter((root) => root.unavailable || root.available === false);
  return (
    <section className="workflow-panel settings-status-panel">
      <div className="settings-facts-grid">
        <Fact label="Roots" value={String(roots.length)} />
        <Fact label="Projects" value={String(candidates.length)} />
        <Fact label="Unavailable" value={String(unavailableRootCount)} tone={unavailableRootCount ? "warn" : undefined} />
      </div>
      {unavailableRoots.length ? (
        <section className="subpanel settings-list-panel"><h4>Unavailable roots</h4><div className="settings-list">{unavailableRoots.map((root) => (<div className="settings-list-row" key={root.path}><span className="truncate">{root.path}</span><small className="truncate">{root.error ?? "Unavailable"}</small></div>))}</div></section>
      ) : null}
      {scanErrors.length ? (
        <section className="subpanel settings-list-panel"><h4>Scan issues</h4><div className="settings-list">{scanErrors.map((error) => (<div className="settings-list-row" key={error}><span className="truncate">{error}</span></div>))}</div></section>
      ) : null}
      {!unavailableRoots.length && !scanErrors.length ? (<div className="empty-state compact-title-row"><strong>No issues</strong><span>Settings status is clear.</span></div>) : null}
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return <div className={cx("fact", tone === "warn" && "is-warn")}><span>{label}</span><strong>{value}</strong></div>;
}

function ArrowLeftIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="m15 18-6-6 6-6" /></svg>;
}

function ArrowRightIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="m9 18 6-6-6-6" /></svg>;
}

function PlusIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}

function RefreshIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>;
}

function GlobeIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 0 20" /><path d="M12 2a15.3 15.3 0 0 0 0 20" /></svg>;
}

function DownloadIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M12 3v12" /><path d="m6 11 6 6 6-6" /><path d="M5 21h14" /></svg>;
}

function InstallAgentDialog({ targetId, targetLabel, installedAgentIds, onClose, onInstalled, setToast }: {
  targetId: string;
  targetLabel: string;
  installedAgentIds: string[];
  onClose: () => void;
  onInstalled: () => void;
  setToast: (toast: Toast) => void;
}) {
  const [recipes, setRecipes] = useState<InstallRecipe[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InstallToolResult | null>(null);
  const [liveLogLines, setLiveLogLines] = useState<string[]>([]);
  const logsRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const list = getBridge().agents?.listInstallRecipes;
    if (!list) { setLoadError("Install recipes are not available."); return; }
    list({ targetId })
      .then((items) => { if (!cancelled) setRecipes(items); })
      .catch((error) => { if (!cancelled) setLoadError(asMessage(error)); });
    return () => { cancelled = true; };
  }, [targetId]);

  useEffect(() => {
    const subscribe = getBridge().agents?.onInstallLog;
    if (!subscribe || !selectedRecipeId) return;
    const unsubscribe = subscribe((event) => {
      if (event.targetId !== targetId || event.recipeId !== selectedRecipeId) return;
      setLiveLogLines((current) => [...current, formatInstallLogLine(event)]);
    });
    return unsubscribe;
  }, [targetId, selectedRecipeId]);

  useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [liveLogLines]);

  const installedSet = useMemo(() => new Set(installedAgentIds), [installedAgentIds]);
  const visibleRecipes = recipes?.filter((recipe) => !installedSet.has(recipe.toolId)) ?? null;
  const selectedRecipe = recipes?.find((recipe) => recipe.id === selectedRecipeId) ?? null;
  const hasStreamedLogs = liveLogLines.length > 0;
  const displayLogs = hasStreamedLogs ? liveLogLines.join("\n") : result?.logs.join("\n") ?? "";

  async function runInstall(recipe: InstallRecipe) {
    const installTool = getBridge().agents?.installTool;
    if (!installTool) { setToast({ tone: "error", message: "Install tool API is not available." }); return; }
    setBusy(true);
    setResult(null);
    setLiveLogLines([]);
    try {
      const next = await installTool({ targetId, recipeId: recipe.id });
      setResult(next);
      if (next.ok) {
        setToast({ tone: "success", message: `Installed ${recipe.toolId}` });
        onInstalled();
      } else {
        setToast({ tone: "error", message: next.error ?? "Install failed" });
      }
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section aria-modal="true" className="modal-panel install-agent-dialog" role="dialog" aria-labelledby="install-agent-dialog-title">
        <div className="modal-header install-agent-header">
          <div>
            <h3 id="install-agent-dialog-title">Install agent CLI</h3>
            <p>Target: {targetLabel}</p>
          </div>
          <button aria-label="Close" className="icon-button" disabled={busy} type="button" onClick={onClose}>x</button>
        </div>
        <div className="install-agent-body">
          <aside className="install-agent-sidebar">
            <div className="install-agent-section-title">
              <span>Available</span>
              <strong>{visibleRecipes?.length ?? 0}</strong>
            </div>
            {loadError ? (
              <div className="inline-connection-result is-error" role="status">{loadError}</div>
            ) : !recipes ? (
              <div className="install-agent-empty">Loading install recipes...</div>
            ) : !visibleRecipes?.length ? (
              <div className="install-agent-empty">All agents installed.</div>
            ) : (
              <div className="install-agent-recipe-list">
                {visibleRecipes.map((recipe) => (
                  <button className={cx("install-agent-recipe", selectedRecipeId === recipe.id && "is-selected")} key={recipe.id} type="button" onClick={() => setSelectedRecipeId(recipe.id)}>
                    <strong>{recipe.toolId}</strong>
                    <span>{recipe.label}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
          <div className="install-agent-detail">
            {!recipes ? (
              <div className="install-agent-empty">Preparing installer...</div>
            ) : !visibleRecipes?.length ? (
              <div className="install-agent-complete">
                <strong>All agents installed</strong>
                <span>No additional install recipes apply to this target.</span>
              </div>
            ) : !selectedRecipe ? (
              <div className="install-agent-empty">Select an agent recipe to review before installing.</div>
            ) : (
              <>
                <div className="install-agent-selected">
                  <div>
                    <span>Agent</span>
                    <strong>{selectedRecipe.toolId}</strong>
                  </div>
                  <div>
                    <span>Recipe</span>
                    <strong>{selectedRecipe.label}</strong>
                  </div>
                </div>
                <div className="install-agent-command">
                  <span>Command plan</span>
                  <pre>{describeRecipeSteps(selectedRecipe)}</pre>
                </div>
                {busy || result || hasStreamedLogs ? (
                  <div className={cx("install-agent-log", result && (result.ok ? "is-success" : "is-error"))}>
                    <span>Install log</span>
                    <pre ref={logsRef}>
                      {displayLogs || (busy ? "Starting..." : result?.ok ? "Installed." : result?.error ?? "Install failed.")}
                    </pre>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="install-agent-actions">
          <button className="button secondary" disabled={busy} type="button" onClick={onClose}>{result?.ok ? "Close" : "Cancel"}</button>
          {selectedRecipe && !result?.ok ? (
            <button className="button" disabled={busy} type="button" onClick={() => void runInstall(selectedRecipe)}>{busy ? "Installing..." : "Install"}</button>
          ) : result?.ok ? (
            <button className="button" type="button" onClick={onClose}>Done</button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function formatInstallLogLine(event: InstallLogEvent): string {
  if (event.stream === "stderr") return `! ${event.line}`;
  return event.line;
}

function describeRecipeSteps(recipe: InstallRecipe): string {
  return recipe.steps.map((step) => {
    if (step.kind === "command") return `$ ${step.command}${step.requiresSudo ? "  # requires sudo" : ""}`;
    if (step.kind === "openUrl") return `open ${step.url}`;
    return step.markdown;
  }).join("\n");
}

function AgentCliIcon({ agent }: { agent: AgentCli }) {
  if (agent.id === "codex") return <CodexIcon />;
  if (agent.id === "claude") return <ClaudeCodeIcon />;
  if (agent.id === "gemini") return <GeminiCliIcon />;
  if (agent.id === "kiro") return <KiroIcon />;
  if (agent.id === "deepseek") return <DeepSeekIcon />;
  if (agent.id === "qwen") return <QwenIcon />;
  if (agent.id === "opencode") return <OpenCodeIcon />;
  return <span aria-hidden="true" className="agent-cli-monogram">{agent.shortLabel}</span>;
}

function CodexIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" fillRule="evenodd" height="16" viewBox="0 0 24 24" width="16">
      <path clipRule="evenodd" d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z" />
    </svg>
  );
}

function ClaudeCodeIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" fillRule="evenodd" height="16" viewBox="0 0 24 24" width="16">
      <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" />
    </svg>
  );
}

function GeminiCliIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" fillRule="evenodd" height="16" viewBox="0 0 24 24" width="16">
      <path d="M16.793 10.358v3.867L7.236 18.82v-2.8l7.751-3.728-7.75-3.728V5.763l9.556 4.595z" />
      <path clipRule="evenodd" d="M19.608 0A4.392 4.392 0 0124 4.392v15.216A4.392 4.392 0 0119.608 24H4.392A4.392 4.392 0 010 19.608V4.392A4.392 4.392 0 014.392 0h15.216zM4.26 1.444A2.816 2.816 0 001.444 4.26v15.48a2.816 2.816 0 002.816 2.816h15.48a2.816 2.816 0 002.816-2.816V4.26a2.816 2.816 0 00-2.816-2.816H4.26z" />
    </svg>
  );
}

function KiroIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="16" viewBox="230 150 740 900" width="16">
      <path d="M398.554 818.914C316.315 1001.03 491.477 1046.74 620.672 940.156C658.687 1059.66 801.052 970.473 852.234 877.795C964.787 673.567 919.318 465.357 907.64 422.374C827.637 129.443 427.623 128.946 358.8 423.865C342.651 475.544 342.402 534.18 333.458 595.051C328.986 625.86 325.507 645.488 313.83 677.785C306.873 696.424 297.68 712.819 282.773 740.645C259.915 783.881 269.604 867.113 387.87 823.883L399.051 818.914H398.554Z" />
      <path d="M636.123 549.353C603.328 549.353 598.359 510.097 598.359 486.742C598.359 465.623 602.086 448.977 609.293 438.293C615.504 428.852 624.697 424.131 636.123 424.131C647.555 424.131 657.492 428.852 664.447 438.541C672.398 449.474 676.623 466.12 676.623 486.742C676.623 525.998 661.471 549.353 636.375 549.353H636.123Z" />
      <path d="M771.24 549.353C738.445 549.353 733.477 510.097 733.477 486.742C733.477 465.623 737.203 448.977 744.41 438.293C750.621 428.852 759.814 424.131 771.24 424.131C782.672 424.131 792.609 428.852 799.564 438.541C807.516 449.474 811.74 466.12 811.74 486.742C811.74 525.998 796.588 549.353 771.492 549.353H771.24Z" />
    </svg>
  );
}

function DeepSeekIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" fillRule="evenodd" height="16" viewBox="0 0 24 24" width="16">
      <path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" />
    </svg>
  );
}

function QwenIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" fillRule="evenodd" height="16" viewBox="0 0 24 24" width="16">
      <path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z" />
    </svg>
  );
}

function OpenCodeIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" fillRule="evenodd" height="16" viewBox="0 0 24 24" width="16">
      <path d="M16 6H8v12h8V6zm4 16H4V2h16v20z" />
    </svg>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{body}</span></div>;
}
