import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import defaultProjectIconUrl from "./assets/shark-fin.png";
import { CodeEditor } from "./code-editor";
import { buildAgentSessionRestoreCommand, inferAgentSessionRestoreAgent, type AgentSessionRestoreCommand } from "../shared/agent-session-restore";
import type {
  AgentCli,
  AgentProjectStatusEvent,
  AppConfig,
  AppearanceTheme,
  BrowserBounds,
  BrowserSession,
  BrowserUpdateEvent,
  CodeGraphProjectStatus,
  DiagnosticsSnapshot,
  InstallLogEvent,
  InstallRecipe,
  InstallToolResult,
  PluginSummary,
  ProjectCandidate,
  ProjectDetail,
  ProjectFileTreeItem,
  ProjectSummary,
  ScanResult,
  SharkBayBridge,
  TaskViewModel,
  ProtocolStatus,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalCreateInput,
  TerminalSession,
  TerminalUpdateEvent,
  HookSessionViewModel,
  UsageGroupRowView,
  UsageReportResultView,
} from "./types";
import {
  firstHttpUrl,
  formatSessionModelName,
  resolveSelectedCandidate,
  shouldEnsureCodeGraphForSelection,
  shouldKeepCurrentServiceUrl,
  projectActivityForCandidate,
  validTerminalResizeDimensions,
} from "./workflow";
import type { WorkflowProjectActivityState } from "./workflow";

type View = "dashboard" | "settings";
type DetailTab = "sessions" | "tasks" | "git" | "files";
type SettingsSection = "agent-clis" | "appearance" | "extensions" | "diagnostics";

type Toast = {
  tone: "info" | "error" | "success";
  message: string;
};

type CodeGraphStatusView = {
  loading: boolean;
  status: CodeGraphProjectStatus | null;
  error: string | null;
};

type RefreshOptions = {
  showToast?: boolean;
  setBusy?: boolean;
};

type Disposable = {
  dispose: () => void;
};

type ProjectActivityState = WorkflowProjectActivityState;

type TerminalShellTab = {
  kind: "terminal";
  session: TerminalSession;
  terminal: XTerm;
  fitAddon: FitAddon;
  disposables: Disposable[];
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
  openAgentSession: (projectUri: string, projectName: string, command: string, title: string) => Promise<void>;
};

type AgentStatusByProjectPath = Record<string, string>;

const minProjectColumnWidth = 216;
const minDetailColumnWidth = 340;
const minTerminalColumnWidth = 420;
const maxPendingTerminalOutputChars = 1024 * 1024;
const codeGraphSyncDebounceMs = 10000;
const defaultProjectColumnWidth = minProjectColumnWidth;
const defaultDetailColumnWidth = minDetailColumnWidth;
const resizerColumnWidth = 12;
const columnResizeStep = 40;
const detailColumnStorageKey = "sharkbay.detailColumnWidth.v2";
const projectColumnStorageKey = "sharkbay.projectColumnWidth.v2";
const detailTabs: Array<{ id: DetailTab; label: string; localOnly?: boolean }> = [
  { id: "sessions", label: "Sessions", localOnly: true },
  { id: "tasks", label: "Tasks", localOnly: true },
  { id: "git", label: "Git" },
  { id: "files", label: "Files" },
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

function normalizeScan(raw: ScanResult | ProjectCandidate[]): ScanResult {
  if (Array.isArray(raw)) return { candidates: raw };
  return { ...raw, candidates: raw.candidates ?? [] };
}

async function updateAppearanceTheme(theme: AppearanceTheme): Promise<AppConfig> {
  const handler = getBridge().config?.setAppearanceTheme;
  if (!handler) throw new Error("Appearance theme settings are not exposed by the preload API.");
  return handler({ theme });
}

async function addProject(path: string): Promise<void> {
  const handler = getBridge().config?.addProject;
  if (!handler) throw new Error("Project add is not exposed by the preload API.");
  await handler({ path });
}

async function removeProject(pathOrUri: string): Promise<void> {
  const handler = getBridge().config?.removeProject;
  if (!handler) throw new Error("Project remove is not exposed by the preload API.");
  await handler({ path: pathOrUri });
}

async function renameProjectAlias(uri: string, name: string): Promise<void> {
  const handler = getBridge().config?.renameProject;
  if (!handler) throw new Error("Project rename is not exposed by the preload API.");
  await handler({ uri, name });
}

async function pickAndAddProjects(): Promise<string[]> {
  const picker = getBridge().config?.pickProjectFolder;
  if (!picker) throw new Error("Folder picker is not exposed by the preload API.");
  const result = await picker();
  if (result.cancelled || result.paths.length === 0) return [];
  const projectPath = result.paths[0];
  if (!projectPath) return [];
  const addHandler = getBridge().config?.addProject;
  if (!addHandler) throw new Error("Project add is not exposed by the preload API.");
  await addHandler({ path: projectPath });
  return [projectPath];
}

async function uninstallProtocol(repoPath: string, cleanTeamContext = false): Promise<void> {
  const handler = getBridge().protocol?.uninstall;
  if (!handler) throw new Error("Protocol uninstall is not exposed by the preload API.");
  await handler({ repoPath, cleanTeamContext });
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

async function readCodeGraphStatus(projectUri: string): Promise<CodeGraphProjectStatus> {
  const handler = getBridge().codeGraph?.getStatus;
  if (!handler) throw new Error("CodeGraph status is not exposed by the preload API.");
  return handler({ projectUri });
}

async function ensureCodeGraphStatus(projectUri: string): Promise<CodeGraphProjectStatus> {
  const handler = getBridge().codeGraph?.ensureStatus;
  if (!handler) throw new Error("CodeGraph status maintenance is not exposed by the preload API.");
  return handler({ projectUri });
}

async function createTerminal(
  cwdUri: string,
  title?: string,
  options: Pick<TerminalCreateInput, "agentId" | "initialCommand" | "initialCommandTitle" | "service"> = {},
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
  if (exitCode === 2) return "Shell exited immediately (exit 2). Check the project directory exists and is readable.";
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

function localPathFromCandidate(candidate: ProjectCandidate): string | null {
  if (candidate.providerKind !== "local" || !candidate.uri.startsWith("local:")) return null;
  try {
    return decodeURI(candidate.uri.slice("local:".length));
  } catch {
    return null;
  }
}

function githubOwnerFromRemote(remoteOrigin: string | null | undefined): string | null {
  return remoteOrigin?.match(/github\.com[:/]([^/\s]+)\/[^/\s]+?(?:\.git)?$/)?.[1] ?? null;
}

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [configuredProjects, setConfiguredProjects] = useState<string[]>([]);
  const [projectAliases, setProjectAliases] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<ProjectCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>("day");
  const refreshInFlight = useRef(false);

  const bridgeAvailable = typeof window !== "undefined" && Boolean(window.sharkBay);

  const selectedCandidate = useMemo(() => resolveSelectedCandidate(candidates, selectedId), [candidates, selectedId]);

  async function refreshProjects(options: RefreshOptions = {}): Promise<{ candidates: ProjectCandidate[] }> {
    const setBusy = options.setBusy ?? true;
    if (setBusy) setLoading(true);
    setScanErrors([]);

    try {
      const bridge = getBridge();
      const configHandler = bridge.config?.listRoots;
      if (!configHandler) throw new Error("Root listing is not exposed by the preload API.");
      const [rootConfig, scan] = await Promise.all([configHandler(), scanProjects()]);
      if (isAppConfig(rootConfig)) {
        setAppearanceTheme(normalizeAppearanceTheme(rootConfig.appearanceTheme));
        setConfiguredProjects(rootConfig.configuredProjects ?? []);
        setProjectAliases(rootConfig.projectAliases ?? {});
      }
      const nextCandidates = scan.candidates ?? [];

      setCandidates(nextCandidates);
      setScanErrors(scan.errors ?? []);
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
    void refreshProjects().then(() => getBridge().dock?.contentReady?.());
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
              
              scanErrors={scanErrors}
              selectedCandidate={selectedCandidate}
              setSelectedId={setSelectedId}
              setToast={setToast}
              onRefresh={refreshWorkspace}
              onOpenSettings={() => setView("settings")}
              onAddProject={async (pathOrUri) => { await addProject(pathOrUri); await refreshProjects({ showToast: true }); }}
              onPickProject={async () => {
                const paths = await pickAndAddProjects();
                if (paths.length) {
                  setToast({ tone: "success", message: "Project added." });
                  await refreshProjects({ showToast: false });
                }
              }}
              onRemoveProject={async (uri) => { await removeProject(uri); await refreshProjects({ showToast: true }); }}
              onRenameProject={async (uri, name) => { await renameProjectAlias(uri, name); await refreshProjects({ showToast: false }); }}
              onUninstallProtocol={async (repoPath, cleanTeamContext) => { await uninstallProtocol(repoPath, cleanTeamContext); await refreshProjects({ showToast: false }); }}
              projectAliases={projectAliases}
            />
          </div>
          {view === "settings" ? (
            <div className="view-surface settings-surface">
              <SettingsView
                appearanceTheme={appearanceTheme}
                configuredProjects={configuredProjects}
                
                
                bridgeAvailable={bridgeAvailable}
                candidates={candidates}
                scanErrors={scanErrors}
                initialSection={settingsSection}
                setToast={setToast}
                onBack={() => setView("dashboard")}
                onRemoveProject={async (path) => { await removeProject(path); await refreshProjects({ showToast: true }); }}
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
  onUninstallProtocol,
}: {
  appearanceTheme: AppearanceTheme;
  bridgeAvailable: boolean;
  detail: ProjectDetail | null;
  filteredCandidates: ProjectCandidate[];
  isVisible: boolean;
  loading: boolean;
  
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
  onUninstallProtocol: (repoPath: string, cleanTeamContext?: boolean) => Promise<void>;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const terminalPaneRef = useRef<TerminalPaneHandle | null>(null);
  const [runningServiceProjectIds, setRunningServiceProjectIds] = useState<Set<string>>(() => new Set());
  const [hookActivityByProjectId, setHookActivityByProjectId] = useState<Record<string, ProjectActivityState>>({});

  // Clear finished hook activity when user returns to the project.
  useEffect(() => {
    if (!selectedCandidate || !document.hasFocus()) return;
    const id = selectedCandidate.id;
    if (hookActivityByProjectId[id] === "idle") {
      setHookActivityByProjectId((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }, [hookActivityByProjectId, selectedCandidate?.id]);
  const [agentClis, setAgentClis] = useState<AgentCli[]>([]);
  const [agentListVersion, setAgentListVersion] = useState(0);
  const [agentStatusByProjectPath, setAgentStatusByProjectPath] = useState<AgentStatusByProjectPath>({});
  const [activeTerminalTabKind, setActiveTerminalTabKind] = useState<ActiveTerminalTabKind>(null);
  const agentClisByTargetRef = useRef<Record<string, AgentCli[]>>({});
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
    const targetId = selectedCandidate?.providerId ?? "local";
    const cached = agentClisByTargetRef.current[targetId];
    if (cached) setAgentClis(cached);
    void listClis({ cwdUri: selectedCandidate?.uri })
      .then((clis) => {
        if (cancelled) return;
        agentClisByTargetRef.current[targetId] = clis;
        setAgentClis(clis);
      })
      .catch((error) => { if (!cancelled) setToast({ tone: "error", message: asMessage(error) }); });
    return () => { cancelled = true; };
  }, [bridgeAvailable, selectedCandidate?.providerId, selectedCandidate?.uri, setToast, agentListVersion]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    const unsubscribe = getBridge().agents?.onStatus?.((event: AgentProjectStatusEvent) => {
      setAgentStatusByProjectPath((current) => {
        if (!event.text) {
          if (!(event.projectPath in current)) return current;
          const next = { ...current };
          delete next[event.projectPath];
          return next;
        }
        return current[event.projectPath] === event.text ? current : { ...current, [event.projectPath]: event.text };
      });
      if (event.hookState) {
        setHookActivityByProjectId((current) => {
          const matchedId = filteredCandidates.find((c) => c.displayPath === event.projectPath)?.id;
          if (!matchedId) return current;
          return current[matchedId] === event.hookState ? current : { ...current, [matchedId]: event.hookState! };
        });
      }
    });
    return () => unsubscribe?.();
  }, [bridgeAvailable, filteredCandidates]);

  function clearProjectHookStatus(projectId: string) {
    const projectPath = filteredCandidates.find((item) => item.id === projectId)?.displayPath;
    setHookActivityByProjectId((current) => {
      if (!(projectId in current)) return current;
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    if (projectPath) {
      setAgentStatusByProjectPath((current) => {
        if (!(projectPath in current)) return current;
        const next = { ...current };
        delete next[projectPath];
        return next;
      });
    }
  }

  const prevBadgeCountRef = useRef(0);
  useEffect(() => {
    const updateBadge = getBridge().dock?.updateBadge;
    if (!updateBadge) return;
    const count = Object.values(hookActivityByProjectId).filter((s) => s === "idle" || s === "attention").length;
    const changed = count !== prevBadgeCountRef.current;
    prevBadgeCountRef.current = count;
    const send = () => { if (!document.hasFocus()) updateBadge(count); };
    if (changed && count > 0 && !document.hasFocus()) updateBadge(count);
    else send();
    const onBlur = () => updateBadge(count);
    const onFocus = () => updateBadge(0);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus); };
  }, [hookActivityByProjectId]);

  const gridStyle = {
    gridTemplateColumns: detailPanelHidden
      ? `${projectColumnWidth}px ${resizerColumnWidth}px minmax(${minTerminalColumnWidth}px, 1fr) 0px 0px`
      : `${projectColumnWidth}px ${resizerColumnWidth}px minmax(${minTerminalColumnWidth}px, 1fr) ${resizerColumnWidth}px ${detailColumnWidth}px`,
  } satisfies CSSProperties;

  return (
    <div className={cx("dashboard-grid", detailPanelHidden && "is-detail-hidden")} ref={gridRef} style={gridStyle}>
      <section className="project-panel">
        <div className="project-window-drag-strip" aria-hidden="true" />
        <div className="project-panel-header">
          <span className="project-panel-title">Projects</span>
          <button aria-label="Add project" className="icon-button" title="Add project" type="button" onClick={() => void onPickProject()}>
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
              projectActivityByProjectId={hookActivityByProjectId}
              selectedId={selectedCandidate?.id ?? null}
              onSelect={setSelectedId}
              onRemoveProject={onRemoveProject}
              onRenameProject={onRenameProject}
              onUninstallProtocol={onUninstallProtocol}
            />
          ) : (
            <div className="empty-state compact-title-row" style={{ padding: "24px 16px" }}>
              <strong>No projects</strong>
              <span>Add a project directory to get started.</span>
              <button className="button" type="button" style={{ marginTop: "12px" }} onClick={() => void onPickProject()}>Add Project</button>
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
          onProjectHookStatusClear={clearProjectHookStatus}
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
            agentClis={agentClis}
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
            onRestoreAgentSession={(restore) =>
              terminalPaneRef.current?.openAgentSession(selectedCandidate.uri, projectAliases[selectedCandidate.uri] || selectedCandidate.name, restore.command, restore.title) ?? Promise.resolve()
            }
          />
        ) : (
          <EmptyState title="No project selected" body="Select a project to get started." />
        )}
      </section>
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
  onProjectHookStatusClear: (projectId: string) => void;
  onRunningServiceProjectIdsChange: (projectIds: Set<string>) => void;
}>(function TerminalPane({ appearanceTheme, agentClis, bridgeAvailable, candidate, projectAliases, isVisible, setToast, onActiveTabKindChange, onAgentListRefreshRequested, onProjectHookStatusClear, onRunningServiceProjectIdsChange }, ref) {
  const [spaces, setSpaces] = useState<Record<string, TerminalSpace>>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const spacesRef = useRef<Record<string, TerminalSpace>>({});
  const creatingProjects = useRef(new Set<string>());
  const pendingTerminalOutput = useRef(new Map<string, string>());
  const focusRequestNonce = useRef(0);
  const [tabFocusRequest, setTabFocusRequest] = useState<{ projectId: string; nonce: number } | null>(null);
  const selectedSpace = candidate?.id ? spaces[candidate.id] ?? null : null;
  const canCreate = bridgeAvailable && Boolean(candidate?.uri) && (candidate?.providerKind === "local");
  const services = candidate?.services ?? [];

  useEffect(() => { spacesRef.current = spaces; }, [spaces]);
  useEffect(() => {
    const pending = pendingTerminalOutput.current;
    for (const [sessionId, data] of [...pending]) {
      const tab = findTerminalTab(spaces, sessionId);
      if (!tab) continue;
      pending.delete(sessionId);
      writeTerminalOutputToTab(sessionId, tab, data);
    }
  }, [spaces]);
  useEffect(() => () => { pendingTerminalOutput.current.clear(); }, []);

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
    if (isVisible) requestProjectTabFocus(candidate.id);
    const existing = spacesRef.current[candidate.id];
    if (!isVisible) return;
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
    const baseCommand = agent.executablePath || agent.command;
    const flags = getAgentLaunchFlags(agent.id);
    if (agent.id === "kiro" && getAgentHooksEnabled("kiro") && !flags.includes("--agent sharkbay")) {
      flags.push("--agent sharkbay");
    }
    const base = agent.id === "kiro" ? `${shellQuote(baseCommand)} chat` : shellQuote(baseCommand);
    const launchCommand = flags.length ? `${base} ${flags.join(" ")}` : base;
    await openProjectTab(candidate.id, candidate.uri, displayProjectName ?? candidate.name, candidate.displayPath, false, { agentId: agent.id, initialCommand: launchCommand, initialCommandTitle: agent.label });
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
    openAgentSession: async (projectUri, projectName, command, title) => {
      await openProjectTab(projectUri, projectUri, projectName, selectedSpace?.displayPath ?? projectUri, false, { initialCommand: command, initialCommandTitle: title });
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

  async function openProjectTab(projectId: string, cwdUri: string, projectName: string, displayPath: string, quiet = false, options: Pick<TerminalCreateInput, "agentId" | "initialCommand" | "initialCommandTitle" | "service"> = {}) {
    try {
      const session = await createTerminal(cwdUri, projectName, options);
      const terminal = createXTerm(session.id, appearanceTheme, setToast);
      const tab: TerminalTab = { kind: "terminal", session, terminal: terminal.instance, fitAddon: terminal.fitAddon, disposables: terminal.disposables };
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
    if (!tab) {
      bufferPendingTerminalOutput(event);
      return;
    }
    writeTerminalOutputToTab(event.sessionId, tab, event.data);
  }

  function writeTerminalOutputToTab(sessionId: string, tab: TerminalShellTab, data: string) {
    tab.terminal.write(data);
    if (isRunningServiceTab(tab)) recordServiceUrl(sessionId, data);
  }

  function bufferPendingTerminalOutput(event: TerminalDataEvent) {
    const existing = pendingTerminalOutput.current.get(event.sessionId) ?? "";
    const combined = `${existing}${event.data}`;
    pendingTerminalOutput.current.set(
      event.sessionId,
      combined.length > maxPendingTerminalOutputChars ? combined.slice(-maxPendingTerminalOutputChars) : combined,
    );
  }

  function markTerminalExit(event: TerminalExitEvent) {
    const message = `\r\n[process exited${event.exitCode === null ? "" : ` with code ${event.exitCode}`}${event.signal ? `, signal ${event.signal}` : ""}]\r\n`;
    const match = findTerminalTabWithSpace(spacesRef.current, event.sessionId);
    const pending = pendingTerminalOutput.current.get(event.sessionId);
    if (pending && match?.tab) {
      pendingTerminalOutput.current.delete(event.sessionId);
      match.tab.terminal.write(pending);
    } else if (!match?.tab) {
      pendingTerminalOutput.current.delete(event.sessionId);
    }
    match?.tab.terminal.write(message);
    if (match?.tab) {
      const hint = explainEarlyTerminalExit(match.tab, event);
      if (hint) setToast({ tone: "error", message: hint });
      if (match.tab.session.agentId) onProjectHookStatusClear(match.space.projectId);
    }
    setSpaces((current) => mapTerminalTab(current, event.sessionId, (currentTab) => ({ ...currentTab, session: { ...currentTab.session, status: "exited" } })));
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
      match.tab.disposables.forEach((d) => d.dispose());
      match.tab.terminal.dispose();
      if (match.tab.session.agentId) onProjectHookStatusClear(match.space.projectId);
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
    requestProjectTabFocus(projectId);
    setSpaces((current) => {
      const space = current[projectId];
      if (!space) return current;
      return { ...current, [projectId]: { ...space, activeId: sessionId } };
    });
  }

  function requestProjectTabFocus(projectId: string) {
    focusRequestNonce.current += 1;
    setTabFocusRequest({ projectId, nonce: focusRequestNonce.current });
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
                        <button className="terminal-tab-main" type="button" onClick={() => { setActiveTab(space.projectId, tabId); }}>
                          {tab.kind === "terminal" ? (
                            <span className={cx("terminal-state", tab.session.service && tab.session.status === "running" && "is-service-running", tab.session.status === "exited" && "is-exited")} />
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
            </div>
            <div className="xterm-surface-stack">
              {space.tabs.map((tab) => {
                const active = isVisible && space.projectId === activeProjectId && tabIdForTab(tab) === space.activeId;
                const focusRequest = active && tabFocusRequest?.projectId === space.projectId ? tabFocusRequest.nonce : 0;
                if (tab.kind === "terminal") {
                  return <XTermSurface active={active} focusRequest={focusRequest} key={tab.session.id} tab={tab} onResize={(cols, rows) => void resizeTerminal(tab.session.id, cols, rows).catch((error) => setToast({ tone: "error", message: asMessage(error) }))} />;
                }
                if (tab.kind === "browser") {
                  return <BrowserSurface active={active} focusRequest={focusRequest} key={tab.browser.id} setToast={setToast} tab={tab} onAddressChange={(value) => updateBrowserAddress(tab.browser.id, value)} onBrowserUpdate={(browser) => updateBrowserSession(browser)} />;
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
            </div>
            <div className="xterm-surface-stack"></div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

function BrowserSurface({
  active,
  focusRequest,
  onAddressChange,
  onBrowserUpdate,
  setToast,
  tab,
}: {
  active: boolean;
  focusRequest: number;
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

  useEffect(() => {
    if (!active || !focusRequest) return;
    let frame = 0;
    let secondFrame = 0;
    frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const bounds = hostRef.current ? browserBoundsForElement(hostRef.current) : hiddenBrowserBounds();
        if (!bounds.width || !bounds.height) return;
        void resizeBrowser(tab.browser.id, bounds, true).catch((error) => setToast({ tone: "error", message: asMessage(error) }));
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [active, focusRequest, setToast, tab.browser.id]);

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

function XTermSurface({ active, focusRequest, onResize, tab }: { active: boolean; focusRequest: number; onResize: (cols: number, rows: number) => void; tab: TerminalShellTab }) {
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
  }, [active, focusRequest, tab]);
  return <div aria-hidden={!active} className={cx("xterm-surface", active && "is-active")} ref={hostRef} />;
}

function isUserEditingElsewhere(): boolean {
  const node = document.activeElement as HTMLElement | null;
  if (!node) return false;
  if (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT") return true;
  return node.isContentEditable === true;
}

function createXTerm(sessionId: string, appearanceTheme: AppearanceTheme, setToast: (toast: Toast) => void) {
  const instance = new XTerm({ allowTransparency: false, cursorBlink: true, fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace', fontSize: 12, scrollback: 5000, theme: terminalThemes[appearanceTheme] });
  const fitAddon = new FitAddon();
  instance.loadAddon(fitAddon);
  instance.loadAddon(new WebLinksAddon());
  const inputDisposable = instance.onData((data) => { const fire = getBridge().terminal?.inputFire; if (fire) { fire({ sessionId, data }); } else { void sendTerminalInput(sessionId, data).catch((error) => setToast({ tone: "error", message: asMessage(error) })); } });
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
      const nextTab = mapTab(tab);
      if (nextTab === tab) return tab;
      spaceChanged = true;
      changed = true;
      return nextTab;
    });
    return [projectId, spaceChanged ? { ...space, tabs: nextTabs } : space];
  }));
  return changed ? nextSpaces : spaces;
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

type ConfirmUninstallState = {
  repoPath: string;
  name: string;
  canCleanTeamContext: boolean;
  cleanTeamContext: boolean;
  ownerCheckError: string | null;
  checkingOwner: boolean;
};

type ProjectMenuState = {
  id: string;
  x: number;
  y: number;
  canUninstallProtocol: boolean;
};

function ProjectList({ agentStatusByProjectPath, candidates, projectAliases, runningServiceProjectIds, projectActivityByProjectId, selectedId, onSelect, onRemoveProject, onRenameProject, onUninstallProtocol }: {
  agentStatusByProjectPath: AgentStatusByProjectPath;
  candidates: ProjectCandidate[];
  projectAliases: Record<string, string>;
  runningServiceProjectIds: Set<string>;
  projectActivityByProjectId: Record<string, ProjectActivityState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemoveProject: (uri: string) => Promise<void>;
  onRenameProject: (uri: string, name: string) => Promise<void>;
  onUninstallProtocol: (repoPath: string, cleanTeamContext?: boolean) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState<ProjectMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<{ uri: string; name: string } | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<ConfirmUninstallState | null>(null);
  const [removing, setRemoving] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
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

  function openProjectMenu(candidate: ProjectCandidate, x: number, y: number) {
    setMenuOpen({ id: candidate.id, x, y, canUninstallProtocol: false });
    const repoPath = localPathFromCandidate(candidate);
    const getStatus = getBridge().protocol?.getStatus;
    if (!repoPath || !getStatus) return;

    void getStatus({ repoPath })
      .then((status) => {
        setMenuOpen((current) => current?.id === candidate.id
          ? { ...current, canUninstallProtocol: status.harnessInstalled }
          : current
        );
      })
      .catch(() => undefined);
  }

  async function openUninstallDialog(candidate: ProjectCandidate, repoPath: string) {
    const name = projectAliases[candidate.uri] || candidate.name;
    setConfirmUninstall({
      repoPath,
      name,
      canCleanTeamContext: false,
      cleanTeamContext: false,
      ownerCheckError: null,
      checkingOwner: true,
    });

    let canCleanTeamContext = false;
    let ownerCheckError: string | null = null;
    try {
      const detail = await getProjectDetail(candidate);
      const owner = githubOwnerFromRemote(detail.repoUrl);
      if (owner) {
        const resolveIdentity = getBridge().protocol?.resolveIdentity;
        if (!resolveIdentity) throw new Error("GitHub identity lookup is not exposed by the preload API.");
        const identity = await resolveIdentity();
        canCleanTeamContext = owner.toLowerCase() === identity.login.toLowerCase();
      }
    } catch (error) {
      ownerCheckError = asMessage(error);
    } finally {
      setConfirmUninstall((current) => current?.repoPath === repoPath
        ? { ...current, canCleanTeamContext, ownerCheckError, checkingOwner: false }
        : current
      );
    }
  }

  if (!candidates.length) return null;
  return (
    <section className="project-section">
      <div className="project-list" aria-label="Projects">
        {candidates.map((candidate) => {
          const hasRunningService = runningServiceProjectIds.has(candidate.id);
          const projectActivity = projectActivityForCandidate(candidate, projectActivityByProjectId);
          const hasProjectStatus = Boolean(projectActivity);
          const agentStatus = agentStatusByProjectPath[candidate.displayPath];
          const subtitle = projectActivity === "idle" ? candidate.displayPath : agentStatus ?? candidate.displayPath;
          const displayName = projectAliases[candidate.uri] || candidate.name;
          const isRenaming = renamingId === candidate.id;
          return (
            <button
              className={cx("project-row", selectedId === candidate.id && "is-selected")}
              key={candidate.id}
              onClick={() => onSelect(candidate.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                openProjectMenu(candidate, event.clientX, event.clientY);
              }}
              onKeyDown={(event) => {
                if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                event.preventDefault();
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                openProjectMenu(candidate, rect.left + 24, rect.top + 24);
              }}
            >
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
                {hasProjectStatus && projectActivity ? (
                  <span className={cx("terminal-activity-pill", projectActivity === "working" ? "is-working" : projectActivity === "attention" ? "is-attention" : "is-idle")}>{projectActivity === "working" ? "working" : projectActivity === "attention" ? "attention" : "idle"}</span>
                ) : null}
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
            <div className="modal-actions">
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
      {confirmUninstall ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uninstalling) setConfirmUninstall(null); }}>
          <section aria-modal="true" className="modal-panel" role="dialog" aria-labelledby="confirm-uninstall-protocol-title" style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <div>
                <h3 id="confirm-uninstall-protocol-title">Uninstall Protocol?</h3>
                <p>
                  {confirmUninstall.cleanTeamContext
                    ? <>This removes the local protocol harness from <strong>{confirmUninstall.name}</strong> and deletes the team context branch.</>
                    : <>This removes the local protocol harness from <strong>{confirmUninstall.name}</strong>. Source files are not deleted.</>}
                </p>
              </div>
              <button aria-label="Close" className="icon-button" disabled={uninstalling} type="button" onClick={() => setConfirmUninstall(null)}>x</button>
            </div>
            <div className="protocol-cleanup-options">
              {confirmUninstall.canCleanTeamContext ? (
                <label className="checkbox-row">
                  <input
                    checked={confirmUninstall.cleanTeamContext}
                    disabled={uninstalling}
                    type="checkbox"
                    onChange={(event) => setConfirmUninstall((current) => current ? { ...current, cleanTeamContext: event.currentTarget.checked } : current)}
                  />
                  <span>Also clean the team context branch</span>
                </label>
              ) : confirmUninstall.checkingOwner ? (
                <p className="form-note">Checking repository owner...</p>
              ) : confirmUninstall.ownerCheckError ? (
                <p className="form-note">Owner check unavailable.</p>
              ) : null}
            </div>
            <div className="modal-actions">
              <button className="button secondary" disabled={uninstalling} type="button" onClick={() => setConfirmUninstall(null)}>Cancel</button>
              <button className="button is-danger" disabled={uninstalling || confirmUninstall.checkingOwner} type="button" onClick={async () => {
                const target = confirmUninstall;
                if (!target) return;
                setUninstalling(true);
                try { await onUninstallProtocol(target.repoPath, target.cleanTeamContext); setConfirmUninstall(null); } finally { setUninstalling(false); }
              }}>{uninstalling ? "Uninstalling" : confirmUninstall.checkingOwner ? "Checking" : "Uninstall"}</button>
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
          {(() => {
            const candidate = candidates.find((c) => c.id === menuOpen.id);
            const repoPath = candidate ? localPathFromCandidate(candidate) : null;
            if (!candidate || !repoPath || !menuOpen.canUninstallProtocol) return null;
            return (
              <button
                className="project-context-menu-item"
                type="button"
                onClick={() => {
                  setMenuOpen(null);
                  void openUninstallDialog(candidate, repoPath);
                }}
              >
                Uninstall Protocol
              </button>
            );
          })()}
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

function ProjectDetailPane({ agentClis, detail, candidate, setToast, onRefresh, onOpenFileInEditor, onOpenGitDiff, onOpenBrowserTab, onRestoreAgentSession }: {
  agentClis: AgentCli[];
  detail: ProjectDetail | null;
  candidate: ProjectCandidate;
  setToast: (toast: Toast) => void;
  onRefresh: () => Promise<void>;
  onOpenFileInEditor: (relativePath: string) => Promise<void>;
  onOpenGitDiff: (relativePath: string) => Promise<void>;
  onOpenBrowserTab: (url: string) => Promise<void>;
  onRestoreAgentSession: (restore: AgentSessionRestoreCommand) => Promise<void>;
}) {
  const isLocal = candidate.providerKind === "local";
  const availableTabs = detailTabs.filter((tab) => !tab.localOnly || isLocal);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("git");
  const [codeGraphStatus, setCodeGraphStatus] = useState<CodeGraphStatusView>({ loading: false, status: null, error: null });
  const lastCodeGraphDirtyCount = useRef<{ projectUri: string; count: number } | null>(null);
  const currentDetail = detail?.uri === candidate.uri ? detail : null;
  const isGitManaged = currentDetail ? currentDetail.dirtyWorktree !== null : null;
  const gitDirtyFileCount = currentDetail ? currentDetail.gitDirtyFiles?.length ?? 0 : null;
  const visibleDetailTab = availableTabs.some((tab) => tab.id === activeDetailTab)
    ? activeDetailTab
    : availableTabs[0]?.id ?? "git";

  useEffect(() => {
    let cancelled = false;
    setCodeGraphStatus({ loading: true, status: null, error: null });
    void readCodeGraphStatus(candidate.uri)
      .then((status) => {
        if (!cancelled) setCodeGraphStatus({ loading: false, status, error: null });
      })
      .catch((error) => {
        if (!cancelled) setCodeGraphStatus({ loading: false, status: null, error: asMessage(error) });
      });
    return () => { cancelled = true; };
  }, [candidate.uri]);

  useEffect(() => {
    const statusState = codeGraphStatus.status?.state;
    if (!statusState || !shouldEnsureCodeGraphForSelection({ providerKind: candidate.providerKind, isGitManaged, statusState })) return;
    let cancelled = false;
    setCodeGraphStatus((current) => ({ ...current, loading: true, error: null }));
    void ensureCodeGraphStatus(candidate.uri)
      .then((status) => {
        if (!cancelled) setCodeGraphStatus({ loading: false, status, error: null });
      })
      .catch((error) => {
        if (!cancelled) setCodeGraphStatus({ loading: false, status: null, error: asMessage(error) });
      });
    return () => { cancelled = true; };
  }, [candidate.providerKind, candidate.uri, codeGraphStatus.status?.state, isGitManaged]);

  useEffect(() => {
    if (!isLocal || isGitManaged !== false) return;
    let cancelled = false;
    setCodeGraphStatus({ loading: true, status: null, error: null });
    void ensureCodeGraphStatus(candidate.uri)
      .then((status) => {
        if (!cancelled) setCodeGraphStatus({ loading: false, status, error: null });
      })
      .catch((error) => {
        if (!cancelled) setCodeGraphStatus({ loading: false, status: null, error: asMessage(error) });
      });
    return () => { cancelled = true; };
  }, [candidate.uri, isLocal, isGitManaged]);

  useEffect(() => {
    if (!isLocal || isGitManaged !== true || gitDirtyFileCount === null) return;
    const previous = lastCodeGraphDirtyCount.current;
    lastCodeGraphDirtyCount.current = { projectUri: candidate.uri, count: gitDirtyFileCount };
    if (!previous || previous.projectUri !== candidate.uri || previous.count === gitDirtyFileCount) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCodeGraphStatus({ loading: true, status: null, error: null });
      void ensureCodeGraphStatus(candidate.uri)
        .then((status) => {
          if (!cancelled) setCodeGraphStatus({ loading: false, status, error: null });
        })
        .catch((error) => {
          if (!cancelled) setCodeGraphStatus({ loading: false, status: null, error: asMessage(error) });
        });
    }, codeGraphSyncDebounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [candidate.uri, gitDirtyFileCount, isGitManaged, isLocal]);

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
          <button aria-controls={`project-detail-tabpanel-${tab.id}`} aria-selected={visibleDetailTab === tab.id} className={cx("detail-tab-card", visibleDetailTab === tab.id && "is-active")} id={`project-detail-tab-${tab.id}`} key={tab.id} role="tab" tabIndex={visibleDetailTab === tab.id ? 0 : -1} type="button" onKeyDown={(event) => handleDetailTabKeyDown(event, tab.id)} onClick={() => setActiveDetailTab(tab.id)}>
            {tab.label}
            {tab.id === "git" && (detail?.gitDirtyFiles?.length ?? 0) > 0 ? <span className="tab-badge">{detail!.gitDirtyFiles!.length}</span> : null}
          </button>
        ))}
      </div>
      <div aria-labelledby="project-detail-tab-git" className="detail-tab-panel" hidden={visibleDetailTab !== "git"} id="project-detail-tabpanel-git" role="tabpanel">
        <GitDetailTab detail={detail} candidate={candidate} setToast={setToast} onOpenFileInEditor={onOpenFileInEditor} onOpenGitDiff={onOpenGitDiff} />
      </div>
      {isLocal ? (
        <div aria-labelledby="project-detail-tab-sessions" className="detail-tab-panel" hidden={visibleDetailTab !== "sessions"} id="project-detail-tabpanel-sessions" role="tabpanel">
          <SessionsDetailTab
            active={visibleDetailTab === "sessions"}
            agentClis={agentClis}
            candidate={candidate}
            setToast={setToast}
            onRestoreAgentSession={onRestoreAgentSession}
          />
        </div>
      ) : null}
      {isLocal ? (
        <div aria-labelledby="project-detail-tab-tasks" className="detail-tab-panel" hidden={visibleDetailTab !== "tasks"} id="project-detail-tabpanel-tasks" role="tabpanel">
          <TasksDetailTab
            active={visibleDetailTab === "tasks"}
            agentClis={agentClis}
            candidate={candidate}
            setToast={setToast}
            onOpenBrowserTab={onOpenBrowserTab}
            onRefresh={onRefresh}
            onRestoreAgentSession={onRestoreAgentSession}
          />
        </div>
      ) : null}
      <div aria-labelledby="project-detail-tab-files" className="detail-tab-panel" hidden={visibleDetailTab !== "files"} id="project-detail-tabpanel-files" role="tabpanel">
        <FilesDetailTab active={visibleDetailTab === "files"} candidate={candidate} codeGraphStatus={codeGraphStatus} detail={detail} setToast={setToast} onOpenFileInEditor={onOpenFileInEditor} />
      </div>
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

function SessionsDetailTab({ active, agentClis, candidate, setToast, onRestoreAgentSession }: {
  active: boolean;
  agentClis: AgentCli[];
  candidate: ProjectCandidate;
  setToast: (toast: Toast) => void;
  onRestoreAgentSession: (restore: AgentSessionRestoreCommand) => Promise<void>;
}) {
  const repoPath = localPathFromCandidate(candidate);
  const [sessions, setSessions] = useState<HookSessionViewModel[]>([]);

  useEffect(() => {
    if (!active || !repoPath) return;
    let cancelled = false;
    const getSessions = getBridge().hooks?.getSessions;
    if (!getSessions) return;

    async function refresh() {
      try {
        const result = await getSessions!({ repoPath: repoPath! });
        if (!cancelled) setSessions(result);
      } catch {
        // silent
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, repoPath]);

  if (!repoPath) return <EmptyState title="Sessions unavailable" body="Sessions are available for local projects with hooks installed." />;
  if (!sessions.length) return <EmptyState title="No sessions" body="Agent sessions will appear here once hooks capture activity." />;

  return (
    <div className="queue-list task-list-direct">
      {sessions.map((session) => {
        const restoreAgentId = inferAgentSessionRestoreAgent(session.agentId);
        const restoreFlags = restoreAgentId ? getAgentLaunchFlags(restoreAgentId) : [];
        if (restoreAgentId === "kiro" && getAgentHooksEnabled("kiro") && !restoreFlags.includes("--agent sharkbay")) {
          restoreFlags.push("--agent sharkbay");
        }
        const restore = buildAgentSessionRestoreCommand({ agentName: session.agentId, sessionId: session.sessionId, availableAgents: agentClis, launchFlags: restoreFlags });
        const modelShort = session.model ? formatSessionModelName(session.model) : null;
        const subtitle = [modelShort, `${session.turnCount} turns`].filter(Boolean).join(" · ");
        return (
          <button
            className="queue-item"
            key={session.sessionId}
            type="button"
            onClick={() => {
              if (restore) void onRestoreAgentSession(restore);
            }}
            disabled={!restore}
          >
            <span className="task-avatar">
              <SessionAgentIcon agentId={session.agentId} />
            </span>
            <span className="task-row-main">
              <span className="task-title">{session.sessionId.slice(0, 8)}</span>
              <small>{subtitle}{session.lastEventAt ? ` · ${formatRelativeTime(session.lastEventAt)}` : ""}</small>
            </span>
            <span className="phase-pill phase-done">{session.promptCount} prompts</span>
          </button>
        );
      })}
    </div>
  );
}

function SessionAgentIcon({ agentId }: { agentId: string }) {
  if (agentId === "codex") return <CodexIcon />;
  if (agentId === "claude") return <ClaudeCodeIcon />;
  if (agentId === "gemini") return <GeminiCliIcon />;
  if (agentId === "kiro") return <KiroIcon />;
  if (agentId === "deepseek") return <CodeWhaleIcon />;
  if (agentId === "qwen") return <QwenIcon />;
  return <span aria-hidden="true" className="agent-cli-monogram">{agentId.slice(0, 2).toUpperCase()}</span>;
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

function TasksDetailTab({ active, agentClis, candidate, setToast, onOpenBrowserTab, onRefresh, onRestoreAgentSession }: {
  active: boolean;
  agentClis: AgentCli[];
  candidate: ProjectCandidate;
  setToast: (toast: Toast) => void;
  onOpenBrowserTab: (url: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRestoreAgentSession: (restore: AgentSessionRestoreCommand) => Promise<void>;
}) {
  const repoPath = localPathFromCandidate(candidate);
  const [tasks, setTasks] = useState<TaskViewModel[]>([]);
  const [status, setStatus] = useState<ProtocolStatus | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"install" | "site" | "harness" | null>(null);
  const selected = useMemo(
    () => selectedTaskId ? tasks.find((task) => task.taskId === selectedTaskId) ?? null : null,
    [selectedTaskId, tasks],
  );

  useEffect(() => {
    if (!active || !repoPath) return;
    let cancelled = false;
    const activeRepoPath = repoPath;
    const protocol = getBridge().protocol;
    const getTasks = protocol?.getTasks;
    const getStatus = protocol?.getStatus;
    if (!getTasks || !getStatus) {
      return;
    }
    const getTasksHandler: NonNullable<NonNullable<SharkBayBridge["protocol"]>["getTasks"]> = getTasks;
    const getStatusHandler: NonNullable<NonNullable<SharkBayBridge["protocol"]>["getStatus"]> = getStatus;

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
      } catch (error) {
        if (cancelled) return;
        const message = asMessage(error);
        if (showToast) setToast({ tone: "error", message });
      }
    }

    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), 3000);
    const unsubscribe = protocol?.onTasksChanged?.((event) => {
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

  async function installProtocolHarness() {
    if (!repoPath) return;
    setBusyAction("install");
    try {
      const install = getBridge().protocol?.install;
      if (!install) throw new Error("Protocol install API is not available.");
      const nextStatus = await install({ repoPath });
      setStatus(nextStatus);
      setToast({ tone: "success", message: "Protocol installed." });
      await onRefresh();
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

  async function updateProtocolHarness() {
    if (!repoPath) return;
    setBusyAction("harness");
    try {
      const updateHarness = getBridge().protocol?.updateHarness;
      if (!updateHarness) throw new Error("Protocol harness update API is not available.");
      const nextStatus = await updateHarness({ repoPath });
      setStatus(nextStatus);
      setToast({ tone: "success", message: "Protocol harness updated." });
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  async function restoreTaskSession(restore: AgentSessionRestoreCommand) {
    try {
      await onRestoreAgentSession(restore);
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    }
  }

  if (!repoPath) return <EmptyState title="Task Protocol unavailable" body="Task Protocol is available for local Git projects." />;

  if (selected) {
    const pill = taskPill(selected);
    return (
      <div className="mock-task-detail">
        <div className="task-detail-header">
          <button className="icon-button" type="button" onClick={() => setSelectedTaskId(null)} aria-label="Back to task list">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="task-avatar task-detail-avatar">
            {selected.owner.avatarUrl ? <CachedAvatar url={selected.owner.avatarUrl} /> : selected.owner.githubLogin.slice(0, 2).toUpperCase()}
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
      {status && !status.installed ? (
        <section className="subpanel confirm-panel protocol-action-card">
          <div>
            <h4>Install Protocol</h4>
            <p className="summary-text">Requires a GitHub origin and write access. Installation creates the local harness and enables team sync.</p>
          </div>
          <div className="button-row">
            <button className="button compact" disabled={busyAction !== null} type="button" onClick={() => void installProtocolHarness()}>
              {busyAction === "install" ? "Installing" : "Install Protocol"}
            </button>
          </div>
        </section>
      ) : null}

      {status?.installed ? (
        status.harnessUpdate.required ? (
          <section className="subpanel confirm-panel protocol-action-card protocol-harness-card">
            <div>
              <h4>Harness Update</h4>
              <p className="summary-text">Harness files differ from the current source. Update them?</p>
              <p className="summary-text protocol-harness-files">
                {status.harnessUpdate.files.length} {status.harnessUpdate.files.length === 1 ? "file" : "files"} need attention: {status.harnessUpdate.files.map((file) => file.path).join(", ")}
              </p>
            </div>
            <div className="button-row">
              <button className="button compact" disabled={busyAction !== null} type="button" onClick={() => void updateProtocolHarness()}>
                {busyAction === "harness" ? "Updating" : "Update Harness"}
              </button>
            </div>
          </section>
        ) : null
      ) : null}

      {status?.installed ? (
        <section className="subpanel confirm-panel protocol-action-card">
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
          const restore = taskRestoreCommand(task, status, agentClis);
          return (
            <div className={cx("task-card-stack", restore && "has-restore-session")} key={task.taskId}>
              <button className="queue-item" type="button" onClick={() => setSelectedTaskId(task.taskId)}>
                <span className="task-avatar">
                  {task.owner.avatarUrl ? <CachedAvatar url={task.owner.avatarUrl} /> : task.owner.githubLogin.slice(0, 2).toUpperCase()}
                </span>
                <span className="task-row-main">
                  <span className="task-title">{task.title}</span>
                  <small>{task.taskTag} · {task.owner.githubLogin}{createdTime ? ` · ${createdTime}` : ""}</small>
                </span>
                <span className={cx("phase-pill", pill.cls)}>{pill.label}</span>
              </button>
              {restore ? <TaskSessionRestoreCard agentName={task.agent ?? restore.label} restore={restore} onRestore={() => void restoreTaskSession(restore)} /> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function taskRestoreCommand(task: TaskViewModel, status: ProtocolStatus | null, agentClis: AgentCli[]): AgentSessionRestoreCommand | null {
  if (!status?.githubUserId || !status.machineId) return null;
  if (task.owner.githubUserId !== status.githubUserId) return null;
  if (task.machine !== status.machineId) return null;
  const agentId = inferAgentSessionRestoreAgent(task.agent);
  const launchFlags = agentId ? getAgentLaunchFlags(agentId) : [];
  if (agentId === "kiro" && getAgentHooksEnabled("kiro") && !launchFlags.includes("--agent sharkbay")) {
    launchFlags.push("--agent sharkbay");
  }
  return buildAgentSessionRestoreCommand({
    agentName: task.agent,
    sessionId: task.sessionId,
    availableAgents: agentClis,
    launchFlags,
  });
}

function TaskSessionRestoreCard({ agentName, restore, onRestore }: {
  agentName: string;
  restore: AgentSessionRestoreCommand;
  onRestore: () => void;
}) {
  const iconAgent: AgentCli = {
    id: restore.agentId,
    label: restore.label,
    command: "",
    executablePath: "",
    shortLabel: restore.shortLabel,
  };
  return (
    <div className="task-session-restore-card">
      <span className="task-session-agent-icon"><AgentCliIcon agent={iconAgent} /></span>
      <span className="task-session-agent-name">{agentName}</span>
      <button className="task-session-restore-link" type="button" onClick={onRestore}>restore session</button>
    </div>
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


function FilesDetailTab({ active, candidate, codeGraphStatus, detail, setToast, onOpenFileInEditor }: {
  active: boolean;
  candidate: ProjectCandidate;
  codeGraphStatus: CodeGraphStatusView;
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

  const fileContent = (() => {
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
  })();

  return (
    <>
      <CodeGraphStatusSummary codeGraphStatus={codeGraphStatus} />
      {fileContent}
    </>
  );
}

function CodeGraphStatusSummary({ codeGraphStatus }: { codeGraphStatus: CodeGraphStatusView }) {
  const line = codeGraphStatus.loading
    ? "Checking CodeGraph index."
    : codeGraphStatus.error
      ? `CodeGraph status unavailable: ${codeGraphStatus.error}`
      : codeGraphStatus.status?.summary ?? "CodeGraph status unavailable.";
  return (
    <section className="subpanel codegraph-status-card" aria-label="CodeGraph status summary">
      <h4>CodeGraph</h4>
      <div className="codegraph-status-line">{line}</div>
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

function SettingsView({ appearanceTheme, configuredProjects, bridgeAvailable, candidates, scanErrors, initialSection, setToast, onBack, onRemoveProject, onThemeChange }: {
  appearanceTheme: AppearanceTheme; configuredProjects: string[];  bridgeAvailable: boolean; candidates: ProjectCandidate[]; scanErrors: string[]; initialSection?: SettingsSection; setToast: (toast: Toast) => void;
  onBack: () => void; onRemoveProject: (path: string) => Promise<void>;
  onThemeChange: (theme: AppearanceTheme) => Promise<void>;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection ?? "appearance");
  useEffect(() => { if (initialSection) setActiveSection(initialSection); }, [initialSection]);

  return (
    <div className="settings-layout">
      <div className="settings-shell">
        <aside className="settings-nav" aria-label="Settings sections">
          <button className="settings-back-button" type="button" onClick={onBack}><ArrowLeftIcon /><span>Back</span></button>
          <div className="settings-nav-group">
            <button aria-current={activeSection === "appearance" ? "page" : undefined} className={cx("settings-nav-item", activeSection === "appearance" && "is-selected")} type="button" onClick={() => setActiveSection("appearance")}>
              <SunIcon /><span>Appearance</span>
            </button>
            <button aria-current={activeSection === "agent-clis" ? "page" : undefined} className={cx("settings-nav-item", activeSection === "agent-clis" && "is-selected")} type="button" onClick={() => setActiveSection("agent-clis")}>
              <TerminalIcon /><span>Agent CLIs</span>
            </button>
            <button aria-current={activeSection === "extensions" ? "page" : undefined} className={cx("settings-nav-item", activeSection === "extensions" && "is-selected")} type="button" onClick={() => setActiveSection("extensions")}>
              <PuzzleIcon /><span>Extensions</span>
            </button>
            <button aria-current={activeSection === "diagnostics" ? "page" : undefined} className={cx("settings-nav-item", activeSection === "diagnostics" && "is-selected")} type="button" onClick={() => setActiveSection("diagnostics")}>
              <ActivityIcon /><span>Diagnostics</span>
            </button>
          </div>
        </aside>
        <section className="settings-content" aria-label="Settings content">
          <div className="settings-section-panel" hidden={activeSection !== "agent-clis"}>
            <div className="settings-section-heading"><h4>Agent CLIs</h4><span>Installed coding agents</span></div>
            <AgentClisSettingsPanel active={activeSection === "agent-clis"} bridgeAvailable={bridgeAvailable} setToast={setToast} />
          </div>
          <div className="settings-section-panel" hidden={activeSection !== "extensions"}>
            <div className="settings-section-heading"><h4>Extensions</h4><span>Manage installed plugins</span></div>
            <ExtensionsSettingsPanel active={activeSection === "extensions"} setToast={setToast} />
          </div>
          <div className="settings-section-panel" hidden={activeSection !== "diagnostics"}>
            <div className="settings-section-heading"><h4>Diagnostics</h4><span>Inspect job queue and cache hits</span></div>
            <DiagnosticsSettingsPanel active={activeSection === "diagnostics"} setToast={setToast} />
          </div>
          <div className="settings-section-panel" hidden={activeSection !== "appearance"}>
            <div className="settings-section-heading"><h4>Appearance</h4><span>{appearanceDescription(appearanceTheme)}</span></div>
            <AppearanceSettingsPanel appearanceTheme={appearanceTheme} setToast={setToast} onThemeChange={onThemeChange} />
          </div>
        </section>
      </div>
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

type AgentCliDefinition = { id: string; label: string; shortLabel: string };

const allAgentCliDefinitions: AgentCliDefinition[] = [
  { id: "claude", label: "Claude Code", shortLabel: "Cl" },
  { id: "codex", label: "Codex CLI", shortLabel: "Cx" },
  { id: "gemini", label: "Gemini CLI", shortLabel: "G" },
  { id: "kiro", label: "Kiro CLI", shortLabel: "K" },
  { id: "deepseek", label: "CodeWhale", shortLabel: "D" },
  { id: "qwen", label: "Qwen Code", shortLabel: "Q" },
  { id: "opencode", label: "OpenCode", shortLabel: "O" },
];

const hookSupportedAgents = new Set(["claude", "codex", "gemini", "kiro", "qwen", "deepseek"]);

type AgentLaunchOption = { flag: string; label: string; description: string; type: "toggle" };

const agentLaunchOptions: Record<string, AgentLaunchOption[]> = {
  claude: [
    { flag: "--dangerously-skip-permissions", label: "Skip permissions", description: "Bypass all permission checks", type: "toggle" },
  ],
  codex: [
    { flag: "--ask-for-approval never", label: "Skip approval", description: "Never ask for human approval", type: "toggle" },
  ],
  gemini: [
    { flag: "--yolo", label: "YOLO mode", description: "Auto-approve all tool actions", type: "toggle" },
  ],
  kiro: [
    { flag: "--trust-all-tools", label: "Trust all tools", description: "Allows the model to use any tool to run commands without asking for confirmation", type: "toggle" },
  ],
  deepseek: [
    { flag: "--approval-policy auto", label: "Full auto", description: "Run all commands without approval", type: "toggle" },
  ],
  qwen: [],
  opencode: [],
};

function AgentClisSettingsPanel({ active, bridgeAvailable, setToast }: { active: boolean; bridgeAvailable: boolean; setToast: (toast: Toast) => void }) {
  const [installedClis, setInstalledClis] = useState<AgentCli[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("claude");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const listClis = getBridge().agents?.listClis;
    if (!listClis) return;
    listClis()
      .then((items) => { if (!cancelled) setInstalledClis(items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active]);

  function refresh() {
    const listClis = getBridge().agents?.listClis;
    if (!listClis) return;
    listClis().then(setInstalledClis).catch(() => {});
  }

  const installedMap = useMemo(() => {
    const map = new Map<string, AgentCli>();
    if (installedClis) for (const cli of installedClis) map.set(cli.id, cli);
    return map;
  }, [installedClis]);

  const selectedDef = allAgentCliDefinitions.find((d) => d.id === selectedId) ?? allAgentCliDefinitions[0]!;
  const selectedInstalled = installedMap.get(selectedId) ?? null;

  return (
    <div className="agent-clis-layout">
      <div className="agent-clis-list">
        {allAgentCliDefinitions.map((def) => {
          const installed = installedMap.has(def.id);
          return (
            <button className={cx("agent-clis-list-item", selectedId === def.id && "is-selected")} key={def.id} type="button" onClick={() => setSelectedId(def.id)}>
              <AgentCliIcon agent={def as AgentCli} />
              <span>{def.label}</span>
              {installed ? <span className="agent-clis-badge is-installed">Installed</span> : <span className="agent-clis-badge is-not-installed">Not installed</span>}
            </button>
          );
        })}
      </div>
      <div className="agent-clis-detail">
        {selectedInstalled ? (
          <AgentCliDetailInstalled agent={selectedInstalled} options={agentLaunchOptions[selectedId] ?? []} />
        ) : (
          <AgentCliDetailNotInstalled def={selectedDef} bridgeAvailable={bridgeAvailable} onInstalled={refresh} setToast={setToast} />
        )}
      </div>
    </div>
  );
}

function getAgentLaunchFlags(agentId: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(`sharkbay:agent-launch-flags:${agentId}`) ?? "[]");
    return Array.isArray(value) ? value.filter((flag): flag is string => typeof flag === "string" && flag.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function setAgentLaunchFlags(agentId: string, flags: string[]) {
  localStorage.setItem(`sharkbay:agent-launch-flags:${agentId}`, JSON.stringify(flags));
}

function getAgentHooksEnabled(agentId: string): boolean {
  return localStorage.getItem(`sharkbay:agent-hooks-enabled:${agentId}`) === "true";
}

function setAgentHooksEnabled(agentId: string, enabled: boolean) {
  localStorage.setItem(`sharkbay:agent-hooks-enabled:${agentId}`, String(enabled));
  window.sharkBay?.agents?.setHooksEnabled?.({ agentId, enabled });
}

function AgentCliDetailInstalled({ agent, options }: { agent: AgentCli; options: AgentLaunchOption[] }) {
  const [enabledFlags, setEnabledFlags] = useState<string[]>(() => getAgentLaunchFlags(agent.id));
  const [hooksEnabled, setHooksEnabled] = useState<boolean>(() => getAgentHooksEnabled(agent.id));

  useEffect(() => { setEnabledFlags(getAgentLaunchFlags(agent.id)); setHooksEnabled(getAgentHooksEnabled(agent.id)); }, [agent.id]);

  function toggleFlag(flag: string) {
    setEnabledFlags((current) => {
      const next = current.includes(flag) ? current.filter((f) => f !== flag) : [...current, flag];
      setAgentLaunchFlags(agent.id, next);
      return next;
    });
  }

  function toggleHooks() {
    const next = !hooksEnabled;
    setHooksEnabled(next);
    setAgentHooksEnabled(agent.id, next);
  }

  return (
    <>
      <div className="agent-clis-detail-header">
        <AgentCliIcon agent={agent} />
        <div>
          <h4>{agent.label}</h4>
          <small>{agent.executablePath}</small>
        </div>
      </div>
      {options.length ? (
        <div className="agent-clis-options">
          <div className="agent-clis-options-title">Launch options</div>
          {options.map((opt) => (
            <label className="agent-clis-option-row" key={opt.flag}>
              <input type="checkbox" checked={enabledFlags.includes(opt.flag)} onChange={() => toggleFlag(opt.flag)} />
              <div className="agent-clis-option-info">
                <span className="agent-clis-option-label">{opt.label}</span>
                <small>{opt.description}</small>
              </div>
              <code className="agent-clis-option-flag">{opt.flag}</code>
            </label>
          ))}
        </div>
      ) : (
        <div className="form-note">No configurable launch options for this agent.</div>
      )}
      <div className="agent-clis-options">
        <div className="agent-clis-options-title">Status hooks</div>
        <label className="agent-clis-option-row">
          <input type="checkbox" checked={hooksEnabled} onChange={toggleHooks} disabled={!hookSupportedAgents.has(agent.id)} />
          <div className="agent-clis-option-info">
            <span className="agent-clis-option-label">Enable status hooks</span>
            <small>{hookSupportedAgents.has(agent.id) ? "More accurate and timely status updates via agent hook integration" : "Not supported by this agent"}</small>
          </div>
        </label>
      </div>
      <AgentCliUsageSection agentId={agent.id} />
    </>
  );
}

type UsageRange = "7" | "30" | "all";

function AgentCliUsageSection({ agentId }: { agentId: string }) {
  const [range, setRange] = useState<UsageRange>("30");
  const [report, setReport] = useState<UsageReportResultView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const filter: { agentId: string; startDate?: string } = { agentId };
    if (range !== "all") {
      filter.startDate = new Date(Date.now() - Number(range) * 86400000).toISOString();
    }
    window.sharkBay?.usage?.getReport?.(filter)?.then((r) => { if (!cancelled) setReport(r); });
    return () => { cancelled = true; };
  }, [agentId, range]);

  const isCredits = agentId === "kiro";
  const hasData = report && (usageTotalInput(report.totals) > 0 || report.totals.outputTokens > 0 || (report.totals.costUsd ?? 0) > 0);

  return (
    <div className="agent-clis-usage">
      <div className="agent-clis-usage-header">
        <span className="agent-clis-options-title">Usage</span>
        <div className="agent-clis-usage-range">
          {(["7", "30", "all"] as UsageRange[]).map((r) => (
            <button key={r} className={cx("agent-clis-usage-range-btn", r === range && "is-active")} type="button" onClick={() => setRange(r)}>
              {r === "all" ? "All" : `${r}d`}
            </button>
          ))}
        </div>
      </div>
      {!hasData ? (
        <div className="form-note">No usage data yet.</div>
      ) : (
        <>
          <div className="agent-clis-usage-summary">
            {isCredits ? (
              <span className="agent-clis-usage-stat"><small>Credits</small>{(report!.totals.costUsd ?? 0).toFixed(2)}</span>
            ) : (
              <>
                <span className="agent-clis-usage-stat"><small>Fresh input</small>{fmtTokens(report!.totals.inputTokens)}</span>
                <span className="agent-clis-usage-stat"><small>Output</small>{fmtTokens(report!.totals.outputTokens)}</span>
                {report!.totals.cacheCreationTokens > 0 && <span className="agent-clis-usage-stat"><small>Cache write</small>{fmtTokens(report!.totals.cacheCreationTokens)}</span>}
                {report!.totals.cacheReadTokens > 0 && <span className="agent-clis-usage-stat"><small>Cache read</small>{fmtTokens(report!.totals.cacheReadTokens)}</span>}
                <span className="agent-clis-usage-stat"><small>Total input</small>{fmtTokens(usageTotalInput(report!.totals))}</span>
              </>
            )}
          </div>
          <UsageBarChart byDay={report!.byDay} rangeDays={range === "all" ? null : Number(range)} isCredits={isCredits} />
          <UsageProjectBreakdown rows={report!.byProject} isCredits={isCredits} />
          <UsageDailyBreakdown rows={report!.byDay} isCredits={isCredits} />
        </>
      )}
    </div>
  );
}

type UsageTokenTotals = Pick<UsageGroupRowView, "inputTokens" | "outputTokens" | "cacheCreationTokens" | "cacheReadTokens" | "totalInputTokens">;

function emptyUsageGroupRow(key: string): UsageGroupRowView {
  return {
    key,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalInputTokens: 0,
    costUsd: null,
  };
}

function usageTotalInput(row: UsageTokenTotals): number {
  return row.totalInputTokens ?? row.inputTokens + row.cacheCreationTokens + row.cacheReadTokens;
}

function usageTotalTokens(row: UsageTokenTotals): number {
  return usageTotalInput(row) + row.outputTokens;
}

function UsageBarChart({ byDay, rangeDays, isCredits }: { byDay: UsageGroupRowView[]; rangeDays: number | null; isCredits: boolean }) {
  const days = useMemo(() => {
    if (byDay.length === 0) return [];
    const earliest = new Date(byDay[byDay.length - 1]!.key).getTime();
    const now = new Date();
    const maxSpan = rangeDays != null ? rangeDays : Infinity;
    const spanStart = Math.max(earliest, now.getTime() - (maxSpan - 1) * 86400000);
    const count = Math.ceil((now.getTime() - spanStart) / 86400000) + 1;
    const map = new Map(byDay.map((d) => [d.key, d]));
    const result: UsageGroupRowView[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const key = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      result.push(map.get(key) ?? emptyUsageGroupRow(key));
    }
    return result;
  }, [byDay, rangeDays]);

  const maxVal = Math.max(...days.map((d) => isCredits ? (d.costUsd ?? 0) : usageTotalTokens(d)), 1);

  return (
    <div className="agent-clis-usage-chart">
      {days.map((day, i) => {
        const pct = isCredits
          ? ((day.costUsd ?? 0) / maxVal) * 100
          : (usageTotalTokens(day) / maxVal) * 100;
        const showLabel = days.length <= 10 || i === 0 || i === days.length - 1;
        return (
          <div key={day.key} className="agent-clis-usage-bar-col">
            <div className="agent-clis-usage-bar" style={{ height: `${Math.max(pct, 1)}%` }} title={`${day.key}: ${isCredits ? `${(day.costUsd ?? 0).toFixed(2)} credits` : `${usageTotalTokens(day).toLocaleString()} tokens`}`} />
            <span className="agent-clis-usage-bar-label">{showLabel ? day.key.slice(5) : "\u00A0"}</span>
          </div>
        );
      })}
    </div>
  );
}

function UsageProjectBreakdown({ rows, isCredits }: { rows: UsageGroupRowView[]; isCredits: boolean }) {
  if (rows.length === 0) return null;
  const showCacheCreation = rows.some((row) => row.cacheCreationTokens > 0);
  return (
    <div className="agent-clis-usage-breakdown">
      <small className="agent-clis-usage-breakdown-title">By project</small>
      <div className="agent-clis-usage-table-wrap">
        <table className="agent-clis-usage-table">
          <thead>
            <tr>
              <th>Project</th>
              {isCredits ? <th>Credits</th> : <><th>Fresh</th><th>Out</th>{showCacheCreation && <th>Write</th>}<th>Read</th><th>Total</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={row.key}>
                <td className="agent-clis-usage-table-label" title={row.key}>{row.key.split("/").pop()}</td>
                {isCredits ? (
                  <td className="agent-clis-usage-table-value">{(row.costUsd ?? 0).toFixed(2)}</td>
                ) : (
                  <>
                    <td className="agent-clis-usage-table-value">{fmtTokens(row.inputTokens)}</td>
                    <td className="agent-clis-usage-table-value">{fmtTokens(row.outputTokens)}</td>
                    {showCacheCreation && <td className={cx("agent-clis-usage-table-value", row.cacheCreationTokens === 0 && "is-dim")}>{row.cacheCreationTokens > 0 ? fmtTokens(row.cacheCreationTokens) : "—"}</td>}
                    <td className={cx("agent-clis-usage-table-value", row.cacheReadTokens === 0 && "is-dim")}>{row.cacheReadTokens > 0 ? fmtTokens(row.cacheReadTokens) : "—"}</td>
                    <td className="agent-clis-usage-table-value">{fmtTokens(usageTotalInput(row))}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsageDailyBreakdown({ rows, isCredits }: { rows: UsageGroupRowView[]; isCredits: boolean }) {
  if (rows.length === 0) return null;
  const showCacheCreation = rows.some((row) => row.cacheCreationTokens > 0);
  return (
    <div className="agent-clis-usage-breakdown">
      <small className="agent-clis-usage-breakdown-title">By day</small>
      <div className="agent-clis-usage-table-wrap">
        <table className="agent-clis-usage-table">
          <thead>
            <tr>
              <th>Date</th>
              {isCredits ? <th>Credits</th> : <><th>Fresh</th><th>Out</th>{showCacheCreation && <th>Write</th>}<th>Read</th><th>Total</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row) => (
              <tr key={row.key}>
                <td className="agent-clis-usage-table-label">{row.key}</td>
                {isCredits ? (
                  <td className="agent-clis-usage-table-value">{(row.costUsd ?? 0).toFixed(2)}</td>
                ) : (
                  <>
                    <td className="agent-clis-usage-table-value">{fmtTokens(row.inputTokens)}</td>
                    <td className="agent-clis-usage-table-value">{fmtTokens(row.outputTokens)}</td>
                    {showCacheCreation && <td className={cx("agent-clis-usage-table-value", row.cacheCreationTokens === 0 && "is-dim")}>{row.cacheCreationTokens > 0 ? fmtTokens(row.cacheCreationTokens) : "—"}</td>}
                    <td className={cx("agent-clis-usage-table-value", row.cacheReadTokens === 0 && "is-dim")}>{row.cacheReadTokens > 0 ? fmtTokens(row.cacheReadTokens) : "—"}</td>
                    <td className="agent-clis-usage-table-value">{fmtTokens(usageTotalInput(row))}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function AgentCliDetailNotInstalled({ def, bridgeAvailable, onInstalled, setToast }: { def: AgentCliDefinition; bridgeAvailable: boolean; onInstalled: () => void; setToast: (toast: Toast) => void }) {
  const [busy, setBusy] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const logsRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logLines]);

  async function runInstall() {
    const listRecipes = getBridge().agents?.listInstallRecipes;
    const installTool = getBridge().agents?.installTool;
    const subscribe = getBridge().agents?.onInstallLog;
    if (!listRecipes || !installTool) { setToast({ tone: "error", message: "Install API not available." }); return; }
    setBusy(true);
    setLogLines([]);
    try {
      const recipes = await listRecipes({ targetId: "local" });
      const recipe = recipes.find((r) => r.toolId === def.id);
      if (!recipe) { setToast({ tone: "error", message: `No install recipe found for ${def.label}.` }); setBusy(false); return; }
      const unsub = subscribe?.((event) => { if (event.recipeId === recipe.id) setLogLines((c) => [...c, formatInstallLogLine(event)]); });
      const result = await installTool({ targetId: "local", recipeId: recipe.id });
      unsub?.();
      if (result.ok) { setToast({ tone: "success", message: `Installed ${def.label}` }); onInstalled(); }
      else { setToast({ tone: "error", message: `Install failed: ${result.logs.slice(-1)[0] ?? "unknown error"}` }); }
    } catch (error) { setToast({ tone: "error", message: asMessage(error) }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="agent-clis-detail-header">
        <AgentCliIcon agent={def as AgentCli} />
        <div>
          <h4>{def.label}</h4>
          <small>Not installed</small>
        </div>
      </div>
      <div className="agent-clis-install-prompt">
        <p>This agent CLI is not detected on your machine.</p>
        <button className="button compact" disabled={!bridgeAvailable || busy} type="button" onClick={runInstall}>{busy ? "Installing…" : `Install ${def.label}`}</button>
      </div>
      {logLines.length > 0 && <pre className="agent-clis-install-logs" ref={logsRef}>{logLines.join("\n")}</pre>}
    </>
  );
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
                disabled={busyId === plugin.id || plugin.source === "bundled" && plugin.id === "xyz.sharkbay.core"}
                title={plugin.source === "bundled" && plugin.id === "xyz.sharkbay.core" ? "Core plugin cannot be disabled" : undefined}
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
    <div className="settings-theme-grid" role="radiogroup" aria-label="Appearance theme">
      {appearanceThemes.map((theme) => {
        const selected = theme.id === appearanceTheme;
        return (
          <button aria-checked={selected} className={cx("settings-theme-card", selected && "is-selected")} disabled={Boolean(savingTheme)} key={theme.id} role="radio" type="button" onClick={() => void chooseTheme(theme.id)}>
            <ThemePreviewSvg theme={theme.id} />
            <span className="settings-theme-label">{savingTheme === theme.id ? "Saving…" : theme.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ThemePreviewSvg({ theme }: { theme: AppearanceTheme }) {
  const colors = {
    day: { bg: "#f4f1eb", panel: "#fffdfa", terminal: "#f7f1e4", border: "#dedad1", text: "#263235", textMuted: "#a09a90" },
    night: { bg: "#101719", panel: "#1a2628", terminal: "#101719", border: "#32474b", text: "#d9e5df", textMuted: "#4a5c5f" },
    morning: { bg: "#f4f1eb", panel: "#fffdfa", terminal: "#172022", border: "#dedad1", text: "#263235", textMuted: "#4a5c5f" },
  }[theme];
  return (
    <svg className="settings-theme-preview" viewBox="0 0 120 80" aria-hidden="true">
      <rect width="120" height="80" rx="4" fill={colors.bg} />
      <rect x="4" y="8" width="28" height="68" rx="3" fill={colors.panel} stroke={colors.border} strokeWidth="0.5" />
      <rect x="7" y="12" width="22" height="8" rx="1.5" fill={colors.border} />
      <rect x="7" y="23" width="22" height="8" rx="1.5" fill={colors.border} />
      <rect x="7" y="34" width="22" height="8" rx="1.5" fill={colors.border} />
      <rect x="35" y="8" width="50" height="68" rx="3" fill={colors.terminal} stroke={colors.border} strokeWidth="0.5" />
      <rect x="39" y="14" width="18" height="2" rx="1" fill={colors.textMuted} />
      <rect x="39" y="19" width="24" height="2" rx="1" fill={colors.textMuted} />
      <rect x="39" y="24" width="14" height="2" rx="1" fill={colors.textMuted} />
      <rect x="39" y="29" width="20" height="2" rx="1" fill={colors.textMuted} />
      <rect x="88" y="8" width="28" height="68" rx="3" fill={colors.panel} stroke={colors.border} strokeWidth="0.5" />
      <rect x="91" y="12" width="22" height="3" rx="1" fill={colors.border} />
      <rect x="91" y="18" width="16" height="2" rx="1" fill={colors.textMuted} />
      <rect x="91" y="23" width="19" height="2" rx="1" fill={colors.textMuted} />
      <rect x="91" y="28" width="12" height="2" rx="1" fill={colors.textMuted} />
      <rect x="91" y="33" width="17" height="2" rx="1" fill={colors.textMuted} />
      <rect x="91" y="38" width="14" height="2" rx="1" fill={colors.textMuted} />
    </svg>
  );
}

function ProjectWorkflowPanel({ configuredProjects, onRemoveProject, setToast }: {
  configuredProjects: string[]; 
  onRemoveProject: (path: string) => Promise<void>; setToast: (toast: Toast) => void;
}) {
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const projectEntries = [
    ...configuredProjects.map((value) => ({ value, label: value, machine: "Local" })),
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



function SettingsStatusPanel({ candidates, scanErrors }: { candidates: ProjectCandidate[]; scanErrors: string[] }) {
  return (
    <section className="workflow-panel settings-status-panel">
      <div className="settings-facts-grid">
        <Fact label="Projects" value={String(candidates.length)} />
        <Fact label="Issues" value={String(scanErrors.length)} tone={scanErrors.length ? "warn" : undefined} />
      </div>
      {scanErrors.length ? (
        <section className="subpanel settings-list-panel"><h4>Scan issues</h4><div className="settings-list">{scanErrors.map((error) => (<div className="settings-list-row" key={error}><span className="truncate">{error}</span></div>))}</div></section>
      ) : null}
      {!scanErrors.length ? (<div className="empty-state compact-title-row"><strong>No issues</strong><span>Settings status is clear.</span></div>) : null}
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

function SettingsGearIcon() {
  return <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>;
}

function SunIcon() {
  return <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>;
}

function PuzzleIcon() {
  return <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 2c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.969a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" /></svg>;
}

function ActivityIcon() {
  return <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>;
}

function ServerIcon() {
  return <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></svg>;
}

function TerminalIcon() {
  return <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>;
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
  if (agent.id === "deepseek") return <CodeWhaleIcon />;
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

function CodeWhaleIcon() {
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

function CachedAvatar({ url }: { url: string }) {
  const cacheKey = `sharkbay:avatar:${url}`;
  const [src, setSrc] = useState(() => localStorage.getItem(cacheKey) || url);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        localStorage.setItem(cacheKey, dataUrl);
        setSrc(dataUrl);
      } catch { /* cross-origin or quota errors — ignore */ }
    };
    img.src = url;
  }, [url, cacheKey]);
  return <img alt="" src={src} />;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{body}</span></div>;
}
