import { randomUUID } from "node:crypto";
import { lstat, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { toLocalProjectUri } from "../core/project-uri.js";
import type {
  AgentCli,
  ArtifactReadyEvent,
  ArtifactRun,
  ArtifactRunStartedEvent,
  TerminalControlState,
  TerminalCreateInput,
  TerminalNotificationResult,
  TerminalSession,
} from "../shared/types.js";
import type { TaskViewModel } from "./tasks.js";

const defaultNotificationRetryMs = 500;

export type ArtifactRunManagerDeps = {
  resolveRepoPath: (repoPath: string) => Promise<string>;
  scanTasks: (repoPath: string) => Promise<TaskViewModel[]>;
  listAgentClis: (cwdUri: string) => Promise<AgentCli[]>;
  createTerminal: (input: TerminalCreateInput) => Promise<TerminalSession>;
  inspectTerminal: (sessionId: string) => Promise<TerminalControlState | null>;
  notifyTerminal: (sessionId: string, text: string) => Promise<TerminalNotificationResult | null>;
  reserveArtifactPath: (repoPath: string, taskId: string) => Promise<string>;
  onStarted?: (event: ArtifactRunStartedEvent) => void;
  onReady?: (event: ArtifactReadyEvent) => void;
  now?: () => Date;
  notificationRetryMs?: number;
};

export type ArtifactRunStartInput = {
  repoPath: string;
  taskId: string;
  agentId?: string;
  parentTerminalSessionId: string;
};

export type ArtifactRunCompleteInput = {
  runId: string;
  artifactPath: string;
  callerTerminalSessionId?: string;
  completionToken?: string;
};

export class ArtifactRunManager {
  private readonly runs = new Map<string, ArtifactRun>();
  private readonly completionTokens = new Map<string, string>();
  private readonly notificationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly now: () => Date;
  private readonly notificationRetryMs: number;

  constructor(private readonly deps: ArtifactRunManagerDeps) {
    this.now = deps.now ?? (() => new Date());
    this.notificationRetryMs = deps.notificationRetryMs ?? defaultNotificationRetryMs;
  }

  async start(input: ArtifactRunStartInput): Promise<ArtifactRunStartedEvent> {
    const repoPath = await this.deps.resolveRepoPath(input.repoPath);
    const task = (await this.deps.scanTasks(repoPath)).find((candidate) => candidate.taskId === input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);

    const parent = await this.deps.inspectTerminal(input.parentTerminalSessionId);
    if (!parent || parent.session.status !== "running") throw new Error("Parent terminal session is not running");
    if (path.resolve(parent.projectRoot) !== path.resolve(repoPath)) {
      throw new Error("Parent terminal does not belong to the requested project");
    }
    const artifactAgentId = input.agentId?.trim() || parent.session.agentId;
    if (!artifactAgentId) throw new Error("Artifact agent is required because the parent terminal has no agent");

    const cwdUri = toLocalProjectUri(repoPath);
    const agent = (await this.deps.listAgentClis(cwdUri)).find((candidate) => candidate.id === artifactAgentId);
    if (!agent) throw new Error(`Artifact agent is not installed: ${artifactAgentId}`);

    const artifactPath = await this.deps.reserveArtifactPath(repoPath, task.taskId);
    const runId = `artifact-${randomUUID()}`;
    const completionToken = randomUUID();
    let session: TerminalSession;
    try {
      session = await this.deps.createTerminal({
        cwdUri,
        agentId: agent.id,
        initialCommand: shellQuote(agent.executablePath || agent.command),
        initialCommandTitle: `Artifact ${task.taskId}`,
        artifact: {
          taskId: task.taskId,
          status: task.status,
          sourcePath: relativeTaskPath(repoPath, task.sourcePath),
          agentLabel: task.agent,
          artifactPath,
          runId,
          completionToken,
        },
      });
    } catch (error) {
      await rm(path.join(repoPath, artifactPath), { force: true }).catch(() => {});
      throw error;
    }

    const run: ArtifactRun = {
      id: runId,
      repoPath,
      taskId: task.taskId,
      agentId: agent.id,
      parentTerminalSessionId: input.parentTerminalSessionId,
      artifactTerminalSessionId: session.id,
      artifactPath,
      status: "running",
      createdAt: this.timestamp(),
    };
    this.runs.set(run.id, run);
    this.completionTokens.set(run.id, completionToken);
    const event = { run: copyRun(run), session };
    this.deps.onStarted?.(event);
    return event;
  }

  async complete(input: ArtifactRunCompleteInput): Promise<ArtifactRun> {
    const run = this.requireRun(input.runId);
    const validCompletionToken = input.completionToken
      && input.completionToken === this.completionTokens.get(run.id);
    if (input.callerTerminalSessionId !== run.artifactTerminalSessionId && !validCompletionToken) {
      throw new Error("Only the Artifact agent can complete this run");
    }
    if (run.status === "completed") return copyRun(run);
    if (run.status !== "running") throw new Error(`Artifact run is ${run.status}`);
    if (normalizeArtifactPath(run.repoPath, input.artifactPath) !== run.artifactPath) {
      throw new Error(`Artifact path must match the reserved path: ${run.artifactPath}`);
    }

    const absoluteArtifactPath = path.join(run.repoPath, run.artifactPath);
    const artifactStat = await lstat(absoluteArtifactPath).catch(() => null);
    if (!artifactStat?.isFile() || artifactStat.size === 0) throw new Error("Artifact is missing or empty");
    if (!(await readFile(absoluteArtifactPath, "utf8")).trim()) throw new Error("Artifact is empty");

    run.status = "completed";
    run.completedAt = this.timestamp();
    delete run.error;
    this.completionTokens.delete(run.id);
    this.deps.onReady?.({ path: absoluteArtifactPath, repo: run.repoPath });
    await this.tryNotifyParent(run);
    return copyRun(run);
  }

  handleTerminalExit(sessionId: string): void {
    const run = [...this.runs.values()].find((candidate) => candidate.artifactTerminalSessionId === sessionId);
    if (!run || run.status !== "running") return;
    run.status = "failed";
    run.completedAt = this.timestamp();
    run.error = "Artifact terminal exited before completing the reserved page";
    this.completionTokens.delete(run.id);
    void this.removeEmptyReservedArtifact(run);
    void this.tryNotifyParent(run);
  }

  dispose(): void {
    for (const timer of this.notificationTimers.values()) clearTimeout(timer);
    this.notificationTimers.clear();
    this.completionTokens.clear();
  }

  private async tryNotifyParent(run: ArtifactRun): Promise<void> {
    if ((run.status !== "completed" && run.status !== "failed") || run.notifiedAt) return;
    const message = run.status === "completed"
      ? `[SharkBay] Artifact \`${run.id}\` completed by ${run.agentId}. The page opened in SharkBay and is saved at \`${run.artifactPath}\`. Review it and continue the parent task.`
      : `[SharkBay] Artifact \`${run.id}\` by ${run.agentId} failed because its terminal exited before completion. Run \`.sharkbay/harness/artifact.sh start --task-id ${run.taskId}\` to try again.`;
    let result: TerminalNotificationResult | null;
    try {
      result = await this.deps.notifyTerminal(run.parentTerminalSessionId, message);
    } catch {
      this.scheduleNotificationRetry(run);
      return;
    }
    if (result?.state === "submitted") {
      run.notifiedAt = this.timestamp();
      this.clearNotificationTimer(run.id);
      return;
    }
    if (result?.state === "draft-pending") this.scheduleNotificationRetry(run);
  }

  private scheduleNotificationRetry(run: ArtifactRun): void {
    if (this.notificationTimers.has(run.id)) return;
    const timer = setTimeout(() => {
      this.notificationTimers.delete(run.id);
      void this.tryNotifyParent(run);
    }, this.notificationRetryMs);
    timer.unref?.();
    this.notificationTimers.set(run.id, timer);
  }

  private clearNotificationTimer(runId: string): void {
    const timer = this.notificationTimers.get(runId);
    if (timer) clearTimeout(timer);
    this.notificationTimers.delete(runId);
  }

  private async removeEmptyReservedArtifact(run: ArtifactRun): Promise<void> {
    const artifactPath = path.join(run.repoPath, run.artifactPath);
    const artifactStat = await lstat(artifactPath).catch(() => null);
    if (artifactStat?.isFile() && artifactStat.size === 0) await rm(artifactPath, { force: true });
  }

  private requireRun(runId: string): ArtifactRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown Artifact run: ${runId}`);
    return run;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

function relativeTaskPath(repoPath: string, sourcePath: string): string {
  const relative = path.relative(repoPath, sourcePath);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." ? relative : sourcePath;
}

function normalizeArtifactPath(repoPath: string, artifactPath: string): string {
  const absolute = path.isAbsolute(artifactPath) ? path.resolve(artifactPath) : path.resolve(repoPath, artifactPath);
  return path.relative(repoPath, absolute).split(path.sep).join("/");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function copyRun(run: ArtifactRun): ArtifactRun {
  return { ...run };
}
