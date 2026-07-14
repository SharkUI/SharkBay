import { randomUUID } from "node:crypto";
import { lstat, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { toLocalProjectUri } from "../core/project-uri.js";
import type {
  AgentCli,
  ReviewRun,
  ReviewRunStartedEvent,
  ReviewRunUpdatedEvent,
  ReviewStartInput,
  TerminalControlState,
  TerminalCreateInput,
  TerminalNotificationResult,
  TerminalSession,
} from "../shared/types.js";
import type { TaskViewModel } from "./tasks.js";

const agentReviewers = new Set(["opencode", "codewhale"]);
const defaultNotificationRetryMs = 500;

export type ReviewRunManagerDeps = {
  resolveRepoPath: (repoPath: string) => Promise<string>;
  scanTasks: (repoPath: string) => Promise<TaskViewModel[]>;
  listAgentClis: (cwdUri: string) => Promise<AgentCli[]>;
  createTerminal: (input: TerminalCreateInput) => Promise<TerminalSession>;
  inspectTerminal: (sessionId: string) => Promise<TerminalControlState | null>;
  notifyTerminal: (sessionId: string, text: string) => Promise<TerminalNotificationResult | null>;
  closeTerminal: (sessionId: string) => Promise<void>;
  reserveReviewPath: (repoPath: string, taskId: string) => Promise<string>;
  onStarted?: (event: ReviewRunStartedEvent) => void;
  onUpdated?: (event: ReviewRunUpdatedEvent) => void;
  now?: () => Date;
  notificationRetryMs?: number;
};

export type ReviewRunCompleteInput = {
  runId: string;
  reportPath: string;
  callerTerminalSessionId?: string;
  completionToken?: string;
};

export class ReviewRunManager {
  private readonly runs = new Map<string, ReviewRun>();
  private readonly waiters = new Map<string, Set<(run: ReviewRun) => void>>();
  private readonly notificationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly completionTokens = new Map<string, string>();
  private readonly now: () => Date;
  private readonly notificationRetryMs: number;

  constructor(private readonly deps: ReviewRunManagerDeps) {
    this.now = deps.now ?? (() => new Date());
    this.notificationRetryMs = deps.notificationRetryMs ?? defaultNotificationRetryMs;
  }

  async start(input: ReviewStartInput): Promise<ReviewRunStartedEvent> {
    const repoPath = await this.deps.resolveRepoPath(input.repoPath);
    const task = (await this.deps.scanTasks(repoPath)).find((candidate) => candidate.taskId === input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);

    if (input.origin === "agent") {
      if (!agentReviewers.has(input.agentId)) {
        throw new Error("Agent-initiated Review supports only opencode and codewhale");
      }
      if (!input.parentTerminalSessionId) throw new Error("Parent terminal session is required");
      const parent = await this.deps.inspectTerminal(input.parentTerminalSessionId);
      if (!parent || parent.session.status !== "running") throw new Error("Parent terminal session is not running");
      if (parent.session.agentId !== "codex") throw new Error("Agent-initiated Review currently requires a Codex parent");
      if (path.resolve(parent.projectRoot) !== path.resolve(repoPath)) {
        throw new Error("Parent terminal does not belong to the requested project");
      }
    }

    const cwdUri = toLocalProjectUri(repoPath);
    const agent = (await this.deps.listAgentClis(cwdUri)).find((candidate) => candidate.id === input.agentId);
    if (!agent) throw new Error(`Review agent is not installed: ${input.agentId}`);

    const reportPath = await this.deps.reserveReviewPath(repoPath, task.taskId);
    const runId = `review-${randomUUID()}`;
    const completionToken = randomUUID();
    let session: TerminalSession;
    try {
      session = await this.deps.createTerminal({
        cwdUri,
        agentId: agent.id,
        initialCommand: input.initialCommand ?? shellQuote(agent.executablePath || agent.command),
        initialCommandTitle: input.initialCommandTitle ?? `Review ${task.taskId}`,
        review: {
          taskId: task.taskId,
          status: task.status,
          sourcePath: relativeTaskPath(repoPath, task.sourcePath),
          agentLabel: task.agent,
          reviewPath: reportPath,
          runId,
          completionToken,
        },
      });
    } catch (error) {
      await rm(path.join(repoPath, reportPath), { force: true }).catch(() => {});
      throw error;
    }
    const run: ReviewRun = {
      id: runId,
      repoPath,
      taskId: task.taskId,
      agentId: agent.id,
      origin: input.origin,
      ...(input.parentTerminalSessionId ? { parentTerminalSessionId: input.parentTerminalSessionId } : {}),
      reviewerTerminalSessionId: session.id,
      reportPath,
      status: "running",
      createdAt: this.timestamp(),
    };
    this.runs.set(run.id, run);
    this.completionTokens.set(run.id, completionToken);
    const event = { run: copyRun(run), session };
    this.deps.onStarted?.(event);
    return event;
  }

  status(runId: string, callerTerminalSessionId?: string): ReviewRun {
    const run = this.requireRun(runId);
    this.assertCaller(run, callerTerminalSessionId);
    return copyRun(run);
  }

  async complete(input: ReviewRunCompleteInput): Promise<ReviewRun> {
    const run = this.requireRun(input.runId);
    const validCompletionToken = input.completionToken
      && input.completionToken === this.completionTokens.get(run.id);
    if (input.callerTerminalSessionId !== run.reviewerTerminalSessionId && !validCompletionToken) {
      throw new Error("Only the reviewer can complete this Review run");
    }
    if (run.status === "completed") return copyRun(run);
    if (run.status !== "running") throw new Error(`Review run is ${run.status}`);
    if (normalizeReportPath(run.repoPath, input.reportPath) !== run.reportPath) {
      throw new Error(`Report path must match the reserved path: ${run.reportPath}`);
    }
    const absoluteReportPath = path.join(run.repoPath, run.reportPath);
    const reportStat = await lstat(absoluteReportPath).catch(() => null);
    if (!reportStat?.isFile() || reportStat.size === 0) throw new Error("Review report is missing or empty");
    if (!(await readFile(absoluteReportPath, "utf8")).trim()) throw new Error("Review report is empty");

    run.status = "completed";
    run.completedAt = this.timestamp();
    delete run.error;
    this.updated(run);
    await this.tryNotifyParent(run);
    this.resolveWaiters(run);
    return copyRun(run);
  }

  async cancel(runId: string, callerTerminalSessionId?: string): Promise<ReviewRun> {
    const run = this.requireRun(runId);
    this.assertCaller(run, callerTerminalSessionId, true);
    if (run.status !== "running") return copyRun(run);
    run.status = "cancelled";
    run.completedAt = this.timestamp();
    this.updated(run);
    this.resolveWaiters(run);
    await this.deps.closeTerminal(run.reviewerTerminalSessionId);
    await this.removeEmptyReservedReport(run);
    this.completionTokens.delete(run.id);
    return copyRun(run);
  }

  wait(runId: string, callerTerminalSessionId?: string, timeoutMs = 300_000): Promise<ReviewRun> {
    const run = this.requireRun(runId);
    this.assertCaller(run, callerTerminalSessionId);
    if (run.status !== "running") return Promise.resolve(copyRun(run));
    return new Promise((resolve) => {
      const listeners = this.waiters.get(runId) ?? new Set();
      const done = (finished: ReviewRun) => {
        clearTimeout(timer);
        listeners.delete(done);
        resolve(copyRun(finished));
      };
      listeners.add(done);
      this.waiters.set(runId, listeners);
      const timer = setTimeout(() => {
        listeners.delete(done);
        if (!listeners.size) this.waiters.delete(runId);
        resolve(copyRun(this.requireRun(runId)));
      }, Math.max(1, timeoutMs));
      timer.unref?.();
    });
  }

  handleTerminalExit(sessionId: string): void {
    const run = [...this.runs.values()].find((candidate) => candidate.reviewerTerminalSessionId === sessionId);
    if (!run || run.status !== "running") return;
    run.status = "failed";
    run.completedAt = this.timestamp();
    run.error = "Reviewer terminal exited before completing the reserved report";
    this.updated(run);
    this.resolveWaiters(run);
    void this.removeEmptyReservedReport(run);
    this.completionTokens.delete(run.id);
    void this.tryNotifyParent(run);
  }

  dispose(): void {
    for (const timer of this.notificationTimers.values()) clearTimeout(timer);
    this.notificationTimers.clear();
    this.completionTokens.clear();
    this.waiters.clear();
  }

  private async tryNotifyParent(run: ReviewRun): Promise<void> {
    if (!run.parentTerminalSessionId || (run.status !== "completed" && run.status !== "failed") || run.notifiedAt) return;
    const message = run.status === "completed"
      ? `[SharkBay] Review \`${run.id}\` completed by ${run.agentId}. Read \`${run.reportPath}\`, assess the findings, and continue the parent task.`
      : `[SharkBay] Review \`${run.id}\` by ${run.agentId} failed because the reviewer terminal exited before completion. Run \`.sharkbay/harness/review.sh status --run ${run.id}\` and continue the parent task.`;
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
      this.updated(run);
      return;
    }
    if (result?.state !== "draft-pending") return;
    this.scheduleNotificationRetry(run);
  }

  private scheduleNotificationRetry(run: ReviewRun): void {
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

  private async removeEmptyReservedReport(run: ReviewRun): Promise<void> {
    const reportPath = path.join(run.repoPath, run.reportPath);
    const reportStat = await lstat(reportPath).catch(() => null);
    if (reportStat?.isFile() && reportStat.size === 0) await rm(reportPath, { force: true });
  }

  private requireRun(runId: string): ReviewRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown Review run: ${runId}`);
    return run;
  }

  private assertCaller(run: ReviewRun, callerTerminalSessionId?: string, parentOnly = false): void {
    if (!callerTerminalSessionId) return;
    const allowed = parentOnly
      ? callerTerminalSessionId === run.parentTerminalSessionId
      : callerTerminalSessionId === run.parentTerminalSessionId || callerTerminalSessionId === run.reviewerTerminalSessionId;
    if (!allowed) throw new Error("Terminal session does not own this Review run");
  }

  private updated(run: ReviewRun): void {
    this.deps.onUpdated?.({ run: copyRun(run) });
  }

  private resolveWaiters(run: ReviewRun): void {
    const listeners = this.waiters.get(run.id);
    if (!listeners) return;
    this.waiters.delete(run.id);
    for (const listener of listeners) listener(run);
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

function relativeTaskPath(repoPath: string, sourcePath: string): string {
  const relative = path.relative(repoPath, sourcePath);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." ? relative : sourcePath;
}

function normalizeReportPath(repoPath: string, reportPath: string): string {
  const absolute = path.isAbsolute(reportPath) ? path.resolve(reportPath) : path.resolve(repoPath, reportPath);
  return path.relative(repoPath, absolute).split(path.sep).join("/");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function copyRun(run: ReviewRun): ReviewRun {
  return { ...run };
}
