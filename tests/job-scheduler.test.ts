import { afterEach, describe, expect, it, vi } from "vitest";
import { JobScheduler } from "../src/core/job-scheduler.js";

describe("JobScheduler", () => {
  it("dedupes matching jobs", async () => {
    const scheduler = new JobScheduler();
    let runs = 0;
    const run = async () => {
      runs += 1;
      return "ok";
    };

    const [a, b] = await Promise.all([
      scheduler.schedule({ kind: "scan", targetId: "local", dedupeKey: "same", run }),
      scheduler.schedule({ kind: "scan", targetId: "local", dedupeKey: "same", run }),
    ]);

    expect(a).toBe("ok");
    expect(b).toBe("ok");
    expect(runs).toBe(1);
  });

  it("limits concurrency per target", async () => {
    const scheduler = new JobScheduler({ maxConcurrentPerTarget: 1 });
    const order: string[] = [];
    const release: Array<() => void> = [];

    const first = scheduler.schedule({
      kind: "scan",
      targetId: "local",
      run: () => new Promise<string>((resolve) => {
        order.push("first-start");
        release.push(() => {
          order.push("first-end");
          resolve("first");
        });
      }),
    });
    const second = scheduler.schedule({
      kind: "scan",
      targetId: "local",
      run: async () => {
        order.push("second-start");
        return "second";
      },
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    release[0]?.();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });
});

afterEach(() => { vi.useRealTimers(); });
it("rejects a late job at its deadline but holds its slot until real completion", async () => {
  vi.useFakeTimers();
  const scheduler = new JobScheduler({ maxConcurrentPerTarget: 1 });
  const statuses: string[] = [];
  scheduler.on("update", (job) => statuses.push(job.status));
  let release!: () => void;
  const first = scheduler.schedule({ kind: "scan", targetId: "local", timeoutMs: 5, run: () => new Promise<void>((resolve) => { release = resolve; }) });
  const rejected = expect(first).rejects.toThrow("timed out");
  const next = vi.fn(async () => "next");
  const second = scheduler.schedule({ kind: "scan", targetId: "local", run: next });
  await vi.advanceTimersByTimeAsync(10); await rejected;
  expect(next).not.toHaveBeenCalled();
  release(); await expect(second).resolves.toBe("next");
  expect(statuses.filter((status) => status === "timeout")).toHaveLength(1);
  expect(statuses.filter((status) => status === "completed")).toHaveLength(1);
  await scheduler.stop();
});
it("stops queued work, cancels running work, and waits for cleanup", async () => {
  const scheduler = new JobScheduler({ maxConcurrentPerTarget: 1 });
  let release!: () => void; let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const first = scheduler.schedule({ kind: "scan", targetId: "local", run: (signal) => new Promise<void>((resolve) => { release = resolve; signal.addEventListener("abort", () => {}, { once: true }); started(); }) });
  const firstRejected = expect(first).rejects.toThrow("stopped");
  const queued = vi.fn(async () => "queued");
  const second = scheduler.schedule({ kind: "scan", targetId: "local", run: queued });
  const secondRejected = expect(second).rejects.toThrow("stopped");
  await entered;
  let stopped = false; const stop = scheduler.stop().then(() => { stopped = true; });
  await firstRejected; await secondRejected;
  expect(stopped).toBe(false); expect(queued).not.toHaveBeenCalled();
  await expect(scheduler.schedule({ kind: "scan", targetId: "local", run: queued })).rejects.toThrow("stopped");
  release(); await stop; expect(stopped).toBe(true);
});
it("does not lose a slot on synchronous failure", async () => {
  const scheduler = new JobScheduler({ maxConcurrentPerTarget: 1 });
  await expect(scheduler.schedule({ kind: "scan", targetId: "local", run: () => { throw new Error("failure"); } })).rejects.toThrow("failure");
  await expect(scheduler.schedule({ kind: "scan", targetId: "local", run: async () => "ok" })).resolves.toBe("ok");
  await scheduler.stop();
});
