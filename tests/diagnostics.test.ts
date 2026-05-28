import { describe, expect, it } from "vitest";
import { DiagnosticsCollector } from "../src/core/diagnostics.js";
import type { ScheduledJob } from "../src/core/job-scheduler.js";

function completedJob(overrides: Partial<ScheduledJob<unknown>> = {}): ScheduledJob<unknown> {
  return {
    id: "job-1",
    kind: "machine-profile",
    targetId: "local",
    priority: "background",
    timeoutMs: 5000,
    createdAt: "2026-05-16T00:00:00Z",
    status: "completed",
    startedAt: "2026-05-16T00:00:00.000Z",
    finishedAt: "2026-05-16T00:00:00.250Z",
    dedupeKey: "machine:local:xyz.sharkbay.core:core.machine",
    ...overrides,
  };
}

describe("DiagnosticsCollector", () => {
  it("records completed job and derives detector aggregate", () => {
    const collector = new DiagnosticsCollector();
    collector.recordJobUpdate(completedJob());
    collector.recordJobUpdate(completedJob({ id: "job-2", finishedAt: "2026-05-16T00:00:00.500Z" }));
    const snapshot = collector.snapshot();
    expect(snapshot.recentJobs).toHaveLength(2);
    expect(snapshot.detectorAggregates).toEqual([
      expect.objectContaining({ detectorKey: "xyz.sharkbay.core.core.machine", runs: 2, failureCount: 0 }),
    ]);
    expect(snapshot.detectorAggregates[0]?.avgDurationMs).toBeGreaterThan(0);
  });

  it("tracks cache hits/misses per category", () => {
    const collector = new DiagnosticsCollector();
    collector.recordCacheHit("machine");
    collector.recordCacheMiss("project");
    collector.recordCacheMiss("project");
    const snapshot = collector.snapshot();
    expect(snapshot.cache.machine).toEqual({ hits: 1, misses: 0 });
    expect(snapshot.cache.project).toEqual({ hits: 0, misses: 2 });
  });

  it("ignores jobs that did not start", () => {
    const collector = new DiagnosticsCollector();
    collector.recordJobUpdate(completedJob({ startedAt: undefined, finishedAt: undefined, status: "completed" }));
    expect(collector.snapshot().recentJobs).toHaveLength(0);
  });

  it("counts only failing jobs as failures in aggregates", () => {
    const collector = new DiagnosticsCollector();
    collector.recordJobUpdate(completedJob());
    collector.recordJobUpdate(completedJob({ id: "job-2", status: "failed", error: "boom" }));
    const aggregate = collector.snapshot().detectorAggregates[0];
    expect(aggregate?.runs).toBe(2);
    expect(aggregate?.failureCount).toBe(1);
  });
});
