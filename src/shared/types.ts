export type AppearanceTheme = "day" | "night" | "morning";

export type AppConfig = {
  schemaVersion: 1;
  configuredRoots: string[];
  configuredProjects: string[];
  appearanceTheme: AppearanceTheme;
  updatedAt: string;
};

export type IpcRuntimeLike = {
  userDataPath: string;
};

export type RootConfigInput = {
  path?: string;
  rootPath?: string;
};

export type RemoveRootInput = RootConfigInput;

export type ProjectConfigInput = {
  path: string;
};

export type RemoveProjectInput = {
  path: string;
};

export type AppearanceThemeInput = {
  theme: AppearanceTheme;
};

export type ProjectScanInput = {
  configuredRoots?: string[];
  maxDepth?: number;
};

export type RootScanResult = {
  inputPath: string;
  path: string | null;
  available: boolean;
  error: string | null;
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

export type ProjectFileTreeItem = {
  name: string;
  path: string;
  kind: "directory" | "file";
  editable: boolean;
  children?: ProjectFileTreeItem[];
};

export type ProjectFilesInput = {
  repoPath: string;
  configuredRoots?: string[];
  configuredProjects?: string[];
  directoryPath?: string;
};

export type ProjectFilesResult =
  | { ok: true; repoPath: string; files: ProjectFileTreeItem[] }
  | { ok: false; reason: "unsafe-path" | "io-error"; message: string };

export type ProjectCandidate = {
  id: string;
  name: string;
  path: string;
  rootPath: string;
  iconSources: ProjectIconSource[];
  services: ProjectDevService[];
  dirtyWorktree: boolean | null;
};

export type GitMetadata = {
  isGitRepository: boolean;
  gitRoot: string | null;
  currentBranch: string | null;
  defaultBranch: string | null;
  remoteOrigin: string | null;
  githubUrl: string | null;
  dirtyWorktree: boolean | null;
};

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
  iconSources: ProjectIconSource[];
  repoUrl: string | null;
  currentBranch: string | null;
  dirtyWorktree: boolean | null;
};

export type ProjectDetail = ProjectSummary & {
  gitHistory: GitEvent[];
  gitDirtyFiles: GitDirtyFile[];
};

export type ScanProjectsResult = {
  roots: RootScanResult[];
  candidates: ProjectCandidate[];
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

export type GitHubIdentity = {
  login: string;
  id: number;
  avatarUrl: string;
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

export type TeamworkGetTasksInput = {
  repoPath: string;
};

export type TeamworkTasksChangedEvent = {
  repoPath: string;
  tasks: TaskViewModel[];
};
