import { EventEmitter } from "node:events";
import type { SharkBayJob, SharkBayJobKind } from "../shared/types.js";

export type SharkBayJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "timeout";

export type ScheduledJob<T> = SharkBayJob & {
  status: SharkBayJobStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  result?: T;
  dedupeKey?: string;
};

export type JobSchedulerEvents = {
  update: [ScheduledJob<unknown>];
};

export type ScheduleJobInput<T> = {
  kind: SharkBayJobKind;
  targetId: string;
  projectUri?: string;
  priority?: SharkBayJob["priority"];
  timeoutMs?: number;
  dedupeKey?: string;
  run: (signal: AbortSignal) => Promise<T>;
};

const priorityWeight: Record<SharkBayJob["priority"], number> = {
  interactive: 0,
  background: 1,
  idle: 2,
};

export class JobScheduler extends EventEmitter<JobSchedulerEvents> {
  private readonly queue: Array<QueuedJob<unknown>> = [];
  private readonly runningByTarget = new Map<string, number>();
  private readonly jobsByDedupeKey = new Map<string, Promise<unknown>>();
  private sequence = 0;

  constructor(private readonly options: { defaultTimeoutMs?: number; maxConcurrentPerTarget?: number } = {}) {
    super();
  }

  schedule<T>(input: ScheduleJobInput<T>): Promise<T> {
    if (input.dedupeKey) {
      const existing = this.jobsByDedupeKey.get(input.dedupeKey);
      if (existing) return existing as Promise<T>;
    }

    const job: ScheduledJob<T> = {
      id: `job-${Date.now().toString(36)}-${++this.sequence}`,
      kind: input.kind,
      targetId: input.targetId,
      projectUri: input.projectUri,
      priority: input.priority ?? "background",
      timeoutMs: input.timeoutMs ?? this.options.defaultTimeoutMs ?? 5000,
      createdAt: new Date().toISOString(),
      status: "queued",
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    };

    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({ input, job, resolve: resolve as (value: unknown) => void, reject });
      this.queue.sort(compareQueuedJobs);
      this.emit("update", job as ScheduledJob<unknown>);
      this.pump();
    });

    const dedupeKey = input.dedupeKey;
    if (dedupeKey) {
      this.jobsByDedupeKey.set(dedupeKey, promise);
      promise.finally(() => this.jobsByDedupeKey.delete(dedupeKey)).catch(() => undefined);
    }
    return promise;
  }

  private pump(): void {
    for (;;) {
      const index = this.queue.findIndex((job) => this.canRun(job.job.targetId));
      if (index < 0) return;
      const next = this.queue.splice(index, 1)[0];
      if (!next) return;
      this.run(next);
    }
  }

  private canRun(targetId: string): boolean {
    const max = this.options.maxConcurrentPerTarget ?? 2;
    return (this.runningByTarget.get(targetId) ?? 0) < max;
  }

  private run<T>(queued: QueuedJob<T>): void {
    const { input, job, resolve, reject } = queued;
    this.runningByTarget.set(job.targetId, (this.runningByTarget.get(job.targetId) ?? 0) + 1);
    job.status = "running";
    job.startedAt = new Date().toISOString();
    this.emit("update", job as ScheduledJob<unknown>);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), job.timeoutMs);
    input.run(controller.signal)
      .then((result) => {
        job.status = "completed";
        job.result = result;
        job.finishedAt = new Date().toISOString();
        resolve(result);
      })
      .catch((error) => {
        job.status = controller.signal.aborted ? "timeout" : "failed";
        job.error = error instanceof Error ? error.message : String(error);
        job.finishedAt = new Date().toISOString();
        reject(error);
      })
      .finally(() => {
        clearTimeout(timer);
        const running = (this.runningByTarget.get(job.targetId) ?? 1) - 1;
        if (running <= 0) this.runningByTarget.delete(job.targetId);
        else this.runningByTarget.set(job.targetId, running);
        this.emit("update", job as ScheduledJob<unknown>);
        this.pump();
      });
  }
}

type QueuedJob<T> = {
  input: ScheduleJobInput<T>;
  job: ScheduledJob<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function compareQueuedJobs(a: QueuedJob<unknown>, b: QueuedJob<unknown>): number {
  const priority = priorityWeight[a.job.priority] - priorityWeight[b.job.priority];
  if (priority !== 0) return priority;
  return a.job.createdAt.localeCompare(b.job.createdAt);
}
