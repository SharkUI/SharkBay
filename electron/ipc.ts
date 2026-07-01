import { execFile } from "node:child_process";
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  addConfiguredProject,
  getConfiguredRoots,
  removeConfiguredProject,
  renameProject,
  setAppearanceTheme,
  setStatusChangeNotificationsEnabled,
} from "../src/main/config.js";
import { cloneProject } from "../src/main/project-clone.js";
import { createWorktree } from "../src/main/worktree.js";
import type {
  AgentCli,
  AgentProjectStatusEvent,
  ArtifactReadyEvent,
  AppConfig,
  AppearanceTheme,
  AppearanceThemeInput,
  StatusChangeNotificationsInput,
  CodeGraphProjectStatus,
  UsageReportFilter,
  UsageReportResult,
  UsageSummary,
  BrowserActionInput,
  BrowserCloseInput,
  BrowserCreateInput,
  BrowserFindInput,
  BrowserFoundInPageEvent,
  BrowserNavigateInput,
  BrowserResizeInput,
  BrowserSession,
  BrowserStopFindInput,
  BrowserUpdateEvent,
  FindPopoverOpenInput,
  InstallToolInput,
  InstallToolResult,
  InstallRecipe,
  KnowledgeSiteResult,
  ListInstallRecipesInput,
  DeleteFileInput,
  DeleteFileResult,
  RenameFileInput,
  RenameFileResult,
  DiagnosticsSnapshot,
  GitHubInfo,
  PathExistsInput,
  PathExistsResult,
  CloneProjectInput,
  CloneProjectResult,
  ProjectConfigInput,
  ProjectScanInput,
  ProjectDetail,
  ProjectFilesInput,
  ProjectFilesResult,
  ReadFileInput,
  ReadFileResult,
  WriteFileInput,
  WriteFileResult,
  RenameProjectInput,
  RemoveProjectInput,
  CreateWorktreeInput,
  CreateWorktreeResult,
  ScanProjectsResult,
  GitHubIdentity,
  TaskViewModel,
  TasksGetInput,
  ProtocolInstallInput,
  ProtocolStatus,
  TasksChangedEvent,
  ProtocolUninstallInput,
  ProtocolUninstallResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent
} from "../src/shared/types.js";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import { appChannels } from "../src/shared/app-events.js";
import { closeFindPopover, focusFindPopover, isFindPopoverOpen, sendFindResult, showFindPopover } from "./find-popover.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { CODEGRAPH_PLUGIN_ID } from "../src/plugins/bundled/codegraph-detector.js";
import { AgentSessionWatcher } from "../src/main/agent-clis.js";
import { TokenUsageDb } from "../src/main/token-usage-db.js";
import { TokenUsageCollector } from "../src/main/token-usage-collector.js";
import { BrowserManager } from "../src/main/browser-tabs.js";
import { readGitMetadata } from "../src/main/git.js";
import { resolveRepoPath } from "../src/main/path-safety.js";
import { checkRepoPermission, ensureLocalExclude, generateMachineId, getHarnessUpdateStatus, getLocalHarnessIdentity, getMachineId, installHarness, isGitWorktree, isHarnessInstalled, resolveGitHubIdentity, uninstallHarness, updateHarnessFiles } from "../src/main/harness.js";
import { deleteTeamContextBranch, hasLocalContextBranch, TeamworkSync } from "../src/main/teamwork-sync.js";
import { scanTasks, watchTasks } from "../src/main/tasks.js";
import { generateKnowledgeSite, getKnowledgeSitePath } from "../src/main/knowledge-site.js";
import { shareLocalArtifact, type ShareArtifactInput, type ShareArtifactResult } from "../src/main/share-artifact.js";
import { showSharePopover, type ShowSharePopoverInput } from "../src/main/share-popover.js";
import { spawnCoreClient, type CoreClient } from "./core-client.js";
import { setPluginEnabledConfig } from "../src/main/config.js";
import type { PluginSummary } from "../src/plugins/plugin-host.js";
import { HookBridge } from "../src/main/hooks/bridge.js";
import { AgentHookStateManager } from "../src/main/hooks/state-manager.js";
import { SessionPromptStore } from "../src/main/hooks/prompt-store.js";
import { ClaudeConnector, CodexConnector, QwenConnector } from "../src/main/hooks/connectors/claude-family.js";
import { GeminiConnector } from "../src/main/hooks/connectors/gemini.js";
import { KiroConnector } from "../src/main/hooks/connectors/kiro.js";
import { CodeWhaleConnector } from "../src/main/hooks/connectors/codewhale.js";
import { OpenCodeConnector } from "../src/main/hooks/connectors/opencode.js";
import { CursorConnector } from "../src/main/hooks/connectors/cursor.js";
import type { AgentConnector } from "../src/main/hooks/types.js";
import { TerminalApprovalDetector } from "../src/main/hooks/terminal-approval-detector.js";
import { parseHookSessions } from "../src/main/hooks/sessions.js";
import { TelegramService, type TelegramServiceDeps, type MachineIdentity } from "../src/main/telegram/service.js";
import { buildSessionRows, type ProjectRef, type LiveStatus } from "../src/main/telegram/session-registry.js";
import { extractAnswer, lastTurnStartIndex, progressSince } from "../src/main/telegram/transcript.js";
import { createDefaultTelegramConfig, updateTelegramConfig } from "../src/main/config.js";
import { createDefaultSecretStore } from "../src/main/secrets.js";
import type {
  TelegramConfigView,
  TelegramPairCodeResult,
  TelegramRevokeUserInput,
  TelegramSetEnabledInput,
  TelegramSetTokenInput,
  TelegramSetTokenResult,
} from "../src/shared/types.js";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as nodeFs from "node:fs";

export type IpcRuntime = {
  userDataPath: string;
  configPath?: string;
};

export type IpcCallbacks = {
  onAppearanceThemeChanged?: (theme: AppearanceTheme) => void;
  onStatusChangeNotificationsChanged?: (config: Pick<AppConfig, "statusChangeNotificationsEnabled" | "agentStatusCompletionSoundEnabled" | "agentStatusApprovalSoundEnabled">) => void;
};

let core: CoreClient | null = null;
let tokenUsageDb: TokenUsageDb | null = null;
let telegramService: TelegramService | null = null;
let telegramMachineIdentity: MachineIdentity | null = null;
let latestIslandAgentTabs: Array<{ sessionId: string; hookSessionId?: string; title?: string; projectName?: string; agentId?: string; state?: string; lastPrompt?: string }> = [];
const telegramSecretStore = createDefaultSecretStore();
const TELEGRAM_TOKEN_SECRET_ID = "telegram-bot-token";
const codexTranscriptPathCache = new Map<string, string>();
const claudeTranscriptPathCache = new Map<string, string>();
const agentSessionWatcher = new AgentSessionWatcher();
const browserManager = new BrowserManager();
let activeFindBrowserId: string | null = null;
let lastFindQuery = "";
let refocusPopoverOnResult = false;

const hookBridge = new HookBridge();
const hookStateManager = new AgentHookStateManager();
const hookConnectors = new Map<string, AgentConnector>([
  ["claude", new ClaudeConnector()],
  ["codex", new CodexConnector()],
  ["qwen", new QwenConnector()],
  ["codewhale", new CodeWhaleConnector()],
  ["gemini", new GeminiConnector()],
  ["kiro", new KiroConnector()],
  ["opencode", new OpenCodeConnector()],
  ["cursor", new CursorConnector()],
]);
for (const connector of hookConnectors.values()) {
  hookStateManager.registerConnector(connector);
}

const terminalApprovalDetector = new TerminalApprovalDetector();
terminalApprovalDetector.setCallback((event) => {
  const hookSessionId = findAgentSessionForTerminal(event.terminalSessionId, event.agentId);
  if (!hookSessionId) return;
  hookStateManager.injectEvent({
    agent: event.agentId,
    sessionId: hookSessionId,
    event: "attention",
    timestamp: new Date().toISOString(),
    cwd: event.cwd,
  });
});

const syncInstances = new Map<string, TeamworkSync>();
const taskWatcherCleanups = new Map<string, () => void>();

// Terminal PID → terminal session ID cache (for hook→tab matching)
const terminalPidToId = new Map<number, string>();
// Agent hook sessionId → resolved terminal session ID
const hookSessionToTerminal = new Map<string, string>();
// Hook sessions pending PID resolution (pid → hookSessionId)
const pendingHookResolutions = new Map<string, number>();
// Persistent store of the latest prompt per agent (hook) session id.
let promptStore: SessionPromptStore | null = null;
// Prompts recorded by terminal id before the hook session mapping resolved.
const pendingPromptsByTerminal = new Map<string, string[]>();

function resolveTerminalForPid(agentPid: number): Promise<string | null> {
  return new Promise((resolve) => {
    let currentPid = agentPid;
    let steps = 0;
    const walk = () => {
      if (steps++ > 5 || currentPid <= 1) { resolve(null); return; }
      execFile("ps", ["-o", "ppid=", "-p", String(currentPid)], { timeout: 2000 }, (err, stdout) => {
        if (err) { resolve(null); return; }
        const ppid = parseInt(stdout.trim(), 10);
        if (isNaN(ppid) || ppid <= 1) { resolve(null); return; }
        const terminalId = terminalPidToId.get(ppid);
        if (terminalId) { resolve(terminalId); return; }
        currentPid = ppid;
        walk();
      });
    };
    walk();
  });
}

/**
 * Handle an `open_artifact` request forwarded from an artifact session's
 * `open-artifact.sh` (via the hook socket). Broadcasts the artifact path to
 * renderer windows so they can open it in the built-in browser. Returns true if
 * the message was an artifact request (and should not flow to the state
 * manager). Defensive: only `.html` files inside a project's `.sharkbay/artifacts/`
 * directory are accepted. The old `.sharkbay/site/artifacts/` location remains
 * accepted so previously generated artifact links can still open.
 */
function tryHandleArtifactMessage(msg: { source: string; payload: unknown; pid?: number }): boolean {
  const payload = msg.payload;
  if (!payload || typeof payload !== "object") return false;
  const data = payload as { type?: unknown; path?: unknown; repo?: unknown };
  if (data.type !== "open_artifact") return false;
  const filePath = typeof data.path === "string" ? data.path : "";
  const repo = typeof data.repo === "string" ? data.repo : "";
  const inArtifactDir = filePath.startsWith(`${repo}/.sharkbay/artifacts/`)
    || filePath.startsWith(`${repo}/.sharkbay/site/artifacts/`);
  if (filePath && repo && inArtifactDir && filePath.endsWith(".html")) {
    const event: ArtifactReadyEvent = { path: filePath, repo };
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.openArtifact, event);
    });
  }
  return true;
}

function requireCore(): CoreClient {
  if (!core) throw new Error("Core client is not initialized; registerIpcHandlers must complete first");
  return core;
}

/**
 * Awaitable shutdown for app exit: cancels background CodeGraph jobs and closes
 * terminals via the core process (awaited) BEFORE the core utility process is
 * killed, then tears down the remaining main-process resources. Prevents
 * orphaned codegraph process groups (issue #15).
 */
export async function shutdownCore(): Promise<void> {
  await telegramService?.stop().catch(() => {});
  await core?.dispose();
  browserManager.closeAll();
  closeFindPopover();
  for (const sync of syncInstances.values()) sync.stop();
  syncInstances.clear();
  for (const cleanup of taskWatcherCleanups.values()) cleanup();
  taskWatcherCleanups.clear();
}

export function flushPromptStore(): void {
  promptStore?.flushSync();
}

async function resolveProtocolRepoPath(runtime: IpcRuntime, repoPath: string): Promise<string> {
  const config = await getConfiguredRoots(runtime);
  const safe = await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects);
  return safe.repoPath;
}

async function syncForStatus(repoPath: string, installed: boolean): Promise<TeamworkSync | null> {
  const existing = syncInstances.get(repoPath);
  if (existing) return existing;
  if (!installed || !await hasLocalContextBranch(repoPath)) return null;

  const sync = new TeamworkSync(repoPath);
  sync.start();
  syncInstances.set(repoPath, sync);
  return sync;
}

async function getProtocolStatus(repoPath: string): Promise<ProtocolStatus> {
  const harnessInstalled = await isHarnessInstalled(repoPath);
  const installed = harnessInstalled;
  if (harnessInstalled && await isGitWorktree(repoPath)) {
    await ensureLocalExclude(repoPath).catch(() => {});
  }
  const identity = harnessInstalled ? await getLocalHarnessIdentity(repoPath) : {};
  const contextAvailable = harnessInstalled ? await hasLocalContextBranch(repoPath).catch(() => false) : false;
  const sync = await syncForStatus(repoPath, contextAvailable);
  const syncStatus = sync?.getStatus();
  const harnessUpdate = harnessInstalled ? await getHarnessUpdateStatus(repoPath) : { required: false, files: [] };
  return {
    installed,
    harnessInstalled,
    harnessUpdate,
    syncEnabled: syncStatus?.enabled ?? false,
    lastSyncAt: syncStatus?.lastSyncAt ?? null,
    pendingCount: syncStatus?.pendingCount ?? 0,
    lastError: syncStatus?.lastError ?? null,
    githubLogin: identity.githubLogin,
    githubUserId: identity.githubUserId,
    machineId: identity.machineId,
  };
}

export async function installProtocol(repoPath: string): Promise<ProtocolStatus> {
  const gitMeta = await readGitMetadata(repoPath);
  const machineId = await getMachineId(repoPath) ?? generateMachineId();

  // If git + GitHub remote available, do full install with team sync
  const repo = gitMeta.isGitRepository ? githubRepoFromRemote(gitMeta.remoteOrigin) : null;
  if (repo) {
    const identity = await resolveGitHubIdentity();
    const permission = await checkRepoPermission(repo, identity.login);
    if (permission !== "admin" && permission !== "write") return installLocalOnlyProtocol(repoPath, gitMeta, machineId, identity, repo, permission);

    const sync = syncInstances.get(repoPath) ?? new TeamworkSync(repoPath);
    await sync.ensureContextBranch(repo, identity.login);

    await installHarness(repoPath, {
      githubLogin: identity.login,
      githubUserId: identity.id,
      machineId,
      agent: "",
      repo,
    });

    sync.start();
    syncInstances.set(repoPath, sync);
    const syncStatus = sync.getStatus();
    return {
      installed: true,
      harnessInstalled: true,
      harnessUpdate: { required: false, files: [] },
      syncEnabled: syncStatus.enabled,
      lastSyncAt: syncStatus.lastSyncAt,
      pendingCount: syncStatus.pendingCount,
      lastError: syncStatus.lastError,
      githubLogin: identity.login,
      githubUserId: identity.id,
      machineId,
      repo,
      branch: gitMeta.currentBranch ?? undefined,
      permission,
    };
  }

  return installLocalOnlyProtocol(repoPath, gitMeta, machineId);
}

async function installLocalOnlyProtocol(
  repoPath: string,
  gitMeta: Awaited<ReturnType<typeof readGitMetadata>>,
  machineId: string,
  resolvedIdentity: { login: string; id: number } | null = null,
  repo?: string,
  permission?: string,
): Promise<ProtocolStatus> {
  // Local-only install: no git, no GitHub remote, or no write permission - tasks work but sync is unavailable
  let identity: { login: string; id: number } | null = null;
  if (resolvedIdentity) {
    identity = resolvedIdentity;
  } else {
    try { identity = await resolveGitHubIdentity(); } catch { /* gh CLI may not be available */ }
  }
  await installHarness(repoPath, {
    githubLogin: identity?.login ?? "unknown",
    githubUserId: identity?.id ?? 0,
    machineId,
    agent: "",
    repo,
  });

  return {
    installed: true,
    harnessInstalled: true,
    harnessUpdate: { required: false, files: [] },
    syncEnabled: false,
    lastSyncAt: null,
    pendingCount: 0,
    lastError: null,
    githubLogin: identity?.login,
    githubUserId: identity?.id,
    machineId,
    repo,
    branch: gitMeta.currentBranch ?? undefined,
    permission,
  };
}

async function assertContextCleanupOwner(repoPath: string): Promise<void> {
  const identity = await resolveGitHubIdentity();
  const gitMeta = await readGitMetadata(repoPath);
  const repo = githubRepoFromRemote(gitMeta.remoteOrigin);
  const owner = repo?.split("/")[0] ?? "";
  if (!repo || owner.toLowerCase() !== identity.login.toLowerCase()) {
    throw new Error("Only the repository owner can clean all task records.");
  }
}

function githubRepoFromRemote(remoteOrigin: string | null): string | null {
  const match = remoteOrigin?.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

function broadcastTelegramStatus(): void {
  if (!telegramService) return;
  const view = telegramService.getConfigView();
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channels.telegramStatusChanged, view);
  });
}

async function resolveTelegramMachineIdentity(runtime: IpcRuntime): Promise<MachineIdentity> {
  if (telegramMachineIdentity) return telegramMachineIdentity;
  let githubUserId: string | undefined;
  let machineId = "local";
  try {
    const config = await getConfiguredRoots(runtime);
    for (const projectPath of config.configuredProjects) {
      const identity = await getLocalHarnessIdentity(projectPath).catch(() => ({} as { githubUserId?: number | string; machineId?: string }));
      if (identity.machineId) machineId = identity.machineId;
      if (identity.githubUserId != null) githubUserId = String(identity.githubUserId);
      if (identity.machineId && identity.githubUserId != null) break;
    }
  } catch {
    // fall through to defaults
  }
  telegramMachineIdentity = { label: os.hostname(), githubUserId, machineId };
  return telegramMachineIdentity;
}

/** Read an agent session transcript as lines (Kiro `.jsonl`). Empty when unavailable. */
type HookSessionMeta = { projectPath: string; cwdUri: string; projectName: string; model: string | null; title: string | null; lastEventAt: string };

/** Index every project's hook sessions by session id (for enriching open tabs). */
async function buildHookSessionIndex(runtime: IpcRuntime): Promise<Map<string, HookSessionMeta>> {
  const config = await getConfiguredRoots(runtime);
  const index = new Map<string, HookSessionMeta>();
  for (const projectPath of config.configuredProjects) {
    const cwdUri = toLocalProjectUri(projectPath);
    const projectName = config.projectAliases[cwdUri] ?? nodePath.basename(projectPath);
    for (const session of parseHookSessions(projectPath)) {
      index.set(session.sessionId, { projectPath, cwdUri, projectName, model: session.model, title: session.title, lastEventAt: session.lastEventAt });
    }
  }
  return index;
}

function mapIslandState(state: string | undefined): "working" | "stopped" | "approval" | null {
  return state === "working" || state === "stopped" || state === "approval" ? state : null;
}

/** Read an agent session transcript as lines. Empty when unavailable. */
function readAgentTranscriptLines(agentId: string, hookSessionId: string): string[] {
  const normalized = agentId.toLowerCase();
  let file: string | null = null;
  if (normalized === "kiro") {
    file = nodePath.join(os.homedir(), ".kiro", "sessions", "cli", `${hookSessionId}.jsonl`);
  } else if (normalized === "codex") {
    file = findCodexTranscriptFile(hookSessionId);
  } else if (normalized === "claude") {
    file = findClaudeTranscriptFile(hookSessionId);
  }
  if (!file) return [];
  try {
    return nodeFs.readFileSync(file, "utf8").split("\n");
  } catch {
    return [];
  }
}

function findClaudeTranscriptFile(sessionId: string): string | null {
  if (!sessionId) return null;
  const cached = claudeTranscriptPathCache.get(sessionId);
  if (cached && nodeFs.existsSync(cached)) return cached;

  const root = nodePath.join(os.homedir(), ".claude", "projects");
  const byName = listJsonlFiles(root).find((file) => nodePath.basename(file) === `${sessionId}.jsonl`);
  if (byName) claudeTranscriptPathCache.set(sessionId, byName);
  return byName ?? null;
}

function findCodexTranscriptFile(sessionId: string): string | null {
  if (!sessionId) return null;
  const cached = codexTranscriptPathCache.get(sessionId);
  if (cached && nodeFs.existsSync(cached)) return cached;

  const root = nodePath.join(os.homedir(), ".codex", "sessions");
  const candidates = listJsonlFiles(root);
  const byName = candidates.find((file) => nodePath.basename(file).includes(sessionId));
  if (byName) {
    codexTranscriptPathCache.set(sessionId, byName);
    return byName;
  }

  const byMeta = candidates.find((file) => readCodexSessionId(file) === sessionId);
  if (byMeta) codexTranscriptPathCache.set(sessionId, byMeta);
  return byMeta ?? null;
}

function listJsonlFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: nodeFs.Dirent[];
    try {
      entries = nodeFs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = nodePath.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(file);
    }
  }
  return out;
}

function readCodexSessionId(file: string): string | null {
  let fd: number | null = null;
  try {
    fd = nodeFs.openSync(file, "r");
    const buffer = Buffer.alloc(64 * 1024);
    const bytes = nodeFs.readSync(fd, buffer, 0, buffer.length, 0);
    const chunk = buffer.toString("utf8", 0, bytes);
    for (const line of chunk.split("\n")) {
      if (!line) continue;
      const entry = JSON.parse(line) as { type?: string; payload?: { id?: unknown; originator?: unknown } };
      if (entry.type !== "session_meta") continue;
      if (entry.payload?.originator !== "codex-tui") return null;
      return typeof entry.payload?.id === "string" ? entry.payload.id : null;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try { nodeFs.closeSync(fd); } catch { /* ignore */ }
    }
  }
}

function createTelegramService(runtime: IpcRuntime): TelegramService {
  const deps: TelegramServiceDeps = {
    loadConfig: async () => (await getConfiguredRoots(runtime)).telegram ?? createDefaultTelegramConfig(),
    saveConfig: async (patch) => { await updateTelegramConfig(runtime, patch); },
    secretGet: () => telegramSecretStore.get(TELEGRAM_TOKEN_SECRET_ID),
    secretSet: (token) => telegramSecretStore.set(TELEGRAM_TOKEN_SECRET_ID, token),
    secretDelete: () => telegramSecretStore.delete(TELEGRAM_TOKEN_SECRET_ID),
    getMachineIdentity: () => resolveTelegramMachineIdentity(runtime),
    listSessions: async () => {
      const config = await getConfiguredRoots(runtime);
      const projects: ProjectRef[] = config.configuredProjects.map((projectPath) => {
        const cwdUri = toLocalProjectUri(projectPath);
        return {
          projectPath,
          cwdUri,
          projectName: config.projectAliases[cwdUri] ?? nodePath.basename(projectPath),
        };
      });
      const statuses = new Map<string, LiveStatus>(
        hookStateManager.getAllStatuses().map((entry) => [entry.sessionId, { state: entry.state, action: entry.action }]),
      );
      return buildSessionRows({ projects, parse: parseHookSessions, statuses });
    },
    listOpenSessions: async () => {
      const index = await buildHookSessionIndex(runtime);
      return latestIslandAgentTabs.map((tab) => {
        const hookId = typeof tab.hookSessionId === "string" && tab.hookSessionId ? tab.hookSessionId : undefined;
        const meta = hookId ? index.get(hookId) : undefined;
        const agentId = (tab.agentId ?? "") as string;
        return {
          sessionId: hookId ?? tab.sessionId,
          terminalId: tab.sessionId,
          projectPath: meta?.projectPath ?? "",
          cwdUri: meta?.cwdUri ?? "",
          projectName: tab.projectName ?? meta?.projectName ?? "",
          agentId,
          model: meta?.model ?? null,
          title: tab.title ?? meta?.title ?? null,
          subtitle: meta?.title ?? tab.lastPrompt ?? null,
          lastEventAt: meta?.lastEventAt ?? new Date().toISOString(),
          state: mapIslandState(tab.state),
        } satisfies import("../src/main/telegram/types.js").TelegramSessionRow;
      });
    },
    resolveOpenTerminal: (hookSessionId) => latestIslandAgentTabs.find((tab) => tab.hookSessionId === hookSessionId)?.sessionId ?? null,
    restoreSession: async (row) => {
      // Hand off to the renderer, which builds the restore command via the same
      // path as the project sessions panel (honoring Settings CLI config).
      const payload = {
        cwdUri: row.cwdUri,
        projectName: row.projectName,
        agentId: row.agentId,
        hookSessionId: row.sessionId,
      };
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(appChannels.restoreAgentSession, payload);
      });
    },
    inputTerminal: (terminalId, data) => { void requireCore().call("inputTerminal", [{ sessionId: terminalId, data }]).catch(() => {}); },
    currentStatus: (row) => {
      const status = hookStateManager.getStatus(row.projectPath, row.sessionId);
      return status ? { state: status.state, action: status.action } : null;
    },
    transcript: {
      cursor: (row) => readAgentTranscriptLines(row.agentId, row.sessionId).length,
      turnStartCursor: (row) => lastTurnStartIndex(row.agentId, readAgentTranscriptLines(row.agentId, row.sessionId)),
      answer: (row, cursor) => {
        const lines = readAgentTranscriptLines(row.agentId, row.sessionId);
        return extractAnswer(row.agentId, lines.slice(cursor));
      },
      progress: (row, cursor) => {
        const lines = readAgentTranscriptLines(row.agentId, row.sessionId);
        return progressSince(row.agentId, lines.slice(cursor));
      },
      supports: (agentId) => {
        const normalized = agentId.toLowerCase();
        return normalized === "kiro" || normalized === "codex" || normalized === "claude";
      },
    },
    listSessionTasks: async (projectPath, hookSessionId) => {
      if (!projectPath) return [];
      const tasks = await scanTasks(projectPath).catch(() => []);
      return tasks
        .filter((task) => task.sessionId === hookSessionId)
        .map((task) => ({ taskId: task.taskId, title: task.title, raw: task.rawMarkdown }));
    },
    listProjects: async () => {
      const config = await getConfiguredRoots(runtime);
      return config.configuredProjects.map((projectPath) => {
        const cwdUri = toLocalProjectUri(projectPath);
        return { cwdUri, projectName: config.projectAliases[cwdUri] ?? nodePath.basename(projectPath) };
      });
    },
    listAgents: async (cwdUri) => {
      const agents = await requireCore().call("listAgentClis", [runtime, { cwdUri }]).catch(() => [] as AgentCli[]);
      return agents.map((agent) => ({ id: agent.id, label: agent.label }));
    },
    launchSession: async (cwdUri, projectName, agentId) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(appChannels.launchAgentSession, { cwdUri, projectName, agentId });
      });
    },
    currentOpenTerminalIds: () => latestIslandAgentTabs.map((tab) => tab.sessionId),
    resolveHookForTerminal: (terminalId) => {
      const tab = latestIslandAgentTabs.find((t) => t.sessionId === terminalId);
      return (typeof tab?.hookSessionId === "string" && tab.hookSessionId) ? tab.hookSessionId : null;
    },
    onStatusChanged: broadcastTelegramStatus,
  };
  return new TelegramService(deps);
}

function handle<Payload, Result>(
  channel: string,
  callback: (payload: Payload) => Promise<Result>
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (_event, payload: Payload) => callback(payload));
}

export async function registerIpcHandlers(
  runtime: IpcRuntime,
  callbacks: IpcCallbacks = {}
): Promise<void> {
  if (!core) {
    core = await spawnCoreClient();
    const config = await getConfiguredRoots(runtime);
    await core.call("applyDisabledPlugins", [config.disabledPluginIds ?? []]);
  } else {
    core.removeAllListeners("terminalData");
    core.removeAllListeners("terminalUpdate");
    core.removeAllListeners("terminalExit");
  }
  agentSessionWatcher.removeAllListeners("status");
  browserManager.removeAllListeners("update");
  browserManager.removeAllListeners("foundInPage");
  core.on("terminalData", (event) => {
    terminalApprovalDetector.feed(event.sessionId, event.data);
    telegramService?.feedTerminalData(event.sessionId, event.data);
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalData, event);
    });
  });
  core.on("terminalUpdate", (event: TerminalUpdateEvent) => {
    if (event.session.pid != null && event.session.agentId) {
      terminalPidToId.set(event.session.pid, event.session.id);
      // Retry pending hook resolutions now that a new terminal PID is registered
      for (const [sessionId, pid] of pendingHookResolutions) {
        resolveTerminalForPid(pid).then((terminalId) => {
          if (!terminalId) return;
          hookSessionToTerminal.set(sessionId, terminalId);
          pendingHookResolutions.delete(sessionId);
          flushPendingPrompt(sessionId, terminalId);
          const state = hookStateManager.getStatus(null, sessionId);
          if (state) {
            const statusEvent: AgentProjectStatusEvent = {
              agentId: state.agent,
              projectPath: state.projectPath,
              sessionId: state.sessionId,
              text: state.action,
              timestamp: state.timestamp,
              hookState: state.state,
              pid: state.pid,
              terminalSessionId: terminalId,
            };
            BrowserWindow.getAllWindows().forEach((window) => {
              window.webContents.send(channels.agentStatus, statusEvent);
            });
          }
        });
      }
    }
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalUpdate, event);
    });
  });
  core.on("terminalExit", (event) => {
    terminalApprovalDetector.untrack(event.sessionId);
    telegramService?.feedTerminalExit(event.sessionId);
    for (const [pid, id] of terminalPidToId) {
      if (id === event.sessionId) { terminalPidToId.delete(pid); break; }
    }
    for (const [sid, tid] of hookSessionToTerminal) {
      if (tid === event.sessionId) hookSessionToTerminal.delete(sid);
    }
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.terminalExit, event);
    });
  });
  core.on("installLog", (event) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.installLog, event);
    });
  });
  agentSessionWatcher.on("status", (event: AgentProjectStatusEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.agentStatus, event);
    });
  });

  if (!tokenUsageDb) {
    tokenUsageDb = new TokenUsageDb(runtime.userDataPath);
    const collector = new TokenUsageCollector(tokenUsageDb);
    agentSessionWatcher.setUsageCollector(collector);
    collector.backfill().catch(() => {});
  }

  if (!promptStore) {
    promptStore = new SessionPromptStore(runtime.userDataPath);
  }

  agentSessionWatcher.start();

  // Hook-based agent status system
  hookBridge.removeAllListeners("event");
  hookBridge.on("event", (msg) => {
    if (tryHandleArtifactMessage(msg)) return;
    hookStateManager.handleMessage(msg);
  });
  hookStateManager.removeAllListeners("stateChange");
  hookStateManager.on("stateChange", (event) => {
    telegramService?.feedStatusChange({
      sessionId: event.sessionId,
      projectPath: event.projectPath,
      state: event.state,
      action: event.action,
      at: Date.parse(event.timestamp) || Date.now(),
    });
    if (event.lastPrompt && promptStore?.get(event.sessionId) !== event.lastPrompt) {
      promptStore?.record(event.sessionId, event.lastPrompt);
    }
    const cached = hookSessionToTerminal.get(event.sessionId);
    const sendStatus = (terminalSessionId?: string) => {
      const storedPrompt = promptStore?.get(event.sessionId) ?? undefined;
      const statusEvent: AgentProjectStatusEvent = {
        agentId: event.agent,
        projectPath: event.projectPath,
        sessionId: event.sessionId,
        text: event.action,
        timestamp: event.timestamp,
        hookState: event.state,
        pid: event.pid,
        terminalSessionId,
        lastPrompt: storedPrompt ?? event.lastPrompt,
      };
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(channels.agentStatus, statusEvent);
      });
    };

    if (cached) {
      sendStatus(cached);
      // Re-resolve if PID changed (session was re-restored in a new terminal)
      if (event.pid != null) {
        resolveTerminalForPid(event.pid).then((terminalId) => {
          if (terminalId && terminalId !== cached) {
            hookSessionToTerminal.set(event.sessionId, terminalId);
            flushPendingPrompt(event.sessionId, terminalId);
            sendStatus(terminalId);
          }
        });
      }
    } else if (event.pid != null) {
      resolveTerminalForPid(event.pid).then((terminalId) => {
        if (terminalId) {
          hookSessionToTerminal.set(event.sessionId, terminalId);
          pendingHookResolutions.delete(event.sessionId);
          flushPendingPrompt(event.sessionId, terminalId);
        } else {
          pendingHookResolutions.set(event.sessionId, event.pid!);
        }
        sendStatus(terminalId ?? undefined);
      });
    } else {
      sendStatus(undefined);
    }
  });
  hookBridge.start(runtime.userDataPath).catch(() => {});

  if (!telegramService) {
    telegramService = createTelegramService(runtime);
    telegramService.init().catch(() => {});
  }

  const requireTelegram = (): TelegramService => {
    if (!telegramService) telegramService = createTelegramService(runtime);
    return telegramService;
  };
  handle<void, TelegramConfigView>(channels.telegramGetConfig, async () => requireTelegram().getConfigView());
  handle<TelegramSetTokenInput, TelegramSetTokenResult>(channels.telegramSetToken, (payload) => requireTelegram().setToken(payload.token));
  handle<TelegramSetEnabledInput, TelegramConfigView>(channels.telegramSetEnabled, async (payload) => {
    await requireTelegram().setEnabled(payload.enabled);
    return requireTelegram().getConfigView();
  });
  handle<void, TelegramPairCodeResult>(channels.telegramGeneratePairCode, async () => requireTelegram().generatePairCode());
  handle<TelegramRevokeUserInput, TelegramConfigView>(channels.telegramRevokeUser, async (payload) => {
    await requireTelegram().revokeUser(payload.telegramUserId);
    return requireTelegram().getConfigView();
  });

  browserManager.on("update", (event: BrowserUpdateEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.browserUpdate, event);
    });
  });
  browserManager.on("foundInPage", (event: BrowserFoundInPageEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.browserFoundInPage, event);
    });
    if (isFindPopoverOpen() && activeFindBrowserId) {
      sendFindResult({ current: event.matches === 0 ? 0 : event.activeMatchOrdinal, total: event.matches });
      if (refocusPopoverOnResult) {
        refocusPopoverOnResult = false;
        focusFindPopover();
      }
    }
  });

  handle<void, AppConfig>(channels.listRoots, () => getConfiguredRoots(runtime));
  handle<ProjectConfigInput, AppConfig>(channels.addProject, (payload) => addConfiguredProject(runtime, payload));
  ipcMain.removeHandler(channels.cloneProject);
  ipcMain.handle(channels.cloneProject, async (event, payload: CloneProjectInput): Promise<CloneProjectResult> => {
    let parentPath = payload.parentPath?.trim();
    if (!parentPath) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return { cancelled: true };
      const result = await dialog.showOpenDialog(window, {
        title: "Select clone destination",
        properties: ["openDirectory"],
        message: "Choose where to clone the remote repository",
      });
      if (result.canceled || !result.filePaths[0]) return { cancelled: true };
      parentPath = result.filePaths[0];
    }
    return cloneProject(runtime, { ...payload, parentPath });
  });
  handle<RemoveProjectInput, AppConfig>(channels.removeProject, (payload) => removeConfiguredProject(runtime, payload));
  handle<RenameProjectInput, AppConfig>(channels.renameProject, (payload) => renameProject(runtime, payload));
  handle<CreateWorktreeInput, CreateWorktreeResult>(channels.createWorktree, (payload) => createWorktree(runtime, payload));
  ipcMain.removeHandler(channels.pickProjectFolder);
  ipcMain.handle(channels.pickProjectFolder, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { cancelled: true, paths: [] };
    const result = await dialog.showOpenDialog(window, {
      title: "Select project folder",
      properties: ["openDirectory"],
      message: "Choose a project directory to add",
    });
    return { cancelled: result.canceled, paths: result.filePaths };
  });
  handle<AppearanceThemeInput, AppConfig>(channels.setAppearanceTheme, (payload) =>
    setAppearanceTheme(runtime, payload).then((config) => {
      callbacks.onAppearanceThemeChanged?.(config.appearanceTheme);
      return config;
    })
  );
  handle<StatusChangeNotificationsInput, AppConfig>(channels.setStatusChangeNotifications, (payload) =>
    setStatusChangeNotificationsEnabled(runtime, payload).then((config) => {
      callbacks.onStatusChangeNotificationsChanged?.(config);
      return config;
    })
  );
  handle<ProjectScanInput | undefined, ScanProjectsResult>(channels.scanProjects, (payload) =>
    requireCore().call("scanProjects", [runtime, payload])
  );
  handle<{ projectUri: string }, ProjectDetail>(channels.getProjectDetail, (payload) =>
    requireCore().call("getProjectDetail", [runtime, payload])
  );
  handle<{ projectUri: string }, GitHubInfo>(channels.readProjectGitHub, (payload) =>
    requireCore().call("readProjectGitHub", [runtime, payload])
  );
  handle<ProjectFilesInput, ProjectFilesResult>(channels.listProjectFiles, (payload) =>
    requireCore().call("listProjectFiles", [runtime, payload])
  );
  handle<ReadFileInput, ReadFileResult>(channels.readProjectFile, (payload) =>
    requireCore().call("readProjectFile", [runtime, payload])
  );
  handle<WriteFileInput, WriteFileResult>(channels.writeProjectFile, (payload) =>
    requireCore().call("writeProjectFile", [runtime, payload])
  );
  handle<DeleteFileInput, DeleteFileResult>(channels.deleteProjectFile, (payload) =>
    requireCore().call("deleteProjectFile", [runtime, payload])
  );
  handle<RenameFileInput, RenameFileResult>(channels.renameProjectFile, (payload) =>
    requireCore().call("renameProjectFile", [runtime, payload])
  );
  handle<{ projectUri: string }, CodeGraphProjectStatus>(channels.codeGraphGetStatus, (payload) =>
    requireCore().call("readCodeGraphStatus", [runtime, payload])
  );
  handle<{ projectUri: string }, CodeGraphProjectStatus>(channels.codeGraphEnsureStatus, (payload) =>
    requireCore().call("ensureCodeGraphStatus", [runtime, payload])
  );
  handle<{ cwdUri?: string } | undefined, AgentCli[]>(channels.listAgentClis, (payload) =>
    requireCore().call("listAgentClis", [runtime, payload])
  );
  handle<ListInstallRecipesInput, InstallRecipe[]>(channels.listInstallRecipes, (payload) =>
    requireCore().call("listInstallRecipes", [runtime, payload])
  );
  handle<InstallToolInput, InstallToolResult>(channels.installTool, (payload) =>
    requireCore().call("installTool", [runtime, payload])
  );
  handle<{ agentId: string; enabled: boolean }, void>(channels.setHooksEnabled, async (payload) => {
    const connector = hookConnectors.get(payload.agentId);
    if (!connector) return;
    if (payload.enabled) {
      const { join } = await import("node:path");
      const hookCliPath = join(runtime.userDataPath, "bin", "sharkbay-hook");
      await connector.install(hookCliPath, hookBridge.path);
    } else {
      await connector.uninstall();
    }
  });
  handle<{ repoPath: string }, import("../src/shared/types.js").HookSessionViewModel[]>(channels.hookGetSessions, async (payload) => {
    return parseHookSessions(payload.repoPath);
  });
  handle<PathExistsInput, PathExistsResult>(channels.pathExistsOnTarget, (payload) =>
    requireCore().call("pathExistsOnTarget", [runtime, payload])
  );
  handle<void, PluginSummary[]>(channels.listPlugins, () =>
    requireCore().call("listPlugins", [])
  );
  handle<{ pluginId: string; enabled: boolean }, PluginSummary[]>(channels.setPluginEnabled, async (payload) => {
    const config = await setPluginEnabledConfig(runtime, payload.pluginId, payload.enabled);
    const plugins = await requireCore().call("setPluginEnabled", [payload.pluginId, payload.enabled]);
    if (payload.pluginId === CODEGRAPH_PLUGIN_ID && !payload.enabled) {
      const projectUris = config.configuredProjects.map((projectPath) => toLocalProjectUri(projectPath));
      await requireCore().call("removeCodeGraphIndexes", [runtime, { projectUris }]);
    }
    return plugins;
  });
  handle<void, DiagnosticsSnapshot>(channels.readDiagnostics, () =>
    requireCore().call("readDiagnostics", [])
  );
  ipcMain.removeHandler(channels.createBrowser);
  ipcMain.handle(channels.createBrowser, (event, payload: BrowserCreateInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("Browser window not found");
    }
    return browserManager.create(window, payload);
  });
  handle<BrowserNavigateInput, BrowserSession>(channels.browserNavigate, (payload) =>
    Promise.resolve(browserManager.navigate(payload))
  );
  handle<BrowserResizeInput, BrowserSession>(channels.browserResize, (payload) =>
    Promise.resolve(browserManager.resize(payload))
  );
  handle<BrowserCloseInput, BrowserSession>(channels.browserClose, (payload) =>
    Promise.resolve(browserManager.close(payload))
  );
  handle<BrowserActionInput, BrowserSession>(channels.browserGoBack, (payload) =>
    Promise.resolve(browserManager.goBack(payload))
  );
  handle<BrowserActionInput, BrowserSession>(channels.browserGoForward, (payload) =>
    Promise.resolve(browserManager.goForward(payload))
  );
  handle<BrowserActionInput, BrowserSession>(channels.browserReload, (payload) =>
    Promise.resolve(browserManager.reload(payload))
  );
  handle<BrowserFindInput, void>(channels.browserFind, (payload) => {
    browserManager.find(payload);
    return Promise.resolve();
  });
  handle<BrowserStopFindInput, void>(channels.browserStopFind, (payload) => {
    browserManager.stopFind(payload);
    return Promise.resolve();
  });
  ipcMain.removeHandler(channels.findPopoverOpen);
  ipcMain.handle(channels.findPopoverOpen, (event, payload: FindPopoverOpenInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    activeFindBrowserId = payload.browserId;
    lastFindQuery = "";
    browserManager.stopFind({ browserId: payload.browserId });
    showFindPopover(window, { anchor: payload.anchor, theme: payload.theme });
  });
  handle<void, void>(channels.findPopoverClose, () => {
    closeFindPopover();
    if (activeFindBrowserId) browserManager.stopFind({ browserId: activeFindBrowserId });
    activeFindBrowserId = null;
    lastFindQuery = "";
    return Promise.resolve();
  });
  ipcMain.on(channels.findPopoverQuery, (_event, text: string) => {
    if (!activeFindBrowserId) return;
    lastFindQuery = typeof text === "string" ? text : "";
    if (!lastFindQuery) {
      browserManager.stopFind({ browserId: activeFindBrowserId });
      sendFindResult({ current: 0, total: 0 });
      return;
    }
    // Use findNext:true even for the initial search: Electron reliably emits
    // `found-in-page` (with the match count) for findNext:true, whereas a
    // findNext:false request often does not. For a freshly-changed term this
    // still starts a new search and selects the first match.
    refocusPopoverOnResult = true;
    browserManager.find({ browserId: activeFindBrowserId, text: lastFindQuery, findNext: true, forward: true });
  });
  ipcMain.on(channels.findPopoverStep, (_event, forward: boolean) => {
    if (!activeFindBrowserId || !lastFindQuery) return;
    refocusPopoverOnResult = true;
    browserManager.find({ browserId: activeFindBrowserId, text: lastFindQuery, findNext: true, forward: forward !== false });
  });
  ipcMain.on(channels.findPopoverDismiss, () => {
    closeFindPopover();
    if (activeFindBrowserId) browserManager.stopFind({ browserId: activeFindBrowserId });
    activeFindBrowserId = null;
    lastFindQuery = "";
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(appChannels.findClosed);
    });
  });
  handle<TerminalCreateInput, TerminalSession>(channels.createTerminal, async (payload) => {
    const session = await requireCore().call("createTerminal", [runtime, payload]);
    if (session.pid != null && session.agentId) {
      terminalPidToId.set(session.pid, session.id);
    }
    if (session.agentId === "kiro") {
      const cwd = session.cwdUri.startsWith("local:") ? decodeURI(session.cwdUri.slice(6)) : session.cwdUri.replace(/^file:\/\//, "");
      terminalApprovalDetector.track(session.id, "kiro", cwd);
    }
    return session;
  });
  handle<TerminalInput, TerminalSession | null>(channels.terminalInput, (payload) =>
    requireCore().call("inputTerminal", [payload])
  );
  ipcMain.on(channels.terminalInput, (_event, payload: TerminalInput) => {
    void requireCore().call("inputTerminal", [payload]);
  });
  handle<TerminalResizeInput, TerminalSession | null>(channels.resizeTerminal, (payload) =>
    requireCore().call("resizeTerminal", [payload])
  );
  handle<TerminalCloseInput, TerminalSession | null>(channels.closeTerminal, (payload) =>
    requireCore().call("closeTerminal", [payload])
  );

  handle<TasksGetInput, TaskViewModel[]>(channels.protocolGetTasks, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    const tasks = await scanTasks(repoPath);
    if (!taskWatcherCleanups.has(repoPath)) {
      const cleanup = watchTasks(repoPath, (updated) => {
        const event: TasksChangedEvent = { repoPath, tasks: updated };
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send(channels.protocolTasksChanged, event);
        });
      });
      taskWatcherCleanups.set(repoPath, cleanup);
    }
    return tasks;
  });

  handle<{ repoPath: string }, ProtocolStatus>(channels.protocolGetStatus, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return getProtocolStatus(repoPath);
  });

  handle<void, GitHubIdentity>(channels.protocolResolveIdentity, async () => resolveGitHubIdentity());

  handle<ProtocolInstallInput, ProtocolStatus>(channels.protocolInstall, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return installProtocol(repoPath);
  });

  handle<{ repoPath: string }, ProtocolStatus>(channels.protocolEnable, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return installProtocol(repoPath);
  });

  handle<ProtocolUninstallInput, ProtocolUninstallResult>(channels.protocolUninstall, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    const sync = syncInstances.get(repoPath);
    sync?.stop();
    syncInstances.delete(repoPath);

    let contextBranchDeleted = false;
    if (payload.cleanTeamContext) {
      await assertContextCleanupOwner(repoPath);
      contextBranchDeleted = await deleteTeamContextBranch(repoPath);
    }

    const result = await uninstallHarness(repoPath);
    const cleanup = taskWatcherCleanups.get(repoPath);
    cleanup?.();
    taskWatcherCleanups.delete(repoPath);
    const event: TasksChangedEvent = { repoPath, tasks: [] };
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channels.protocolTasksChanged, event);
    });
    return { ...result, contextBranchDeleted };
  });

  handle<{ repoPath: string }, void>(channels.protocolSyncNow, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    let sync = syncInstances.get(repoPath);
    if (!sync) {
      sync = new TeamworkSync(repoPath);
      sync.start();
      syncInstances.set(repoPath, sync);
    }
    await sync.syncOnce();
  });

  handle<{ repoPath: string }, ProtocolStatus>(channels.protocolUpdateHarness, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    await updateHarnessFiles(repoPath);
    return getProtocolStatus(repoPath);
  });

  handle<{ repoPath: string }, KnowledgeSiteResult>(channels.knowledgeSiteGenerate, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return generateKnowledgeSite(repoPath);
  });

  handle<{ repoPath: string }, string>(channels.knowledgeSiteGetPath, async (payload) => {
    const repoPath = await resolveProtocolRepoPath(runtime, payload.repoPath);
    return getKnowledgeSitePath(repoPath);
  });

  handle<{ periodDays?: number } | undefined, UsageSummary>(channels.usageGetSummary, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    return tokenUsageDb!.getSummary(payload?.periodDays ?? 1, config.configuredProjects);
  });

  handle<UsageReportFilter, UsageReportResult>(channels.usageGetReport, async (payload) => {
    const config = await getConfiguredRoots(runtime);
    return tokenUsageDb!.getReport(payload ?? {}, config.configuredProjects);
  });

  handle<{ url: string }, void>(channels.openExternal, async (payload) => {
    await shell.openExternal(payload.url);
  });

  handle<ShareArtifactInput, ShareArtifactResult>(channels.shareArtifact, async (payload) => {
    return shareLocalArtifact(payload);
  });

  ipcMain.removeHandler(channels.sharePopover);
  ipcMain.handle(channels.sharePopover, (event, payload: ShowSharePopoverInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) showSharePopover(window, payload);
  });

  ipcMain.handle(channels.islandGetAllSessions, () => {
    return hookStateManager.getAllStatuses().map((entry) => {
      const statusEvent: AgentProjectStatusEvent = {
        agentId: entry.agent,
        projectPath: entry.projectPath,
        sessionId: entry.sessionId,
        text: entry.action,
        timestamp: entry.timestamp,
        hookState: entry.state,
        pid: entry.pid,
        terminalSessionId: hookSessionToTerminal.get(entry.sessionId),
      };
      return statusEvent;
    });
  });

  ipcMain.on(channels.islandFocusSession, (_event, terminalSessionId: string) => {
    const allWindows = BrowserWindow.getAllWindows();
    const mainWin = allWindows.find((w) => !w.isAlwaysOnTop());
    const islandWin = allWindows.find((w) => w.isAlwaysOnTop());
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
      mainWin.webContents.send("app:focusTerminalSession", terminalSessionId);
    }
    if (islandWin && !islandWin.isDestroyed()) {
      islandWin.webContents.send("island:collapse");
    }
  });

  ipcMain.on(channels.islandTabsSync, (_event, tabs: unknown) => {
    if (Array.isArray(tabs)) {
      latestIslandAgentTabs = tabs as typeof latestIslandAgentTabs;
    }
    const islandWin = BrowserWindow.getAllWindows().find((w) => w.isAlwaysOnTop());
    if (!islandWin || islandWin.isDestroyed()) return;
    // Inject the authoritative lastPrompt from the store. The main process
    // owns the agent-session → terminal mapping and the prompt store, so it
    // resolves prompts reliably regardless of hook event timing on restore.
    let enriched = tabs;
    if (Array.isArray(tabs)) {
      enriched = tabs.map((tab) => {
        const t = tab as { sessionId?: string; lastPrompt?: string };
        if (!t.sessionId) return tab;
        const agentSessionId = findAgentSessionForTerminal(t.sessionId);
        const stored = agentSessionId ? promptStore?.get(agentSessionId) : null;
        return stored ? { ...t, lastPrompt: stored } : tab;
      });
    }
    islandWin.webContents.send("island:tabs", enriched);
  });

  ipcMain.on(channels.recordSessionPrompt, (_event, input: { terminalSessionId: string; text: string }) => {
    if (!promptStore || !input?.terminalSessionId || !input?.text) return;
    const agentSessionId = findAgentSessionForTerminal(input.terminalSessionId);
    if (agentSessionId) {
      if (promptStore.get(agentSessionId) !== input.text) promptStore.record(agentSessionId, input.text);
    } else {
      pendingPromptsByTerminal.set(input.terminalSessionId, [...(pendingPromptsByTerminal.get(input.terminalSessionId) ?? []), input.text]);
    }
  });

  ipcMain.handle(channels.loadSessionPromptHistory, (_event, input: { sessionId: string }) => {
    if (!promptStore || !input?.sessionId) return [];
    // Try direct lookup first
    const direct = promptStore.getHistory(input.sessionId);
    if (direct.length) return direct;
    // If the key is a terminal session id, resolve to hook session id
    const hookId = findAgentSessionForTerminal(input.sessionId);
    if (hookId) return promptStore.getHistory(hookId);
    return [];
  });

  ipcMain.on(channels.recordPromptHistoryEntry, (_event, input: { key: string; text: string }) => {
    if (!promptStore || !input?.key || !input?.text) return;
    promptStore.record(input.key, input.text);
  });
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findAgentSessionForTerminal(terminalSessionId: string, agentId?: string): string | null {
  const statuses = new Map(hookStateManager.getAllStatuses().map((entry) => [entry.sessionId, entry]));
  let fallback: string | null = null;
  let latest: { sessionId: string; timestamp: number } | null = null;
  for (const [sid, tid] of hookSessionToTerminal) {
    if (tid !== terminalSessionId) continue;
    const status = statuses.get(sid);
    if (agentId && (!status || status.agent !== agentId)) continue;
    fallback = sid;
    if (!status) continue;
    const timestamp = timestampValue(status.timestamp);
    if (!latest || timestamp >= latest.timestamp) {
      latest = { sessionId: sid, timestamp };
    }
  }
  return latest?.sessionId ?? fallback;
}

function flushPendingPrompt(agentSessionId: string, terminalId: string): void {
  const pending = pendingPromptsByTerminal.get(terminalId);
  if (pending?.length && promptStore) {
    for (const text of pending) promptStore.record(agentSessionId, text);
    pendingPromptsByTerminal.delete(terminalId);
  }
}
