export type AppearanceTheme = "day" | "night" | "morning";

export type AppConfig = {
  schemaVersion: 1;
  configuredRoots: string[];
  configuredProjects: string[];
  configuredRemoteProjects: string[];
  configuredRemoteMachines: RemoteMachine[];
  projectAliases: Record<string, string>;
  disabledPluginIds: string[];
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

export type RenameProjectInput = {
  uri: string;
  name: string;
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

export type ExecutionTargetKind = "local" | "ssh" | "container" | "wsl";

export type ExecutionTargetStatus = "available" | "unavailable" | "auth-required" | "unknown";

export type ExecutionTarget = {
  id: string;
  kind: ExecutionTargetKind;
  label: string;
  status: ExecutionTargetStatus;
  uri: string;
  displayPath: string;
  machineId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProfileReadOptions = {
  refresh?: boolean;
  depth?: ProfileDepth;
};

export type ProfileDepth = "quick" | "standard" | "deep";

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

export type MachineOsProfile = {
  platform: "darwin" | "linux" | "windows" | "unknown";
  name: string | null;
  version: string | null;
  arch: string | null;
  kernel: string | null;
};

export type MachineProfile = {
  targetId: string;
  targetKind: ExecutionTargetKind;
  detectedAt: string;
  expiresAt?: string;
  hostname: string | null;
  os: MachineOsProfile;
  shell: {
    path: string | null;
    name: string | null;
  };
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
  id: "npm" | "pnpm" | "yarn" | "bun" | "pip" | "uv" | "poetry" | "conda" | "go" | "maven" | "gradle" | "cargo" | string;
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

export type PluginTrustState = "bundled" | "verified" | "trusted" | "untrusted" | "disabled";

export type PluginCapabilityRequest =
  | { kind: "profile:machine" }
  | { kind: "profile:project" }
  | { kind: "agent:detect" }
  | { kind: "install:software"; requiresConfirmation: true }
  | { kind: "command:run"; scope: "local" | "target" }
  | { kind: "file:read"; patterns?: string[] };

export type SharkBayPluginManifest = {
  id: string;
  name: string;
  version: string;
  publisher: string;
  engines: {
    sharkbay: string;
  };
  main?: string;
  trust?: PluginTrustState;
  capabilities?: PluginCapabilityRequest[];
  contributes?: PluginContributions;
};

export type PluginContributions = {
  machineDetectors?: DetectorContribution[];
  projectDetectors?: DetectorContribution[];
  agents?: AgentContribution[];
  installers?: InstallerContribution[];
  commands?: CommandContribution[];
  profileCards?: ProfileCardContribution[];
};

export type DetectorContribution = {
  id: string;
  label: string;
  description?: string;
};

export type AgentContribution = {
  id: string;
  label: string;
  shortLabel: string;
  commands: string[];
  detect: {
    commandNames: string[];
    versionArgs?: string[];
  };
  launch: {
    command: string;
    args?: string[];
    supportsProjectScope: boolean;
  };
  installRecipes?: string[];
};

export type InstallerContribution = {
  id: string;
  label: string;
  recipeIds?: string[];
};

export type CommandContribution = {
  id: string;
  label: string;
  category?: string;
};

export type ProfileCardContribution = {
  id: string;
  location: "machine.profile" | "project.profile";
  title: string;
  dataSelector: string;
  display: "tool-list" | "command-list" | "key-value" | "warnings";
};

export type InstallRecipe = {
  id: string;
  toolId: string;
  label: string;
  targetKinds: ExecutionTargetKind[];
  platforms: MachineOsProfile["platform"][];
  preconditions: InstallPrecondition[];
  steps: InstallStep[];
  verification: ToolVerification;
};

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

export type InstallPrecondition = {
  tool: string;
  available: boolean;
};

export type InstallStep =
  | { kind: "command"; command: string; requiresSudo?: boolean; description: string }
  | { kind: "openUrl"; url: string; description: string }
  | { kind: "manual"; markdown: string };

export type ToolVerification = {
  command: string;
  args?: string[];
};

export type ProjectFingerprint = {
  manifestMtimes: Record<string, number | null>;
  gitHead: string | null;
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

export type PathExistsInput = {
  targetId: string;
  path: string;
};

export type PathExistsResult =
  | { ok: true; kind: "file" | "directory" }
  | { ok: false; reason: "not-found" | "unreachable" | "error"; message: string };

export type SharkBayJobKind = "machine-profile" | "project-profile" | "scan" | "agent-detect" | "install" | "log-parse";

export type SharkBayJob = {
  id: string;
  kind: SharkBayJobKind;
  targetId: string;
  projectUri?: string;
  priority: "interactive" | "background" | "idle";
  timeoutMs: number;
  createdAt: string;
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
  agentId?: string;
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
  localPort?: number;
  remoteHost?: string;
};

export type RemovePortForwardInput = {
  id: string;
};

export type ListPortForwardsInput = {
  machineId?: string;
};

export type DetectRemotePortsInput = {
  machineId: string;
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

export type KnowledgeSiteResult = {
  generated: boolean;
  sitePath: string;
  reason?: string;
};
