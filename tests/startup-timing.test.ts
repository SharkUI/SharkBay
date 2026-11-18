import { afterEach, expect, it, vi } from "vitest";
import { createStartupTimer } from "../src/main/startup-timing.js";

afterEach(() => vi.restoreAllMocks());
it("records per-process phase durations using a monotonic clock", () => {
  vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(125.4).mockReturnValueOnce(200);
  const lines: string[] = [];
  const mark = createStartupTimer("fixture", line => lines.push(line));
  mark("ready"); mark("finished");
  const entries = lines.map(line => JSON.parse(line.slice("[startup] ".length)));
  expect(entries.map(entry => entry.elapsedMs)).toEqual([25, 100]);
  expect(entries.map(entry => entry.stage)).toEqual(["ready", "finished"]);
  expect(entries[0]).toMatchObject({ scope: "fixture", pid: process.pid });
  expect(Object.keys(entries[0]).sort()).toEqual(["at", "elapsedMs", "pid", "processUptimeMs", "scope", "stage"]);
});
