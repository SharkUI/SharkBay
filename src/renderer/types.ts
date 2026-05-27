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
  configuredRemoteProjects?: string[];
  configuredRemoteMachines?: RemoteMachine[];
  projectAliases?: Record<string, string>;
  appearanceTheme?: AppearanceTheme;
  updatedAt?: string;
};

export type RemoteMachineAuthMode = "system-ssh-config" | "ssh-agent" | "key-file" | "password";

export type RemoteMachine = {
  id: string;
  label: string;
  host: string;
  port: number;
  username?: string;
  sshConfigHost?: string;
  authMode: RemoteMachineAuthMode;
  keyPath?: string;
  passwordSecretId?: string;
  hasPassword?: boolean;
  defaultProjectPath?: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteMachineInput = {
  label: string;
  authMode: RemoteMachineAuthMode;
  sshConfigHost?: string;
  host?: string;
  port?: number;
  username?: string;
  keyPath?: string;
  password?: string;
  defaultProjectPath?: string;
};

export type RemoteMachineTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

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
  targetKinds: Array<"local" | "ssh" | "container" | "wsl">;
  platforms: Array<"darwin" | "linux" | "windows" | "unknown">;
  preconditions: Array<{ tool: string; available: boolean }>;
  steps: Array<
    | { kind: "command"; command: string; requiresSudo?: boolean; description: string }
    | { kind: "openUrl"; url: string; description: string }
    | { kind: "manual"; markdown: string }
  >;
  verification: { command: string; args?: string[] };
};

export type ExecutionTargetKind = "local" | "ssh" | "container" | "wsl";

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

export type DiagnosticsLatencyStats = {
  count: number;
  errors: number;
  minMs: number | null;
  maxMs: number | null;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
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
  ssh: DiagnosticsLatencyStats;
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

export type ProfileReadOptions = {
  refresh?: boolean;
  depth?: "quick" | "standard" | "deep";
};

export type ProfileWarning = {
  code: string;
  message: string;
  source?: string;
};

export type ToolProfile = {
  id: string;
  command: string;
  available: boolean;
  path: string | null;
  version: string | null;
  sourcePluginId?: string;
};

export type MachineProfile = {
  targetId: string;
  targetKind: ExecutionTargetKind;
  detectedAt: string;
  expiresAt?: string;
  hostname: string | null;
  os: {
    platform: "darwin" | "linux" | "windows" | "unknown";
    name: string | null;
    version: string | null;
    arch: string | null;
    kernel: string | null;
  };
  shell: { path: string | null; name: string | null };
  tools: ToolProfile[];
  languages: ToolProfile[];
  packageManagers: ToolProfile[];
  agents: ToolProfile[];
  warnings: ProfileWarning[];
};

export type DetectedProfileItem = {
  id: string;
  confidence: number;
  evidence: string[];
  sourcePluginId?: string;
};

export type DetectedPackageManager = DetectedProfileItem & {
  manifest?: string;
  lockfile?: string;
};

export type ProjectServiceProfile = {
  id: string;
  label: string;
  command: string;
  cwdUri: string;
  script?: string;
  likelyPorts: number[];
  sourcePluginId?: string;
};

export type ProjectWorkspaceProfile = {
  name: string;
  path: string;
  packageManager?: string;
};

export type ProjectProfile = {
  projectUri: string;
  targetId: string;
  targetKind: ExecutionTargetKind;
  detectedAt: string;
  expiresAt?: string;
  name: string;
  displayPath: string;
  vcs: {
    type: "git" | "none" | "unknown";
    root: string | null;
    branch: string | null;
    remoteOrigin: string | null;
    dirty: boolean | null;
  };
  languages: DetectedProfileItem[];
  frameworks: DetectedProfileItem[];
  packageManagers: DetectedPackageManager[];
  commands: {
    install?: string;
    dev?: string;
    build?: string;
    test?: string;
    lint?: string;
    format?: string;
  };
  services: ProjectServiceProfile[];
  env: {
    files: string[];
    exampleFiles: string[];
    requiredKeys?: string[];
  };
  structure: {
    monorepo: boolean;
    workspaces: ProjectWorkspaceProfile[];
    importantFiles: string[];
  };
  warnings: ProfileWarning[];
};

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
  providerKind: "local" | "ssh" | "container" | "wsl";
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

export type ProjectSummary = {
  id: string;
  uri: string;
  name: string;
  providerId: string;
  providerKind: "local" | "ssh" | "container" | "wsl";
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
  teamworkBootstrap?: { codeGraphEnabled?: boolean };
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
  files?: string[];
  summary?: string;
  verification?: string;
  work?: string;
  notes?: string;
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

export type TeamworkStatus = {
  installed: boolean;
  harnessInstalled: boolean;
  harnessUpdate: TeamworkHarnessUpdateStatus;
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

export type TeamworkHarnessFileIssue = {
  path: string;
  reason: "missing" | "changed";
};

export type TeamworkHarnessUpdateStatus = {
  required: boolean;
  files: TeamworkHarnessFileIssue[];
};

export type TeamworkInstallInput = {
  repoPath: string;
  githubLogin?: string;
  githubUserId?: number;
  machineId?: string;
  agent?: string;
};

export type TeamworkUninstallInput = {
  repoPath: string;
  cleanTeamContext?: boolean;
};

export type TeamworkUninstallResult = {
  removedPaths: string[];
  skippedPaths: string[];
  excludeRemovedLines: string[];
  contextBranchDeleted: boolean;
};

export type TeamworkTasksChangedEvent = {
  repoPath: string;
  tasks: TaskViewModel[];
};

export type SharkBayBridge = {
  app?: {
    onOpenSettings?: (callback: () => void) => () => void;
  };
  config?: {
    listRoots?: () => Promise<AppConfig | RootRecord[] | string[]>;
    addProject?: (input: { path?: string; uri?: string }) => Promise<AppConfig | void>;
    removeProject?: (input: { path?: string; uri?: string }) => Promise<AppConfig | void>;
    renameProject?: (input: { uri: string; name: string }) => Promise<AppConfig | void>;
    addRemoteMachine?: (input: RemoteMachineInput) => Promise<AppConfig>;
    removeRemoteMachine?: (input: { id: string }) => Promise<AppConfig>;
    testRemoteMachine?: (input: { id: string } | RemoteMachineInput) => Promise<RemoteMachineTestResult>;
    pickProjectFolder?: () => Promise<{ cancelled: boolean; paths: string[] }>;
    setAppearanceTheme?: (input: { theme: AppearanceTheme }) => Promise<AppConfig>;
  };
  projects?: {
    scan?: () => Promise<ScanResult | ProjectCandidate[]>;
    getDetail?: (input: { projectUri: string }) => Promise<ProjectDetail>;
    listFiles?: (input: ProjectFilesInput) => Promise<ProjectFilesResult>;
    readFile?: (input: ReadFileInput) => Promise<ReadFileResult>;
    writeFile?: (input: WriteFileInput) => Promise<WriteFileResult>;
  };
  codeGraph?: {
    getStatus?: (input: { projectUri: string }) => Promise<CodeGraphProjectStatus>;
    ensureStatus?: (input: { projectUri: string }) => Promise<CodeGraphProjectStatus>;
  };
  terminal?: {
    create?: (input: TerminalCreateInput) => Promise<TerminalSession>;
    input?: (input: TerminalInput) => Promise<TerminalSession>;
    inputFire?: (input: TerminalInput) => void;
    resize?: (input: TerminalResizeInput) => Promise<TerminalSession>;
    close?: (input: TerminalCloseInput) => Promise<TerminalSession>;
    onData?: (callback: (event: TerminalDataEvent) => void) => () => void;
    onExit?: (callback: (event: TerminalExitEvent) => void) => () => void;
    onUpdate?: (callback: (event: TerminalUpdateEvent) => void) => () => void;
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
    onStatus?: (callback: (event: AgentProjectStatusEvent) => void) => () => void;
    onInstallLog?: (callback: (event: InstallLogEvent) => void) => () => void;
  };
  profiles?: {
    readMachine?: (input: { targetId: string; options?: ProfileReadOptions }) => Promise<MachineProfile>;
    readProject?: (input: { projectUri: string; options?: ProfileReadOptions }) => Promise<ProjectProfile>;
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
  teamwork?: {
    getTasks?: (input: { repoPath: string }) => Promise<TaskViewModel[]>;
    getStatus?: (input: { repoPath: string }) => Promise<TeamworkStatus>;
    install?: (input: TeamworkInstallInput) => Promise<TeamworkStatus>;
    enable?: (input: { repoPath: string }) => Promise<TeamworkStatus>;
    uninstall?: (input: TeamworkUninstallInput) => Promise<TeamworkUninstallResult>;
    resolveIdentity?: () => Promise<GitHubIdentity>;
    syncNow?: (input: { repoPath: string }) => Promise<void>;
    updateHarness?: (input: { repoPath: string }) => Promise<TeamworkStatus>;
    onTasksChanged?: (callback: (event: TeamworkTasksChangedEvent) => void) => () => void;
  };
  knowledgeSite?: {
    generate?: (input: { repoPath: string }) => Promise<{ generated: boolean; sitePath: string; reason?: string }>;
    getPath?: (input: { repoPath: string }) => Promise<string>;
  };
  portForwards?: {
    list?: (input?: { machineId?: string }) => Promise<RemotePortForward[]>;
    detect?: (input: { machineId: string }) => Promise<RemoteDetectedPort[]>;
    create?: (input: { machineId: string; remotePort: number; localPort?: number; remoteHost?: string }) => Promise<RemotePortForward>;
    remove?: (input: { id: string }) => Promise<{ ok: true }>;
    onUpdate?: (callback: (event: { forward: RemotePortForward }) => void) => () => void;
  };
  usage?: {
    getSummary?: (input?: { periodDays?: number }) => Promise<UsageSummaryView>;
    getReport?: (input: UsageReportFilterView) => Promise<UsageReportResultView>;
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

export type PortForwardStatus = "starting" | "running" | "stopped" | "error";

export type RemotePortForward = {
  id: string;
  machineId: string;
  remoteHost: string;
  remotePort: number;
  localPort: number;
  status: PortForwardStatus;
  error: string | null;
  pid: number | null;
  createdAt: string;
};

export type RemoteDetectedPort = {
  machineId: string;
  remoteHost: string;
  remotePort: number;
  processName: string | null;
  pid: number | null;
  source: "process";
  label: string;
  protocol: "http" | "https" | null;
  forwarded: boolean;
  forwardId?: string;
  localPort?: number;
  status?: PortForwardStatus;
};
