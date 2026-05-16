import { describe, expect, it } from "vitest";
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
