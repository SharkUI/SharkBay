export type AppearanceTheme = "day" | "night" | "morning";

export type RootRecord = {
  path: string;
  inputPath?: string;
  available?: boolean;
  unavailable?: boolean;
  error?: string | null;
};

export type AppConfig = {
  schemaVersion?: number;
  configuredRoots: string[];
  configuredProjects?: string[];
  projectAliases?: Record<string, string>;
  appearanceTheme?: AppearanceTheme;
  statusChangeNotificationsEnabled?: boolean;
  agentStatusCompletionSoundEnabled?: boolean;
  agentStatusApprovalSoundEnabled?: boolean;
  terminalColorScheme?: string;
  terminalFontFamily?: string;
  terminalFontSize?: number;
  terminalLineHeight?: number;
  updatedAt?: string;
};

export type CloneProjectInput = {
  url?: string;
  parentPath?: string;
};

export type CloneProjectResult =
  | { cancelled: true }
  | { cancelled: false; path: string };

export type InstallToolInput = {
  targetId: string;
  recipeId: string;
};

export type ListInstallRecipesInput = {
  targetId: string;
  toolId?: string;
};

export type InstallToolResult = {
  ok: boolean;
  recipeId: string;
  targetId: string;
  logs: string[];
  verified: boolean;
  error?: string;
};

export type InstallLogStream = "command" | "stdout" | "stderr" | "info";

export type InstallLogEvent = {
  installId: string;
  recipeId: string;
  targetId: string;
  toolId: string;
  stream: InstallLogStream;
  line: string;
};

export type InstallRecipe = {
  id: string;
  toolId: string;
  label: string;
  targetKinds: Array<"local" | "container" | "wsl">;
  platforms: Array<"darwin" | "linux" | "windows" | "unknown">;
  preconditions: Array<{ tool: string; available: boolean }>;
  steps: Array<
    | { kind: "command"; command: string; requiresSudo?: boolean; description: string }
    | { kind: "openUrl"; url: string; description: string }
    | { kind: "manual"; markdown: string }
  >;
  verification: { command: string; args?: string[] };
};

export type DiagnosticsJobRecord = {
  id: string;
  kind: string;
  targetId: string;
  projectUri?: string;
  status: "completed" | "failed" | "cancelled" | "timeout";
  durationMs: number;
  createdAt: string;
  finishedAt: string;
  error?: string;
};

export type DiagnosticsDetectorAggregate = {
  detectorKey: string;
  runs: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastRunAt: string;
  failureCount: number;
};

export type DiagnosticsCounter = {
  total: number;
  sinceIso: string;
};

export type DiagnosticsSnapshot = {
  collectedAt: string;
  processStartedAt: string;
  recentJobs: DiagnosticsJobRecord[];
  detectorAggregates: DiagnosticsDetectorAggregate[];
  cache: {
    machine: { hits: number; misses: number };
    project: { hits: number; misses: number };
  };
  terminalData: DiagnosticsCounter;
};

export type PluginTrustState = "bundled" | "verified" | "trusted" | "untrusted" | "disabled";

export type PluginSummary = {
  id: string;
  name: string;
  version: string;
  publisher: string;
  source: "bundled" | "installed";
  trustState: PluginTrustState;
  enabled: boolean;
  contributes: {
    machineDetectors: number;
    projectDetectors: number;
    installRecipes: number;
  };
};

export type PathExistsInput = {
  targetId: string;
  path: string;
};

export type PathExistsResult =
  | { ok: true; kind: "file" | "directory" }
  | { ok: false; reason: "not-found" | "unreachable" | "error"; message: string };

export type CodeGraphProjectStatus = {
  projectUri: string;
  state: "disabled" | "unsupported" | "not-installed" | "uninitialized" | "stale" | "indexed" | "error";
  summary: string;
  updatedAt: string;
  stats?: {
    files: number;
    nodes: number;
    edges: number;
    pendingChanges?: number;
    dbSizeBytes?: number;
    backend?: string;
    journalMode?: string;
  };
};

export type ProjectIconSource = {
  kind: "local" | "favicon";
  url: string;
  label: string;
};

export type ProjectDevService = {
  id: string;
  label: string;
  command: string;
  script: string;
  cwdUri: string;
};

export type ProjectCandidate = {
  id: string;
  uri: string;
  name: string;
  providerId: string;
  providerKind: "local" | "container" | "wsl";
  displayPath: string;
  rootUri: string;
  iconSources?: ProjectIconSource[];
  services?: ProjectDevService[];
  dirtyWorktree?: boolean | null;
};

export type ProjectFilesInput = {
  projectUri: string;
  configuredRoots?: string[];
  directoryPath?: string;
};

export type ProjectFileTreeItem = {
  name: string;
  path: string;
  kind: "directory" | "file";
  editable: boolean;
  children?: ProjectFileTreeItem[];
};

export type ProjectFilesResult =
  | { ok: true; projectUri: string; files: ProjectFileTreeItem[] }
  | { ok: false; reason: "unsafe-path" | "io-error"; message: string };

export type ReadFileInput = {
  projectUri: string;
  relativePath: string;
};

export type ReadFileFailureReason = "not-found" | "permission" | "unsafe-path" | "too-large" | "binary" | "io-error";

export type ReadFileResult =
  | { ok: true; content: string; size: number; relativePath: string }
  | { ok: false; reason: ReadFileFailureReason; message: string };

export type WriteFileInput = {
  projectUri: string;
  relativePath: string;
  content: string;
};

export type WriteFileFailureReason = "not-found" | "permission" | "unsafe-path" | "too-large" | "io-error";

export type WriteFileResult =
  | { ok: true; size: number; relativePath: string }
  | { ok: false; reason: WriteFileFailureReason; message: string };

export type DeleteFileInput = {
  projectUri: string;
  relativePath: string;
};

export type DeleteFileResult =
  | { ok: true; relativePath: string }
  | { ok: false; reason: "not-found" | "permission" | "unsafe-path" | "io-error"; message: string };

export type RenameFileInput = {
  projectUri: string;
  relativePath: string;
  newName: string;
};

export type RenameFileResult =
  | { ok: true; relativePath: string; newRelativePath: string }
  | { ok: false; reason: "not-found" | "permission" | "unsafe-path" | "already-exists" | "io-error"; message: string };

export type GitEvent = {
  hash: string;
  selector: string;
  action: string;
  date: string;
};

export type GitDirtyFile = {
  path: string;
  status: string;
  staged: string;
  unstaged: string;
};

export type GitHubIssue = {
  number: number;
  title: string;
  author: string;
  createdAt: string;
  url: string;
  labels: string[];
};

export type GitHubPullRequest = {
  number: number;
  title: string;
  author: string;
  createdAt: string;
  url: string;
  headRefName: string;
  isDraft: boolean;
  reviewDecision: string | null;
  labels: string[];
};

export type GitHubRelease = {
  tagName: string;
  name: string;
  publishedAt: string;
  isLatest: boolean;
  isPrerelease: boolean;
};

export type GitHubInfo = {
  available: boolean;
  issues: GitHubIssue[];
  pullRequests: GitHubPullRequest[];
  latestRelease: GitHubRelease | null;
};

export type ProjectSummary = {
  id: string;
  uri: string;
  name: string;
  providerId: string;
  providerKind: "local" | "container" | "wsl";
  displayPath: string;
  iconSources?: ProjectIconSource[];
  repoUrl: string | null;
  currentBranch: string | null;
  dirtyWorktree: boolean | null;
};

export type ProjectDetail = ProjectSummary & {
  gitHistory?: GitEvent[];
  gitDirtyFiles?: GitDirtyFile[];
};

export type ScanResult = {
  candidates: ProjectCandidate[];
  roots?: RootRecord[];
  errors?: string[];
};

export type TerminalSessionStatus = "running" | "exited";

export type TerminalCreateInput = {
  cwdUri: string;
  title?: string;
  initialCommand?: string;
  initialCommandTitle?: string;
  agentId?: string;
  service?: { id: string; label: string; command: string };
  protocolBootstrap?: { codeGraphEnabled?: boolean };
  review?: { taskId: string; status: string; sourcePath?: string; agentLabel?: string };
  artifact?: { taskId: string; status: string; sourcePath?: string; agentLabel?: string };
  cols?: number;
  rows?: number;
};

export type TerminalSession = {
  id: string;
  cwdUri: string;
  title: string;
  shell: string;
  pid: number | null;
  status: TerminalSessionStatus;
  createdAt: string;
  agentId?: string;
  service?: { id: string; label: string; command: string };
};

export type TerminalInput = {
  sessionId: string;
  data: string;
};

export type TerminalResizeInput = {
  sessionId: string;
  cols: number;
  rows: number;
};

export type TerminalCloseInput = {
  sessionId: string;
};

export type TerminalDataEvent = {
  sessionId: string;
  data: string;
  stream: "stdout" | "stderr";
};

export type TerminalExitEvent = {
  sessionId: string;
  exitCode: number | null;
  signal: string | null;
};

export type ArtifactReadyEvent = {
  path: string;
  repo: string;
};

export type TerminalUpdateEvent = {
  session: TerminalSession;
};

export type AgentCli = {
  id: string;
  label: string;
  command: string;
  executablePath: string;
  shortLabel: string;
};

export type AgentProjectStatusEvent = {
  agentId: string;
  projectPath: string;
  sessionId: string | null;
  text: string;
  timestamp: string;
  hookState?: "working" | "stopped" | "approval";
  pid?: number;
  terminalSessionId?: string;
  lastPrompt?: string;
};

export type HookSessionViewModel = {
  sessionId: string;
  agentId: string;
  model: string | null;
  title: string | null;
  startedAt: string;
  lastEventAt: string;
  promptCount: number;
  turnCount: number;
  toolCount: number;
};

export type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserCreateInput = {
  initialUrl: string;
  bounds: BrowserBounds;
};

export type BrowserNavigateInput = {
  browserId: string;
  url: string;
};

export type BrowserResizeInput = {
  browserId: string;
  bounds: BrowserBounds;
  active?: boolean;
};

export type BrowserCloseInput = {
  browserId: string;
};

export type BrowserActionInput = {
  browserId: string;
};

export type BrowserSession = {
  id: string;
  title: string;
  url: string;
  faviconUrl: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
};

export type BrowserUpdateEvent = {
  browser: BrowserSession;
};

export type TaskViewModel = {
  taskId: string;
  taskTag: string;
  title: string;
  mode: "quick" | "task";
  status: "active" | "paused" | "completed" | "blocked" | "abandoned";
  sync: "local" | "pending" | "synced" | "failed";
  owner: { githubLogin: string; githubUserId?: number; avatarUrl?: string };
  agent?: string;
  sessionId?: string;
  machine?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  commit?: string;
  commits?: string[];
  files?: string[];
  summary?: string;
  verification?: string;
  work?: string;
  notes?: string;
  artifacts?: string;
  reviews?: string;
  sourcePath: string;
  frontmatter: Record<string, string>;
  bodyMarkdown: string;
  rawMarkdown: string;
  sourceKind: "local-md" | "team-md";
  readOnly: boolean;
};

export type GitHubIdentity = {
  login: string;
  id: number;
  avatarUrl: string;
};

export type ProtocolStatus = {
  installed: boolean;
  harnessInstalled: boolean;
  harnessUpdate: HarnessUpdateStatus;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  lastError: string | null;
  repo?: string;
  branch?: string;
  githubLogin?: string;
  githubUserId?: number;
  machineId?: string;
  permission?: string;
};

export type HarnessFileIssue = {
  path: string;
  reason: "missing" | "changed";
};

export type HarnessUpdateStatus = {
  required: boolean;
  files: HarnessFileIssue[];
};

export type ProtocolInstallInput = {
  repoPath: string;
  githubLogin?: string;
  githubUserId?: number;
  machineId?: string;
  agent?: string;
};

export type ProtocolUninstallInput = {
  repoPath: string;
  cleanTeamContext?: boolean;
};

export type ProtocolUninstallResult = {
  removedPaths: string[];
  skippedPaths: string[];
  excludeRemovedLines: string[];
  contextBranchDeleted: boolean;
};

export type TasksChangedEvent = {
  repoPath: string;
  tasks: TaskViewModel[];
};

export type SharkBayBridge = {
  app?: {
    onOpenSettings?: (callback: () => void) => () => void;
    onNewTerminalTab?: (callback: () => void) => () => void;
    onFocusTerminalSession?: (callback: (id: string) => void) => () => void;
  };
  config?: {
    listRoots?: () => Promise<AppConfig | RootRecord[] | string[]>;
    addProject?: (input: { path?: string; uri?: string }) => Promise<AppConfig | void>;
    cloneProject?: (input: CloneProjectInput) => Promise<CloneProjectResult>;
    removeProject?: (input: { path?: string; uri?: string }) => Promise<AppConfig | void>;
    renameProject?: (input: { uri: string; name: string }) => Promise<AppConfig | void>;
    pickProjectFolder?: () => Promise<{ cancelled: boolean; paths: string[] }>;
    createWorktree?: (input: { sourceProjectPath: string; branchName: string }) => Promise<{ targetPath: string; branchName: string }>;
    setAppearanceTheme?: (input: { theme: AppearanceTheme }) => Promise<AppConfig>;
    setStatusChangeNotifications?: (input: { enabled?: boolean; completionEnabled?: boolean; approvalEnabled?: boolean }) => Promise<AppConfig>;
    setTerminalAppearance?: (input: { colorScheme?: string; fontFamily?: string; fontSize?: number; lineHeight?: number }) => Promise<AppConfig>;
  };
  projects?: {
    scan?: () => Promise<ScanResult | ProjectCandidate[]>;
    getDetail?: (input: { projectUri: string }) => Promise<ProjectDetail>;
    getGitHub?: (input: { projectUri: string }) => Promise<GitHubInfo>;
    listFiles?: (input: ProjectFilesInput) => Promise<ProjectFilesResult>;
    readFile?: (input: ReadFileInput) => Promise<ReadFileResult>;
    writeFile?: (input: WriteFileInput) => Promise<WriteFileResult>;
    deleteFile?: (input: DeleteFileInput) => Promise<DeleteFileResult>;
    renameFile?: (input: RenameFileInput) => Promise<RenameFileResult>;
  };
  codeGraph?: {
    getStatus?: (input: { projectUri: string }) => Promise<CodeGraphProjectStatus>;
    ensureStatus?: (input: { projectUri: string }) => Promise<CodeGraphProjectStatus>;
  };
  terminal?: {
    create?: (input: TerminalCreateInput) => Promise<TerminalSession>;
    input?: (input: TerminalInput) => Promise<TerminalSession>;
    inputFire?: (input: TerminalInput) => void;
    recordPrompt?: (input: { terminalSessionId: string; text: string }) => void;
    recordPromptHistoryEntry?: (input: { key: string; text: string }) => void;
    loadPromptHistory?: (input: { sessionId: string }) => Promise<string[]>;
    resize?: (input: TerminalResizeInput) => Promise<TerminalSession>;
    close?: (input: TerminalCloseInput) => Promise<TerminalSession>;
    onData?: (callback: (event: TerminalDataEvent) => void) => () => void;
    onExit?: (callback: (event: TerminalExitEvent) => void) => () => void;
    onUpdate?: (callback: (event: TerminalUpdateEvent) => void) => () => void;
    onArtifactReady?: (callback: (event: ArtifactReadyEvent) => void) => () => void;
  };
  browser?: {
    create?: (input: BrowserCreateInput) => Promise<BrowserSession>;
    navigate?: (input: BrowserNavigateInput) => Promise<BrowserSession>;
    resize?: (input: BrowserResizeInput) => Promise<BrowserSession>;
    close?: (input: BrowserCloseInput) => Promise<BrowserSession>;
    goBack?: (input: BrowserActionInput) => Promise<BrowserSession>;
    goForward?: (input: BrowserActionInput) => Promise<BrowserSession>;
    reload?: (input: BrowserActionInput) => Promise<BrowserSession>;
    onUpdate?: (callback: (event: BrowserUpdateEvent) => void) => () => void;
  };
  agents?: {
    listClis?: (input?: { cwdUri?: string }) => Promise<AgentCli[]>;
    listInstallRecipes?: (input: ListInstallRecipesInput) => Promise<InstallRecipe[]>;
    installTool?: (input: InstallToolInput) => Promise<InstallToolResult>;
    setHooksEnabled?: (input: { agentId: string; enabled: boolean }) => Promise<void>;
    onStatus?: (callback: (event: AgentProjectStatusEvent) => void) => () => void;
    onInstallLog?: (callback: (event: InstallLogEvent) => void) => () => void;
  };
  targets?: {
    pathExists?: (input: PathExistsInput) => Promise<PathExistsResult>;
  };
  plugins?: {
    list?: () => Promise<PluginSummary[]>;
    setEnabled?: (input: { pluginId: string; enabled: boolean }) => Promise<PluginSummary[]>;
  };
  diagnostics?: {
    read?: () => Promise<DiagnosticsSnapshot>;
  };
  protocol?: {
    getTasks?: (input: { repoPath: string }) => Promise<TaskViewModel[]>;
    getStatus?: (input: { repoPath: string }) => Promise<ProtocolStatus>;
    install?: (input: ProtocolInstallInput) => Promise<ProtocolStatus>;
    enable?: (input: { repoPath: string }) => Promise<ProtocolStatus>;
    uninstall?: (input: ProtocolUninstallInput) => Promise<ProtocolUninstallResult>;
    resolveIdentity?: () => Promise<GitHubIdentity>;
    syncNow?: (input: { repoPath: string }) => Promise<void>;
    updateHarness?: (input: { repoPath: string }) => Promise<ProtocolStatus>;
    onTasksChanged?: (callback: (event: TasksChangedEvent) => void) => () => void;
  };
  hooks?: {
    getSessions?: (input: { repoPath: string }) => Promise<HookSessionViewModel[]>;
  };
  knowledgeSite?: {
    generate?: (input: { repoPath: string }) => Promise<{ generated: boolean; sitePath: string; reason?: string }>;
    getPath?: (input: { repoPath: string }) => Promise<string>;
  };
  usage?: {
    getSummary?: (input?: { periodDays?: number }) => Promise<UsageSummaryView>;
    getReport?: (input: UsageReportFilterView) => Promise<UsageReportResultView>;
  };
  dock?: {
    updateBadge?: (count: number) => void;
    contentReady?: () => void;
    syncIslandTabs?: (tabs: Array<{ sessionId: string; title: string; projectName: string; agentId?: string; state: string; lastPrompt?: string }>) => void;
  };
  shell?: {
    openExternal?: (input: { url: string }) => Promise<void>;
  };
};

export type UsageSummaryView = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number | null;
  periodLabel: string;
};

export type UsageReportFilterView = {
  projectPath?: string;
  agentId?: string;
  startDate?: string;
  endDate?: string;
};

export type UsageGroupRowView = {
  key: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalInputTokens: number;
  costUsd: number | null;
};

export type UsageReportResultView = {
  byProject: UsageGroupRowView[];
  byAgent: UsageGroupRowView[];
  byDay: UsageGroupRowView[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalInputTokens: number;
    costUsd: number | null;
  };
};
