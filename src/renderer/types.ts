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
  appearanceTheme?: AppearanceTheme;
  updatedAt?: string;
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
  cwd: string;
};

export type ProjectCandidate = {
  id: string;
  name: string;
  path: string;
  rootPath: string;
  iconSources?: ProjectIconSource[];
  services?: ProjectDevService[];
  dirtyWorktree?: boolean | null;
};

export type ProjectFilesInput = {
  repoPath: string;
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
  | { ok: true; repoPath: string; files: ProjectFileTreeItem[] }
  | { ok: false; reason: "unsafe-path" | "io-error"; message: string };

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
  name: string;
  path: string;
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
  cwd: string;
  title?: string;
  initialCommand?: string;
  service?: { id: string; label: string; command: string };
  cols?: number;
  rows?: number;
};

export type TerminalSession = {
  id: string;
  cwd: string;
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
  syncEnabled: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  lastError: string | null;
  repo?: string;
  branch?: string;
  githubLogin?: string;
  permission?: string;
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
    addRoot?: (input: { path: string; rootPath?: string } | string) => Promise<AppConfig | RootRecord[] | void>;
    removeRoot?: (input: { path: string; rootPath?: string } | string) => Promise<AppConfig | RootRecord[] | void>;
    addProject?: (input: { path: string }) => Promise<AppConfig | void>;
    removeProject?: (input: { path: string }) => Promise<AppConfig | void>;
    pickProjectFolder?: () => Promise<{ cancelled: boolean; paths: string[] }>;
    setAppearanceTheme?: (input: { theme: AppearanceTheme }) => Promise<AppConfig>;
  };
  projects?: {
    scan?: () => Promise<ScanResult | ProjectCandidate[]>;
    getDetail?: (input: { repoPath: string }) => Promise<ProjectDetail>;
    listFiles?: (input: ProjectFilesInput) => Promise<ProjectFilesResult>;
  };
  terminal?: {
    create?: (input: TerminalCreateInput) => Promise<TerminalSession>;
    input?: (input: TerminalInput) => Promise<TerminalSession>;
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
    listClis?: () => Promise<AgentCli[]>;
    onStatus?: (callback: (event: AgentProjectStatusEvent) => void) => () => void;
  };
  teamwork?: {
    getTasks?: (input: { repoPath: string }) => Promise<TaskViewModel[]>;
    getStatus?: (input: { repoPath: string }) => Promise<TeamworkStatus>;
    install?: (input: TeamworkInstallInput) => Promise<TeamworkStatus>;
    enable?: (input: { repoPath: string }) => Promise<TeamworkStatus>;
    uninstall?: (input: TeamworkUninstallInput) => Promise<TeamworkUninstallResult>;
    resolveIdentity?: () => Promise<GitHubIdentity>;
    syncNow?: (input: { repoPath: string }) => Promise<void>;
    onTasksChanged?: (callback: (event: TeamworkTasksChangedEvent) => void) => () => void;
  };
};
