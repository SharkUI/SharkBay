export type AppearanceTheme = "day" | "night" | "morning";

export type AppConfig = {
  schemaVersion: 1;
  configuredRoots: string[];
  configuredProjects: string[];
  configuredRemoteProjects: string[];
  configuredRemoteMachines: RemoteMachine[];
  appearanceTheme: AppearanceTheme;
  updatedAt: string;
};

export type IpcRuntimeLike = {
  userDataPath: string;
  configPath?: string;
};

export type RootConfigInput = {
  path?: string;
  rootPath?: string;
};

export type RemoveRootInput = RootConfigInput;

export type ProjectConfigInput = {
  path?: string;
  uri?: string;
};

export type RemoveProjectInput = {
  path?: string;
  uri?: string;
};

export type AppearanceThemeInput = {
  theme: AppearanceTheme;
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

export type RemoveRemoteMachineInput = {
  id: string;
};

export type TestRemoteMachineInput =
  | { id: string }
  | RemoteMachineInput;

export type RemoteMachineTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

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
  cwdUri: string;
};

export type ProjectFileTreeItem = {
  name: string;
  path: string;
  kind: "directory" | "file";
  editable: boolean;
  children?: ProjectFileTreeItem[];
};

export type ProjectFilesInput = {
  projectUri: string;
  configuredRoots?: string[];
  configuredProjects?: string[];
  directoryPath?: string;
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

export type ProjectCandidate = {
  id: string;
  uri: string;
  name: string;
  providerId: string;
  providerKind: "local" | "ssh" | "container" | "wsl";
  displayPath: string;
  rootUri: string;
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
  uri: string;
  name: string;
  providerId: string;
  providerKind: "local" | "ssh" | "container" | "wsl";
  displayPath: string;
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
  cwdUri: string;
  title?: string;
  initialCommand?: string;
  service?: { id: string; label: string; command: string };
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

export type CreatePortForwardInput = {
  machineId: string;
  remotePort: number;
  localPort: number;
  remoteHost?: string;
};

export type RemovePortForwardInput = {
  id: string;
};

export type ListPortForwardsInput = {
  machineId?: string;
};

export type PortForwardEvent = {
  forward: RemotePortForward;
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
