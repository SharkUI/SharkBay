import * as os from "node:os";
import * as nodePath from "node:path";
import * as nodeFs from "node:fs";
import { getConfiguredRoots, createDefaultTelegramConfig, updateTelegramConfig } from "../main/config.js";
import { getLocalHarnessIdentity } from "../main/harness.js";
import { toLocalProjectUri } from "../core/project-uri.js";
import { parseHookSessions } from "../main/hooks/sessions.js";
import { scanTasks } from "../main/tasks.js";
import { createDefaultSecretStore } from "../main/secrets.js";
import { TelegramService, type TelegramServiceDeps, type MachineIdentity } from "../main/telegram/service.js";
import { buildSessionRows, type ProjectRef, type LiveStatus } from "../main/telegram/session-registry.js";
import { extractAnswer, lastTurnStartIndex, progressSince } from "../main/telegram/transcript.js";
import type { AgentCli, RuntimePaths } from "../shared/types.js";
import type { CoreRuntime } from "../core/core-runtime.js";
import type { createAgentRuntime } from "./agent-runtime.js";

export function createRuntimeTelegram(runtime: RuntimePaths, core: CoreRuntime, agents: ReturnType<typeof createAgentRuntime>, emit: (name: string, payload: unknown) => void) {
  const { hookStateManager } = agents;
  const telegramSecretStore = createDefaultSecretStore();
  const TELEGRAM_TOKEN_SECRET_ID = "telegram-bot-token";
  let telegramMachineIdentity: MachineIdentity | null = null;
  const codexTranscriptPathCache = new Map<string, string>();
  const claudeTranscriptPathCache = new Map<string, string>();
  let latestIslandAgentTabs: Array<{ sessionId: string; hookSessionId?: string; title?: string; projectName?: string; agentId?: string; state?: string; lastPrompt?: string }> = [];
  const broadcastTelegramStatus = () => emit("telegram:statusChanged", service.getConfigView());
async function resolveTelegramMachineIdentity(runtime: RuntimePaths): Promise<MachineIdentity> {
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
async function buildHookSessionIndex(runtime: RuntimePaths): Promise<Map<string, HookSessionMeta>> {
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

function createTelegramService(runtime: RuntimePaths): TelegramService {
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
        } satisfies import("../main/telegram/types.js").TelegramSessionRow;
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
      emit("desktop:restoreAgentSession", payload);
    },
    inputTerminal: (terminalId, data) => { void Promise.resolve(core.inputTerminal({ sessionId: terminalId, data })).catch(() => {}); },
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
      const agents = await core.listAgentClis(runtime, { cwdUri }).catch(() => [] as AgentCli[]);
      return agents.map((agent) => ({ id: agent.id, label: agent.label }));
    },
    launchSession: async (cwdUri, projectName, agentId) => {
      emit("desktop:launchAgentSession", { cwdUri, projectName, agentId });
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

  const service = createTelegramService(runtime);
  let initialization: Promise<void> | undefined;
  const onData = (event: { sessionId: string; data: string }) => service.feedTerminalData(event.sessionId, event.data);
  const onExit = (event: { sessionId: string }) => service.feedTerminalExit(event.sessionId);
  const onStatus = (event: { sessionId: string; projectPath: string; state: "working" | "stopped" | "approval"; action: string; timestamp: string }) => service.feedStatusChange({ sessionId: event.sessionId, projectPath: event.projectPath, state: event.state, action: event.action, at: Date.parse(event.timestamp) || Date.now() });
  core.on("terminalData", onData); core.on("terminalExit", onExit); hookStateManager.on("stateChange", onStatus);
  return { service, init: () => initialization ??= service.init(), setTabs: (tabs: typeof latestIslandAgentTabs) => { latestIslandAgentTabs = tabs; }, async dispose() { core.off("terminalData", onData); core.off("terminalExit", onExit); hookStateManager.off("stateChange", onStatus); await service.stop(); } };
}
