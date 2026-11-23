import { ProgramStatusReader } from "../main/hooks/program-status.js";
import { execFile } from "node:child_process";
import { HookBridge } from "../main/hooks/bridge.js";
import { AgentHookStateManager } from "../main/hooks/state-manager.js";
import { SessionPromptStore } from "../main/hooks/prompt-store.js";
import { AgentSessionWatcher } from "../main/agent-clis.js";
import { TerminalApprovalDetector } from "../main/hooks/terminal-approval-detector.js";
import { ClaudeConnector, CodexConnector, QwenConnector } from "../main/hooks/connectors/claude-family.js";
import { GeminiConnector } from "../main/hooks/connectors/gemini.js";
import { KiroConnector } from "../main/hooks/connectors/kiro.js";
import { ReasonixConnector } from "../main/hooks/connectors/reasonix.js";
import { OpenCodeConnector } from "../main/hooks/connectors/opencode.js";
import { CursorConnector } from "../main/hooks/connectors/cursor.js";
import type { AgentConnector, HookBridgeMessage } from "../main/hooks/types.js";
import { ReviewRunManager } from "../main/review-runs.js";
import { ArtifactRunManager } from "../main/artifact-runs.js";
import { ReviewControlServer, type ReviewControlRequest } from "../main/review-control-server.js";
import { reserveArtifactPath, reserveReviewPath } from "../main/harness.js";
import { scanTasks } from "../main/tasks.js";
import { applicationEvents as channels } from "../shared/application-events.js";
import type { CoreRuntime } from "../core/core-runtime.js";
import type { SharkBayCoreServiceEvents } from "../core/core-service.js";
import type { RuntimePaths, TerminalSession, ArtifactReadyEvent, ArtifactRun, ArtifactRunStartedEvent, AgentProjectStatusEvent, TerminalUpdateEvent, ReviewRun, ReviewRunStartedEvent, ReviewRunUpdatedEvent } from "../shared/types.js";

export type AgentRuntimeOptions = {
  emit: (channel: string, payload: unknown) => void;
  resolveRepoPath: (value: string) => Promise<string>;
  socketDir?: string;
};

export function createAgentRuntime(runtime: RuntimePaths, core: CoreRuntime, options: AgentRuntimeOptions) {
  let reviewRunManager: ReviewRunManager | null = null;
  let artifactRunManager: ArtifactRunManager | null = null;
  let reviewControlServer: ReviewControlServer | null = null;
  const agentSessionWatcher = new AgentSessionWatcher();
  const hookBridge = new HookBridge({ socketDir: options.socketDir });
  hookBridge.on("error", () => console.error("Invalid agent hook message rejected"));
  const hookStateManager = new AgentHookStateManager();
  const promptStore = new SessionPromptStore(runtime.userDataPath);
  const hookConnectors = new Map<string, AgentConnector>([
    ["claude", new ClaudeConnector()], ["codex", new CodexConnector()], ["qwen", new QwenConnector()],
    ["reasonix", new ReasonixConnector()], ["gemini", new GeminiConnector()], ["kiro", new KiroConnector()],
    ["opencode", new OpenCodeConnector()], ["cursor", new CursorConnector()],
  ]);
  for (const connector of hookConnectors.values()) hookStateManager.registerConnector(connector);
  const terminalApprovalDetector = new TerminalApprovalDetector();
  terminalApprovalDetector.setCallback((event) => {
    const hookSessionId = findAgentSessionForTerminal(event.terminalSessionId, event.agentId);
    if (hookSessionId) hookStateManager.injectEvent({ agent: event.agentId, sessionId: hookSessionId, event: "attention", timestamp: new Date().toISOString(), cwd: event.cwd });
  });
  const terminalSessions = new Map<string, TerminalSession>();
  const programStatusReaders = new Map<string, ProgramStatusReader>();
  const terminalPidToId = new Map<number, string>();
  const hookSessionToTerminal = new Map<string, string>();
  const pendingHookResolutions = new Map<string, number>();
  const lastHookPromptByTerminal = new Map<string, string>();
  const pendingPromptsByTerminal = new Map<string, string[]>();
  const pendingCodexPrompts = new Map<string, string>();
  const subscriptions: Array<() => void> = [];
  function listenCore<K extends keyof SharkBayCoreServiceEvents>(name: K, listener: (...args: SharkBayCoreServiceEvents[K]) => void) {
    core.on(name, listener as never);
    subscriptions.push(() => core.off(name, listener as never));
  }
  let started = false;
  async function start() {
    if (started) return;
    started = true;
    await ensureReviewOrchestration(runtime);
    listenCore("terminalData", (event) => {
      terminalApprovalDetector.feed(event.sessionId, event.data);
      const session = terminalSessions.get(event.sessionId);
      if (session?.agentId) {
        let reader = programStatusReaders.get(event.sessionId);
        if (!reader) { reader = new ProgramStatusReader(); programStatusReaders.set(event.sessionId, reader); }
        for (const report of reader.feed(event.data)) hookStateManager.ingestProgramStatus({
          agent: session.agentId, sessionId: findAgentSessionForTerminal(session.id) ?? session.id,
          terminalSessionId: session.id, cwd: localPathFromUri(session.cwdUri), event: "tool_start", timestamp: new Date().toISOString(),
        }, report);
        const reply = reader.takeQueryReply();
        if (reply) core.inputTerminal({ sessionId: session.id, data: reply });
      }
      options.emit(channels.terminalData, event);
    });
    listenCore("terminalUpdate", (event: TerminalUpdateEvent) => {
      if (event.reason === "closed") { lastHookPromptByTerminal.delete(event.session.id); pendingPromptsByTerminal.delete(event.session.id); hookStateManager.forgetTerminal(event.session.id); terminalSessions.delete(event.session.id); programStatusReaders.delete(event.session.id); }
      else terminalSessions.set(event.session.id, event.session);
      if (event.session.pid != null && event.session.agentId) {
        terminalPidToId.set(event.session.pid, event.session.id);
        // Retry pending hook resolutions now that a new terminal PID is registered
        for (const [sessionId, pid] of pendingHookResolutions) {
          resolveTerminalForPid(pid).then((terminalId) => {
            const state = hookStateManager.getStatus(null, sessionId);
            if (!terminalId || pendingHookResolutions.get(sessionId) !== pid || state?.pid !== pid) return;
            hookSessionToTerminal.set(sessionId, terminalId);
            pendingHookResolutions.delete(sessionId);
            flushPendingPrompt(sessionId, terminalId);
            if (state) {
              const statusEvent: AgentProjectStatusEvent = {
                agentId: state.agent,
                projectPath: state.projectPath,
                sessionId: state.sessionId,
                text: state.action,
                timestamp: state.timestamp,
                hookState: state.state,
                evidence: state.evidence,
                pid: state.pid,
                terminalSessionId: terminalId,
              };
              options.emit(channels.agentStatus, statusEvent);
            }
          });
        }
      }
      options.emit(channels.terminalUpdate, event);
    });
    listenCore("terminalExit", (event) => {
      pendingCodexPrompts.delete(event.sessionId);
      const session = terminalSessions.get(event.sessionId);
      hookStateManager.finishTerminal(event.sessionId, event.exitCode !== 0, session?.agentId ? { agent: session.agentId, sessionId: session.id, terminalSessionId: session.id, cwd: localPathFromUri(session.cwdUri), event: "session_end", timestamp: new Date().toISOString() } : undefined);
      programStatusReaders.delete(event.sessionId);
      reviewRunManager?.handleTerminalExit(event.sessionId);
      artifactRunManager?.handleTerminalExit(event.sessionId);
      terminalApprovalDetector.untrack(event.sessionId);
      for (const [pid, id] of terminalPidToId) {
        if (id === event.sessionId) { terminalPidToId.delete(pid); break; }
      }
      for (const [sid, tid] of hookSessionToTerminal) {
        if (tid === event.sessionId) hookSessionToTerminal.delete(sid);
      }
      options.emit(channels.terminalExit, event);
    });
    listenCore("installLog", (event) => {
      options.emit(channels.installLog, event);
    });
    agentSessionWatcher.on("status", (event: AgentProjectStatusEvent) => {
      options.emit(channels.agentStatus, event);
    });

    // Hook-based agent status system
    hookBridge.removeAllListeners("event");
    hookBridge.on("event", (msg) => {
      if (tryHandleArtifactMessage(msg)) return;
      if (msg.launchToken && msg.launchToken !== msg.terminalSessionId) return;
      if (msg.source === "codex") {
        const attributed = attributeCodexMessage(msg);
        if (!attributed) return;
        msg = attributed;
      }
      if (msg.terminalSessionId) {
        const session = terminalSessions.get(msg.terminalSessionId);
        if (!session || session.status !== "running" || (msg.launchToken && msg.launchToken !== session.id)) return;
        if (session.statusHooksDisabled && session.agentId === msg.source) return;
      } else if (msg.source === "opencode" && msg.pid != null &&
        [...terminalSessions.values()].some(session => session.agentId === "opencode" && session.statusHooksDisabled)) {
        // Older globally installed OpenCode plugins do not send the launch identity.
        const pid = msg.pid;
        void resolveTerminalForPid(pid).then(id => {
          const session = id ? terminalSessions.get(id) : undefined;
          if (session?.agentId === "opencode" && session.statusHooksDisabled) return;
          hookStateManager.handleMessage(msg);
        });
        return;
      }
      hookStateManager.handleMessage(msg);
    });
    hookStateManager.removeAllListeners("stateChange");
    hookStateManager.on("stateChange", (event) => {

      if (event.lastPrompt && promptStore?.get(event.sessionId) !== event.lastPrompt) {
        promptStore?.record(event.sessionId, event.lastPrompt);
      }
      if (event.terminalSessionId) { hookSessionToTerminal.set(event.sessionId, event.terminalSessionId); flushPendingPrompt(event.sessionId, event.terminalSessionId); }
      const sendStatus = (terminalSessionId?: string) => {
        if (terminalSessionId && event.lastPrompt && lastHookPromptByTerminal.get(terminalSessionId) !== event.lastPrompt) {
          lastHookPromptByTerminal.set(terminalSessionId, event.lastPrompt);
          promptStore.record(terminalSessionId, event.lastPrompt);
        }
        const storedPrompt = terminalSessionId ? promptStore.get(terminalSessionId) : promptStore.get(event.sessionId);
        const statusEvent: AgentProjectStatusEvent = {
          agentId: event.agent,
          projectPath: event.projectPath,
          sessionId: event.sessionId,
          text: event.action,
          timestamp: event.timestamp,
          hookState: event.state,
          evidence: event.evidence,
          pid: event.pid,
          terminalSessionId,
          lastPrompt: storedPrompt ?? event.lastPrompt,
        };
        options.emit(channels.agentStatus, statusEvent);
      };

      if (event.terminalSessionId) {
        sendStatus(event.terminalSessionId);
      } else if (event.pid != null) {
        resolveTerminalForPid(event.pid).then((terminalId) => {
          const current = hookStateManager.getStatus(event.projectPath, event.sessionId);
          if (current?.evidence.revision !== event.evidence.revision) return;
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
    await hookBridge.start(runtime.userDataPath);

    agentSessionWatcher.start();
  }
  async function stop() {
    await agentSessionWatcher.stop();
    reviewRunManager?.dispose();
    artifactRunManager?.dispose();
    await reviewControlServer?.stop();
    await hookBridge.stop();
    hookStateManager.dispose();
    terminalSessions.clear(); programStatusReaders.clear(); lastHookPromptByTerminal.clear();
    pendingCodexPrompts.clear();
    promptStore.flushSync();
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  }

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

  function attributeCodexMessage(msg: HookBridgeMessage): HookBridgeMessage | null {
    const event = hookConnectors.get("codex")?.normalize(msg.payload);
    if (!event?.sessionId) return null;
    const normalizePrompt = (text: string) => text.replace(/\s+/g, " ").trim();
    const matchingInputs = event.event === "prompt" && event.prompt ? [...pendingCodexPrompts].filter(([id, prompt]) => {
      const terminal = terminalSessions.get(id);
      return terminal?.status === "running" && terminal.agentId === "codex"
        && localPathFromUri(terminal.cwdUri) === event.cwd && prompt === normalizePrompt(event.prompt!);
    }) : [];
    const declared = msg.terminalSessionId ? hookStateManager.getStatusForTerminal(msg.terminalSessionId) : null;
    const owners = hookStateManager.getAllStatuses().filter(row => row.agent === "codex" && row.projectPath === event.cwd
      && row.sessionId === event.sessionId && row.terminalSessionId && terminalSessions.get(row.terminalSessionId)?.status === "running");
    if (matchingInputs.length > 1 && declared?.sessionId !== event.sessionId && owners.length !== 1) return null;
    // Codex's shared daemon can keep the first client's environment for every thread.
    // A locally submitted prompt or an established provider binding outranks that environment.
    const terminalId = matchingInputs.length === 1 ? matchingInputs[0]![0]
      : declared?.sessionId === event.sessionId ? msg.terminalSessionId
      : msg.terminalSessionId && (!declared || declared.sessionId === msg.terminalSessionId) ? msg.terminalSessionId
      : owners.length === 1 ? owners[0]!.terminalSessionId
      : undefined;
    if (!terminalId) return msg.terminalSessionId ? null : msg;
    if (event.event === "prompt") pendingCodexPrompts.delete(terminalId);
    return { ...msg, terminalSessionId: terminalId, launchToken: terminalId };
  }

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
      options.emit(channels.openArtifact, event);
    }
    return true;
  }

  function requireReviewRunManager(): ReviewRunManager {
    if (!reviewRunManager) throw new Error("Review orchestration is not initialized");
    return reviewRunManager;
  }

  function requireArtifactRunManager(): ArtifactRunManager {
    if (!artifactRunManager) throw new Error("Artifact orchestration is not initialized");
    return artifactRunManager;
  }

  function registerCreatedTerminal(session: TerminalSession): void {
    terminalSessions.set(session.id, session);
    if (session.pid != null && session.agentId) terminalPidToId.set(session.pid, session.id);
    if (session.agentId === "kiro") {
      const cwd = session.cwdUri.startsWith("local:") ? decodeURI(session.cwdUri.slice(6)) : session.cwdUri.replace(/^file:\/\//, "");
      terminalApprovalDetector.track(session.id, "kiro", cwd);
    }
  }

  async function ensureReviewOrchestration(runtime: RuntimePaths): Promise<void> {
    if (!artifactRunManager) {
      artifactRunManager = new ArtifactRunManager({
        resolveRepoPath: (value) => options.resolveRepoPath(localPathFromUri(value)),
        scanTasks,
        listAgentClis: (cwdUri) => core.listAgentClis(runtime, { cwdUri }),
        createTerminal: async (input) => {
          const session = await core.createTerminal(runtime, input);
          registerCreatedTerminal(session);
          return session;
        },
        inspectTerminal: async (sessionId) => core.inspectTerminal(sessionId),
        notifyTerminal: async (sessionId, text) => core.notifyTerminal({ sessionId, text }),
        reserveArtifactPath,
        onStarted: (event: ArtifactRunStartedEvent) => {
          options.emit(channels.artifactRunStarted, event);
        },
        onReady: (event: ArtifactReadyEvent) => {
          options.emit(channels.openArtifact, event);
        },
      });
    }
    if (!reviewRunManager) {
      reviewRunManager = new ReviewRunManager({
        resolveRepoPath: (value) => options.resolveRepoPath(localPathFromUri(value)),
        scanTasks,
        resolveTaskTerminalSession: (task) => task.sessionId
          ? hookSessionToTerminal.get(task.sessionId)
          : undefined,
        listAgentClis: (cwdUri) => core.listAgentClis(runtime, { cwdUri }),
        createTerminal: async (input) => {
          const session = await core.createTerminal(runtime, input);
          registerCreatedTerminal(session);
          return session;
        },
        inspectTerminal: async (sessionId) => core.inspectTerminal(sessionId),
        notifyTerminal: async (sessionId, text) => core.notifyTerminal({ sessionId, text }),
        closeTerminal: async (sessionId) => { await core.closeTerminal({ sessionId }); },
        reserveReviewPath,
        onStarted: (event: ReviewRunStartedEvent) => {
          if (event.run.origin !== "agent") return;
          options.emit(channels.reviewRunStarted, event);
        },
        onUpdated: (event: ReviewRunUpdatedEvent) => {
          options.emit(channels.reviewRunUpdated, event);
        },
      });
    }
    if (!reviewControlServer) {
      reviewControlServer = new ReviewControlServer(runtime.userDataPath, handleReviewControlRequest);
      await reviewControlServer.start();
    }
  }

  async function handleReviewControlRequest(request: ReviewControlRequest): Promise<unknown> {
    if (request.method === "artifact-start") {
      const callerTerminalSessionId = requiredControlString(request.params, "callerTerminalSessionId", "parentTerminalSessionId");
      const agentId = optionalControlString(request.params, "agentId");
      const event = await requireArtifactRunManager().start({
        repoPath: requiredControlString(request.params, "repoPath"),
        taskId: requiredControlString(request.params, "taskId"),
        ...(agentId ? { agentId } : {}),
        parentTerminalSessionId: callerTerminalSessionId,
      });
      return controlArtifactRun(event.run);
    }
    if (request.method === "artifact-complete") {
      const run = await requireArtifactRunManager().complete({
        runId: requiredControlString(request.params, "runId"),
        artifactPath: requiredControlString(request.params, "artifactPath"),
        callerTerminalSessionId: optionalControlString(request.params, "callerTerminalSessionId"),
        completionToken: optionalControlString(request.params, "completionToken"),
      });
      return controlArtifactRun(run);
    }
    const manager = requireReviewRunManager();
    const callerTerminalSessionId = request.method === "complete"
      ? optionalControlString(request.params, "callerTerminalSessionId")
      : requiredControlString(request.params, "callerTerminalSessionId", request.method === "start" ? "parentTerminalSessionId" : undefined);
    if (request.method === "start") {
      const agentId = optionalControlString(request.params, "agentId");
      return manager.start({
        repoPath: requiredControlString(request.params, "repoPath"),
        taskId: requiredControlString(request.params, "taskId"),
        ...(agentId ? { agentId } : {}),
        origin: "agent",
        parentTerminalSessionId: callerTerminalSessionId,
      }).then((event) => controlReviewRun(event.run, callerTerminalSessionId));
    }
    const runId = requiredControlString(request.params, "runId");
    if (request.method === "status") return controlReviewRun(manager.status(runId, callerTerminalSessionId), callerTerminalSessionId);
    if (request.method === "cancel") return manager.cancel(runId, callerTerminalSessionId).then((run) => controlReviewRun(run, callerTerminalSessionId));
    if (request.method === "complete") {
      return manager.complete({
        runId,
        reportPath: requiredControlString(request.params, "reportPath"),
        callerTerminalSessionId,
        completionToken: typeof request.params.completionToken === "string" ? request.params.completionToken.trim() : undefined,
      }).then((run) => controlReviewRun(run, callerTerminalSessionId, true));
    }
    const timeout = Number(request.params.timeoutMs ?? 300_000);
    if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("wait timeout must be a positive number");
    return manager.wait(runId, callerTerminalSessionId, Math.min(timeout, 3_600_000)).then((run) => controlReviewRun(run, callerTerminalSessionId));
  }

  function controlArtifactRun(run: ArtifactRun): ArtifactRun & { runId: string } {
    return { ...run, runId: run.id };
  }

  function controlReviewRun(run: ReviewRun, callerTerminalSessionId: string, reviewerResponse = false): ReviewRun & { runId: string } {
    const result = { ...run, runId: run.id };
    if (reviewerResponse || (callerTerminalSessionId === run.reviewerTerminalSessionId && callerTerminalSessionId !== run.parentTerminalSessionId)) {
      delete result.parentTerminalSessionId;
    }
    return result;
  }

  function requiredControlString(params: Record<string, unknown>, key: string, fallbackKey?: string): string {
    const value = params[key] ?? (fallbackKey ? params[fallbackKey] : undefined);
    if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${key}`);
    return value.trim();
  }

  function optionalControlString(params: Record<string, unknown>, key: string): string {
    const value = params[key];
    return typeof value === "string" ? value.trim() : "";
  }

  function localPathFromUri(value: string): string {
    return value.startsWith("local:") ? decodeURI(value.slice("local:".length)) : value;
  }

  function timestampValue(value: string): number {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function findAgentSessionForTerminal(terminalSessionId: string, agentId?: string): string | null {
    const exact = hookStateManager.getStatusForTerminal(terminalSessionId);
    if (exact && (!agentId || exact.agent === agentId)) return exact.sessionId;
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
      for (const text of pending) { promptStore.record(agentSessionId, text); promptStore.record(terminalId, text); }
      pendingPromptsByTerminal.delete(terminalId);
    }
  }

  function getStatuses(): AgentProjectStatusEvent[] {
    const entries = hookStateManager.getAllStatuses();
    return entries.filter(entry => entry.terminalSessionId || !entries.some(other => other.terminalSessionId && other.sessionId === entry.sessionId && other.agent === entry.agent && other.projectPath === entry.projectPath))
      .map((entry) => ({ agentId: entry.agent, projectPath: entry.projectPath,
      sessionId: entry.sessionId, text: entry.action, timestamp: entry.timestamp, hookState: entry.state, evidence: entry.evidence,
      pid: entry.pid, terminalSessionId: entry.terminalSessionId ?? hookSessionToTerminal.get(entry.sessionId),
      lastPrompt: entry.terminalSessionId ? promptStore.get(entry.terminalSessionId) ?? entry.lastPrompt : entry.lastPrompt ?? promptStore.get(entry.sessionId) ?? undefined }));
  }
  return {
    start, stop, getStatuses, agentSessionWatcher, hookStateManager, hookSessionToTerminal, promptStore, hookBridge, hookConnectors,
    registerCreatedTerminal, findAgentSessionForTerminal, flushPendingPrompt,
    reviewRuns: requireReviewRunManager, artifactRuns: requireArtifactRunManager,
    recordPrompt(input: { terminalSessionId: string; text: string }) {
      if (!input?.terminalSessionId || !input?.text) return;
      if (terminalSessions.get(input.terminalSessionId)?.agentId === "codex") pendingCodexPrompts.set(input.terminalSessionId, input.text.replace(/\s+/g, " ").trim());
      promptStore.record(input.terminalSessionId, input.text);
      const hookId = findAgentSessionForTerminal(input.terminalSessionId);
      if (hookId) { if (promptStore.get(hookId) !== input.text) promptStore.record(hookId, input.text); }
      else pendingPromptsByTerminal.set(input.terminalSessionId, [...(pendingPromptsByTerminal.get(input.terminalSessionId) ?? []), input.text]);
    },
    loadPromptHistory(sessionId: string) {
      const direct = promptStore.getHistory(sessionId);
      if (direct.length) return direct;
      const hookId = findAgentSessionForTerminal(sessionId);
      return hookId ? promptStore.getHistory(hookId) : [];
    },
  };
}
