import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import defaultProjectIconUrl from "./assets/shark-fin.png";
import type {
  AgentCli,
  AgentProjectStatusEvent,
  AppConfig,
  AppearanceTheme,
  BrowserBounds,
  BrowserSession,
  BrowserUpdateEvent,
  ProjectCandidate,
  ProjectDetail,
  ProjectFileTreeItem,
  ProjectSummary,
  RootRecord,
  ScanResult,
  SharkBayBridge,
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
type DetailTab = "git" | "files";
type SettingsSection = "project-roots" | "project-status";

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

type TerminalTab = TerminalShellTab | BrowserTab;
type ActiveTerminalTabKind = TerminalTab["kind"] | null;

type TerminalSpace = {
  projectId: string;
  projectName: string;
  path: string;
  tabs: TerminalTab[];
  activeId: string | null;
  serviceUrl: string | null;
};

type TerminalPaneHandle = {
  openFileInEditor: (projectPath: string, projectName: string, relativePath: string) => Promise<void>;
  openGitDiff: (projectPath: string, projectName: string, relativePath: string) => Promise<void>;
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
const detailTabs: Array<{ id: DetailTab; label: string }> = [
  { id: "git", label: "Git" },
  { id: "files", label: "Files" },
];
const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "project-roots", label: "Project roots" },
  { id: "project-status", label: "Status" },
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

function suppressToast(_toast: Toast): void {}

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

async function scanProjects(): Promise<ScanResult> {
  const handler = getBridge().projects?.scan;
  if (!handler) throw new Error("Project scanning is not exposed by the preload API.");
  return normalizeScan(await handler());
}

async function getProjectDetail(candidate: ProjectCandidate): Promise<ProjectDetail> {
  const handler = getBridge().projects?.getDetail;
  if (!handler) throw new Error("Project detail is not exposed by the preload API.");
  return handler({ repoPath: candidate.path });
}

async function listProjectFiles(project: ProjectCandidate | ProjectDetail, directoryPath?: string) {
  const handler = getBridge().projects?.listFiles;
  if (!handler) throw new Error("Project files are not exposed by the preload API.");
  return handler({ repoPath: project.path, directoryPath });
}

async function createTerminal(
  cwd: string,
  title?: string,
  options: Pick<TerminalCreateInput, "initialCommand" | "service"> = {},
): Promise<TerminalSession> {
  const handler = getBridge().terminal?.create;
  if (!handler) throw new Error("Terminal sessions are not exposed by the preload API.");
  return handler({ cwd, title, ...options });
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

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [roots, setRoots] = useState<RootRecord[]>([]);
  const [candidates, setCandidates] = useState<ProjectCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const setToast = suppressToast;
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
            />
          </div>
          {view === "settings" ? (
            <div className="view-surface settings-surface">
              <SettingsView
                appearanceTheme={appearanceTheme}
                roots={roots}
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
                onThemeChange={async (theme) => {
                  const config = await updateAppearanceTheme(theme);
                  setAppearanceTheme(normalizeAppearanceTheme(config.appearanceTheme));
                }}
              />
            </div>
          ) : null}
        </div>
      </main>
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
  scanErrors,
  selectedCandidate,
  setSelectedId,
  setToast,
  onRefresh,
}: {
  appearanceTheme: AppearanceTheme;
  bridgeAvailable: boolean;
  detail: ProjectDetail | null;
  filteredCandidates: ProjectCandidate[];
  isVisible: boolean;
  loading: boolean;
  scanErrors: string[];
  selectedCandidate: ProjectCandidate | null;
  setSelectedId: (value: string) => void;
  setToast: (toast: Toast) => void;
  onRefresh: () => Promise<void>;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const terminalPaneRef = useRef<TerminalPaneHandle | null>(null);
  const [runningServiceProjectIds, setRunningServiceProjectIds] = useState<Set<string>>(() => new Set());
  const [terminalActivityByProjectId, setTerminalActivityByProjectId] = useState<Record<string, ProjectTerminalActivityState>>({});
  const [agentClis, setAgentClis] = useState<AgentCli[]>([]);
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
    void listClis()
      .then((clis) => { if (!cancelled) setAgentClis(clis); })
      .catch((error) => { if (!cancelled) setToast({ tone: "error", message: asMessage(error) }); });
    return () => { cancelled = true; };
  }, [bridgeAvailable, setToast]);

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
        {scanErrors.length ? (
          <div className="inline-errors">
            {scanErrors.map((error) => (<div key={error}>{error}</div>))}
          </div>
        ) : null}
        <div className="project-sections">
          <ProjectList
            agentStatusByProjectPath={agentStatusByProjectPath}
            candidates={filteredCandidates}
            runningServiceProjectIds={runningServiceProjectIds}
            terminalActivityByProjectId={terminalActivityByProjectId}
            selectedId={selectedCandidate?.id ?? null}
            onSelect={setSelectedId}
          />
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
          bridgeAvailable={bridgeAvailable}
          isVisible={isVisible}
          setToast={setToast}
          onActiveTabKindChange={setActiveTerminalTabKind}
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
              terminalPaneRef.current?.openFileInEditor(selectedCandidate.path, selectedCandidate.name, relativePath) ?? Promise.resolve()
            }
            onOpenGitDiff={(relativePath) =>
              terminalPaneRef.current?.openGitDiff(selectedCandidate.path, selectedCandidate.name, relativePath) ?? Promise.resolve()
            }
          />
        ) : (
          <EmptyState title="No project selected" body="Open Settings to add a scan root, then scan for projects." />
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
  isVisible: boolean;
  setToast: (toast: Toast) => void;
  onActiveTabKindChange: (kind: ActiveTerminalTabKind) => void;
  onRunningServiceProjectIdsChange: (projectIds: Set<string>) => void;
  onTerminalActivityProjectStatesChange: (states: Record<string, ProjectTerminalActivityState>) => void;
}>(function TerminalPane({ appearanceTheme, agentClis, bridgeAvailable, candidate, isVisible, setToast, onActiveTabKindChange, onRunningServiceProjectIdsChange, onTerminalActivityProjectStatesChange }, ref) {
  const [spaces, setSpaces] = useState<Record<string, TerminalSpace>>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const spacesRef = useRef<Record<string, TerminalSpace>>({});
  const activeProjectIdRef = useRef<string | null>(null);
  const creatingProjects = useRef(new Set<string>());
  const quietTimers = useRef(new Map<string, ReturnType<typeof window.setTimeout>>());
  const selectedSpace = candidate?.id ? spaces[candidate.id] ?? null : null;
  const canCreate = bridgeAvailable && Boolean(candidate?.path);
  const services = candidate?.services ?? [];

  useEffect(() => { spacesRef.current = spaces; }, [spaces]);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => () => { for (const timer of quietTimers.current.values()) window.clearTimeout(timer); quietTimers.current.clear(); }, []);

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
    if (!candidate?.path || !bridgeAvailable) { if (!candidate) setActiveProjectId(null); return; }
    setActiveProjectId(candidate.id);
    setSpaces((current) => {
      if (current[candidate.id]) return current;
      return { ...current, [candidate.id]: { projectId: candidate.id, projectName: candidate.name, path: candidate.path, tabs: [], activeId: null, serviceUrl: null } };
    });
    if (!isVisible) return;
    const existing = spacesRef.current[candidate.id];
    if (existing?.tabs.length) return;
    if (creatingProjects.current.has(candidate.id)) return;
    creatingProjects.current.add(candidate.id);
    void openProjectTab(candidate.id, candidate.path, candidate.name, true).finally(() => { creatingProjects.current.delete(candidate.id); });
  }, [bridgeAvailable, candidate?.id, candidate?.path, isVisible]);

  async function openCurrentProjectTab() {
    if (!candidate?.path) return;
    await openProjectTab(candidate.id, candidate.path, candidate.name);
  }

  async function openAgentProjectTab(agent: AgentCli) {
    if (!candidate?.path) return;
    await openProjectTab(candidate.id, candidate.path, candidate.name, false, { initialCommand: agent.command });
  }

  async function openBrowserProjectTab() {
    if (!candidate?.path) return;
    const initialUrl = selectedSpace?.tabs.some((tab) => isRunningServiceTab(tab)) ? selectedSpace.serviceUrl ?? "about:blank" : "about:blank";
    await openBrowserTab(candidate.id, candidate.path, candidate.name, initialUrl);
  }

  useImperativeHandle(ref, () => ({
    openFileInEditor: async (projectPath, projectName, relativePath) => {
      await openProjectTab(projectPath, projectPath, projectName, false, { initialCommand: editorCommandFor(relativePath) });
    },
    openGitDiff: async (projectPath, projectName, relativePath) => {
      await openProjectTab(projectPath, projectPath, projectName, false, { initialCommand: gitDiffCommandFor(relativePath) });
    },
  }));

  async function openProjectTab(projectId: string, cwd: string, projectName: string, quiet = false, options: Pick<TerminalCreateInput, "initialCommand" | "service"> = {}) {
    try {
      const session = await createTerminal(cwd, projectName, options);
      const terminal = createXTerm(session.id, appearanceTheme, setToast, recordTerminalInputActivity);
      const tab: TerminalTab = { kind: "terminal", session, terminal: terminal.instance, fitAddon: terminal.fitAddon, disposables: terminal.disposables, activityState: "idle", outputBurstStartedAt: null };
      onActiveTabKindChange("terminal");
      setSpaces((current) => {
        const existing = current[projectId] ?? { projectId, projectName, path: cwd, tabs: [], activeId: null, serviceUrl: null };
        return { ...current, [projectId]: { ...existing, projectName, path: cwd, tabs: [...existing.tabs, tab], activeId: session.id } };
      });
      setActiveProjectId(projectId);
    } catch (error) { if (!quiet) setToast({ tone: "error", message: asMessage(error) }); }
  }

  async function openBrowserTab(projectId: string, cwd: string, projectName: string, initialUrl: string) {
    try {
      const browser = await createBrowser(initialUrl);
      const tab: TerminalTab = { kind: "browser", browser, addressValue: browser.url === "about:blank" ? "" : browser.url };
      onActiveTabKindChange("browser");
      setSpaces((current) => {
        const existing = current[projectId] ?? { projectId, projectName, path: cwd, tabs: [], activeId: null, serviceUrl: null };
        return { ...current, [projectId]: { ...existing, projectName, path: cwd, tabs: [...existing.tabs, tab], activeId: browser.id } };
      });
      setActiveProjectId(projectId);
    } catch (error) {
      setToast({ tone: "error", message: asMessage(error) });
    }
  }

  async function toggleService(service: NonNullable<ProjectCandidate["services"]>[number]) {
    if (!candidate?.path) return;
    const existing = selectedSpace?.tabs.find((tab): tab is TerminalShellTab => tab.kind === "terminal" && tab.session.service?.id === service.id && tab.session.status === "running");
    if (existing) { await closeTab(existing.session.id); return; }
    await openProjectTab(candidate.id, service.cwd, candidate.name, false, { initialCommand: service.command, service: { id: service.id, label: service.label, command: service.command } });
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

  const terminalHeading = candidate?.name ?? "Terminal";

  return (
    <div className="terminal-layout">
      <div className="terminal-header">
        <div>
          <h3>{terminalHeading}</h3>
          <div className="path-line">{selectedSpace?.path ?? candidate?.path ?? "Select a project"}</div>
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
                          ) : (
                            <GlobeIcon />
                          )}
                          <span className="truncate">{tabTitle}</span>
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
                return tab.kind === "terminal" ? (
                  <XTermSurface active={active} key={tab.session.id} tab={tab} onResize={(cols, rows) => void resizeTerminal(tab.session.id, cols, rows).catch((error) => setToast({ tone: "error", message: asMessage(error) }))} />
                ) : (
                  <BrowserSurface active={active} key={tab.browser.id} setToast={setToast} tab={tab} onAddressChange={(value) => updateBrowserAddress(tab.browser.id, value)} onBrowserUpdate={(browser) => updateBrowserSession(browser)} />
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
            </div>
            <div className="xterm-surface-stack"><div className="xterm-empty-state"><EmptyState title="No terminal open" body={candidate ? "Open a tab for the selected project." : "Select a project to start a shell."} /></div></div>
          </div>
        ) : null}
      </div>
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
  useEffect(() => { if (!hostRef.current || openedRef.current) return; tab.terminal.open(hostRef.current); openedRef.current = true; }, [tab]);
  useEffect(() => {
    if (!active || !openedRef.current) return;
    const fitAndResize = () => {
      const dimensions = tab.fitAddon.proposeDimensions();
      if (!dimensions || !validTerminalResizeDimensions(dimensions.cols, dimensions.rows)) return;
      tab.fitAddon.fit();
      onResize(Math.floor(dimensions.cols), Math.floor(dimensions.rows));
    };
    const frame = window.requestAnimationFrame(() => { fitAndResize(); tab.terminal.focus(); });
    const observer = new ResizeObserver(() => fitAndResize());
    if (hostRef.current) observer.observe(hostRef.current);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, [active, onResize, tab]);
  return <div aria-hidden={!active} className={cx("xterm-surface", active && "is-active")} ref={hostRef} />;
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
  return tab.kind === "terminal" ? tab.session.id : tab.browser.id;
}

function titleForTab(tab: TerminalTab): string {
  return tab.kind === "terminal" ? tab.session.title : tab.browser.title || "Browser";
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

function ProjectList({ agentStatusByProjectPath, candidates, runningServiceProjectIds, terminalActivityByProjectId, selectedId, onSelect }: {
  agentStatusByProjectPath: AgentStatusByProjectPath;
  candidates: ProjectCandidate[];
  runningServiceProjectIds: Set<string>;
  terminalActivityByProjectId: Record<string, ProjectTerminalActivityState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!candidates.length) return null;
  return (
    <section className="project-section">
      <div className="project-list" aria-label="Projects">
        {candidates.map((candidate) => {
          const hasRunningService = runningServiceProjectIds.has(candidate.id);
          const terminalActivity = terminalActivityForCandidate(candidate, terminalActivityByProjectId);
          const hasProjectStatus = Boolean(terminalActivity) || candidate.dirtyWorktree === true;
          const subtitle = agentStatusByProjectPath[candidate.path] ?? candidate.path;
          return (
            <button className={cx("project-row", selectedId === candidate.id && "is-selected")} key={candidate.id} onClick={() => onSelect(candidate.id)}>
              <ProjectIcon name={candidate.name} sources={candidate.iconSources ?? []} />
              <span className="project-row-main">
                <span className="cell-title">
                  {hasRunningService ? <span className="project-service-dot" aria-label="Service running" /> : null}
                  <span className="cell-title-text truncate">{candidate.name}</span>
                </span>
                <span className="cell-subtitle truncate" title={subtitle}>{subtitle}</span>
              </span>
              {hasProjectStatus ? (
                <span className="project-row-status">
                  {terminalActivity ? (
                    <span className={cx("terminal-activity-pill", terminalActivity === "working" ? "is-working" : "is-idle")}>{terminalActivity}</span>
                  ) : null}
                  {candidate.dirtyWorktree === true ? <span className="worktree-pill is-dirty">dirty</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
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

function ProjectDetailPane({ detail, candidate, setToast, onRefresh, onOpenFileInEditor, onOpenGitDiff }: {
  detail: ProjectDetail | null;
  candidate: ProjectCandidate;
  setToast: (toast: Toast) => void;
  onRefresh: () => Promise<void>;
  onOpenFileInEditor: (relativePath: string) => Promise<void>;
  onOpenGitDiff: (relativePath: string) => Promise<void>;
}) {
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("git");

  useEffect(() => { setActiveDetailTab("git"); }, [candidate.id]);

  function handleDetailTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: DetailTab) {
    const currentIndex = detailTabs.findIndex((item) => item.id === tab);
    const lastIndex = detailTabs.length - 1;
    let nextTab: DetailTab | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextTab = detailTabs[currentIndex === lastIndex ? 0 : currentIndex + 1]?.id ?? "git";
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextTab = detailTabs[currentIndex <= 0 ? lastIndex : currentIndex - 1]?.id ?? "git";
    if (!nextTab) return;
    event.preventDefault();
    setActiveDetailTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`project-detail-tab-${nextTab}`)?.focus());
  }

  return (
    <div className="detail-layout">
      <div className="detail-tab-cards" role="tablist" aria-label="Project detail sections">
        {detailTabs.map((tab) => (
          <button aria-controls={`project-detail-tabpanel-${tab.id}`} aria-selected={activeDetailTab === tab.id} className={cx("detail-tab-card", activeDetailTab === tab.id && "is-active")} id={`project-detail-tab-${tab.id}`} key={tab.id} role="tab" tabIndex={activeDetailTab === tab.id ? 0 : -1} type="button" onKeyDown={(event) => handleDetailTabKeyDown(event, tab.id)} onClick={() => setActiveDetailTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      <div aria-labelledby="project-detail-tab-git" className="detail-tab-panel" hidden={activeDetailTab !== "git"} id="project-detail-tabpanel-git" role="tabpanel">
        <GitDetailTab detail={detail} candidate={candidate} setToast={setToast} onOpenGitDiff={onOpenGitDiff} />
      </div>
      <div aria-labelledby="project-detail-tab-files" className="detail-tab-panel" hidden={activeDetailTab !== "files"} id="project-detail-tabpanel-files" role="tabpanel">
        <FilesDetailTab active={activeDetailTab === "files"} candidate={candidate} detail={detail} setToast={setToast} onOpenFileInEditor={onOpenFileInEditor} />
      </div>
    </div>
  );
}

function GitDetailTab({ detail, candidate, setToast, onOpenGitDiff }: { detail: ProjectDetail | null; candidate: ProjectCandidate; setToast: (toast: Toast) => void; onOpenGitDiff: (relativePath: string) => Promise<void> }) {
  return (
    <>
      <ProjectFactsCard detail={detail} candidate={candidate} />
      <DirtyFilesPanel detail={detail} setToast={setToast} onOpenGitDiff={onOpenGitDiff} />
      {detail?.gitHistory?.length || detail?.currentBranch ? (
        <GitHistoryItems events={detail?.gitHistory ?? []} />
      ) : (
        <EmptyState title="No git history" body="Restart SharkBay once to load Git history." />
      )}
    </>
  );
}

function ProjectFactsCard({ detail, candidate }: { detail: ProjectDetail | null; candidate: ProjectCandidate }) {
  const worktree = detail?.dirtyWorktree === null ? null : detail?.dirtyWorktree ? "Dirty" : "Clean";
  const facts = [
    { label: "Path", value: detail?.path ?? candidate.path },
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

function DirtyFilesPanel({ detail, setToast, onOpenGitDiff }: { detail: ProjectDetail | null; setToast: (toast: Toast) => void; onOpenGitDiff: (relativePath: string) => Promise<void> }) {
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
            onDoubleClick={() => void onOpenGitDiff(file.path).catch((error) => setToast({ tone: "error", message: asMessage(error) }))}
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
      {visible.map((event) => (
        <div className="decision-item" key={`${event.selector}-${event.hash}-${event.date}`}>
          <div className="decision-meta">
            {event.hash.slice(0, 7)} / {event.selector}
          </div>
          <div>{event.action}</div>
          <div className="history-time" title={formatHistoryTime(event.date)}>
            {formatRelativeTime(event.date)}
          </div>
        </div>
      ))}
      {!visible.length ? <div className="muted-row">Restart SharkBay once to load Git history.</div> : null}
    </div>
  );
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
  const activeFilesProjectPath = useRef(candidate.path);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    activeFilesProjectPath.current = candidate.path;
    setExpandedDirectories(new Set());
    setLoadingDirectories(new Set());
    setState({ loading: true, error: null, files: [] });
    void listProjectFiles(candidate).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setState({ loading: false, error: result.message, files: [] }); return; }
      setState({ loading: false, error: null, files: result.files });
    }).catch((error) => { if (!cancelled) setState({ loading: false, error: asMessage(error), files: [] }); });
    return () => { cancelled = true; };
  }, [active, candidate.id, candidate.path]);

  async function openFile(item: ProjectFileTreeItem) {
    if (item.kind !== "file" || !item.editable) return;
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
        if (activeFilesProjectPath.current !== candidate.path) return;
        if (!result.ok) throw new Error(result.message);
        setState((current) => ({ ...current, files: updateProjectFileChildren(current.files, item.path, result.files) }));
      } catch (error) {
        setToast({ tone: "error", message: asMessage(error) });
        return;
      } finally {
        if (activeFilesProjectPath.current === candidate.path) {
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
  const disabled = item.kind === "file" && !item.editable;

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
          <span className="project-file-name">{item.name}</span>
        </button>
      </div>
      {expanded ? item.children?.map((child) => (
        <ProjectFileTreeItemRow key={child.path} item={child} level={level + 1} expandedDirectories={expandedDirectories} loadingDirectories={loadingDirectories} onToggleDirectory={onToggleDirectory} onOpenFile={onOpenFile} />
      )) : null}
    </>
  );
}

function updateProjectFileChildren(items: ProjectFileTreeItem[], targetPath: string, children: ProjectFileTreeItem[]): ProjectFileTreeItem[] {
  return items.map((item) => {
    if (item.path === targetPath) return { ...item, children };
    if (item.children) return { ...item, children: updateProjectFileChildren(item.children, targetPath, children) };
    return item;
  });
}

function SettingsView({ appearanceTheme, roots, bridgeAvailable, lastScanAt, loading, candidates, scanErrors, setToast, onBack, onScan, onAdd, onRemove, onThemeChange }: {
  appearanceTheme: AppearanceTheme; roots: RootRecord[]; bridgeAvailable: boolean; lastScanAt: string | null; loading: boolean; candidates: ProjectCandidate[]; scanErrors: string[]; setToast: (toast: Toast) => void;
  onBack: () => void; onScan: () => Promise<void>; onAdd: (path: string) => Promise<void>; onRemove: (path: string) => Promise<void>; onThemeChange: (theme: AppearanceTheme) => Promise<void>;
}) {
  const unavailableRootCount = roots.filter((root) => root.unavailable || root.available === false).length;
  const [activeSection, setActiveSection] = useState<SettingsSection>("project-roots");

  return (
    <div className="settings-layout">
      <div className="detail-header settings-header">
        <button aria-label="Back to projects" className="icon-button" title="Back to projects" type="button" onClick={onBack}><ArrowLeftIcon /></button>
        <div><h3>Settings</h3><div className="path-line">Scan roots and local project access</div></div>
      </div>
      <div className="settings-shell">
        <aside className="settings-nav" aria-label="Settings sections">
          {settingsSections.map((section) => {
            const count = section.id === "project-roots" ? roots.length : unavailableRootCount + scanErrors.length;
            const meta = section.id === "project-roots" ? `${roots.length} root${roots.length === 1 ? "" : "s"}` : count ? `${count} issue${count === 1 ? "" : "s"}` : "Clear";
            return (
              <button aria-current={section.id === activeSection ? "page" : undefined} className={cx("settings-nav-item", section.id === activeSection && "is-selected")} key={section.id} type="button" onClick={() => setActiveSection(section.id)}>
                <span>{section.label}</span><small>{meta}</small>
              </button>
            );
          })}
        </aside>
        <section className="settings-content" aria-label="Settings content">
          <div className="settings-section-panel" hidden={activeSection !== "project-roots"}>
            <div className="settings-section-heading"><h4>Project roots</h4><span>{candidates.length} project{candidates.length === 1 ? "" : "s"}</span></div>
            <AppearanceSettingsPanel appearanceTheme={appearanceTheme} setToast={setToast} onThemeChange={onThemeChange} />
            <RootWorkflowPanel bridgeAvailable={bridgeAvailable} lastScanAt={lastScanAt} loading={loading} candidates={candidates} roots={roots} scanErrors={scanErrors} unavailableRootCount={unavailableRootCount} onAdd={onAdd} onRemove={onRemove} onScan={onScan} setToast={setToast} />
          </div>
          <div className="settings-section-panel" hidden={activeSection !== "project-status"}>
            <div className="settings-section-heading"><h4>Status</h4><span>{lastScanAt ? `Last scan ${formatScanTime(lastScanAt)}` : "Not scanned"}</span></div>
            <SettingsStatusPanel candidates={candidates} roots={roots} scanErrors={scanErrors} unavailableRootCount={unavailableRootCount} />
          </div>
        </section>
      </div>
    </div>
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
