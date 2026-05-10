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
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
};

export type BrowserUpdateEvent = {
  browser: BrowserSession;
};

export type SharkBayBridge = {
  app?: {
    onOpenSettings?: (callback: () => void) => () => void;
  };
  config?: {
    listRoots?: () => Promise<AppConfig | RootRecord[] | string[]>;
    addRoot?: (input: { path: string; rootPath?: string } | string) => Promise<AppConfig | RootRecord[] | void>;
    removeRoot?: (input: { path: string; rootPath?: string } | string) => Promise<AppConfig | RootRecord[] | void>;
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
};
