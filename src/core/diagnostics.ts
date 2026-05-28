import type {
  DiagnosticsCounter,
  DiagnosticsDetectorAggregate,
  DiagnosticsJobRecord,
  DiagnosticsSnapshot,
} from "../shared/types.js";
import type { ScheduledJob } from "./job-scheduler.js";

const MAX_RECENT_JOBS = 50;

type DetectorAggregateState = {
  detectorKey: string;
  runs: number;
  totalDurationMs: number;
  lastRunAt: string;
  failureCount: number;
};

export class DiagnosticsCollector {
  private readonly recentJobs: DiagnosticsJobRecord[] = [];
  private readonly detectorAggregates = new Map<string, DetectorAggregateState>();
  private readonly cacheCounts = {
    machine: { hits: 0, misses: 0 },
    project: { hits: 0, misses: 0 },
  };
  private terminalDataTotal = 0;
  private terminalDataSinceIso = new Date().toISOString();
  private readonly processStartedAt = new Date().toISOString();

  recordJobUpdate(job: ScheduledJob<unknown>): void {
    if (job.status !== "completed" && job.status !== "failed" && job.status !== "cancelled" && job.status !== "timeout") return;
    if (!job.startedAt || !job.finishedAt) return;
    const durationMs = Math.max(0, Date.parse(job.finishedAt) - Date.parse(job.startedAt));
    const record: DiagnosticsJobRecord = {
      id: job.id,
      kind: job.kind,
      targetId: job.targetId,
      ...(job.projectUri ? { projectUri: job.projectUri } : {}),
      status: job.status,
      durationMs,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      ...(job.error ? { error: job.error } : {}),
    };
    this.recentJobs.unshift(record);
    if (this.recentJobs.length > MAX_RECENT_JOBS) this.recentJobs.length = MAX_RECENT_JOBS;

    const detectorKey = detectorKeyForJob(job);
    if (detectorKey) {
      const state = this.detectorAggregates.get(detectorKey) ?? {
        detectorKey,
        runs: 0,
        totalDurationMs: 0,
        lastRunAt: job.finishedAt,
        failureCount: 0,
      };
      state.runs += 1;
      state.totalDurationMs += durationMs;
      state.lastRunAt = job.finishedAt;
      if (job.status !== "completed") state.failureCount += 1;
      this.detectorAggregates.set(detectorKey, state);
    }
  }

  recordCacheHit(category: "machine" | "project"): void {
    this.cacheCounts[category].hits += 1;
  }

  recordCacheMiss(category: "machine" | "project"): void {
    this.cacheCounts[category].misses += 1;
  }

  recordTerminalData(): void {
    this.terminalDataTotal += 1;
  }

  resetTerminalDataCounter(): void {
    this.terminalDataTotal = 0;
    this.terminalDataSinceIso = new Date().toISOString();
  }

  snapshot(): DiagnosticsSnapshot {
    return {
      collectedAt: new Date().toISOString(),
      processStartedAt: this.processStartedAt,
      recentJobs: [...this.recentJobs],
      detectorAggregates: this.computeDetectorAggregates(),
      cache: {
        machine: { ...this.cacheCounts.machine },
        project: { ...this.cacheCounts.project },
      },
      terminalData: this.computeCounter(this.terminalDataTotal, this.terminalDataSinceIso),
    };
  }

  private computeDetectorAggregates(): DiagnosticsDetectorAggregate[] {
    return [...this.detectorAggregates.values()]
      .map((state) => ({
        detectorKey: state.detectorKey,
        runs: state.runs,
        totalDurationMs: state.totalDurationMs,
        avgDurationMs: state.runs > 0 ? state.totalDurationMs / state.runs : 0,
        lastRunAt: state.lastRunAt,
        failureCount: state.failureCount,
      }))
      .sort((a, b) => b.runs - a.runs);
  }

  private computeCounter(total: number, sinceIso: string): DiagnosticsCounter {
    return { total, sinceIso };
  }
}

function detectorKeyForJob(job: ScheduledJob<unknown>): string | null {
  if (job.kind !== "machine-profile" && job.kind !== "project-profile") return null;
  const dedupeKey = job.dedupeKey;
  if (!dedupeKey) return job.kind;
  const parts = dedupeKey.split(":");
  if (parts.length < 4) return job.kind;
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}
