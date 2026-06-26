import { describe, expect, it } from "vitest";

import { buildSessionRows, countOnline, type LiveStatus } from "../src/main/telegram/session-registry.js";
import type { HookSession } from "../src/main/hooks/sessions.js";

function session(over: Partial<HookSession> & { sessionId: string; lastEventAt: string }): HookSession {
  return {
    agentId: "kiro",
    model: "opus-4.8",
    title: "t",
    startedAt: "2026-06-26T00:00:00Z",
    promptCount: 0,
    turnCount: 0,
    toolCount: 0,
    ...over,
  };
}

describe("buildSessionRows", () => {
  const projects = [
    { projectPath: "/p/a", cwdUri: "local:/p/a", projectName: "a" },
    { projectPath: "/p/b", cwdUri: "local:/p/b", projectName: "b" },
  ];

  it("merges projects and sorts newest first", () => {
    const data: Record<string, HookSession[]> = {
      "/p/a": [session({ sessionId: "a1", lastEventAt: "2026-06-26T01:00:00Z" })],
      "/p/b": [session({ sessionId: "b1", lastEventAt: "2026-06-26T03:00:00Z" })],
    };
    const { rows, total } = buildSessionRows({ projects, parse: (p) => data[p] ?? [], statuses: new Map() });
    expect(total).toBe(2);
    expect(rows.map((r) => r.sessionId)).toEqual(["b1", "a1"]);
    expect(rows[0]!.projectName).toBe("b");
    expect(rows[0]!.state).toBeNull();
  });

  it("annotates live state and action subtitle", () => {
    const statuses = new Map<string, LiveStatus>([["a1", { state: "working", action: "Kiro: Edit" }]]);
    const { rows } = buildSessionRows({
      projects: [projects[0]!],
      parse: () => [session({ sessionId: "a1", lastEventAt: "2026-06-26T01:00:00Z", title: "old title" })],
      statuses,
    });
    expect(rows[0]!.state).toBe("working");
    expect(rows[0]!.subtitle).toBe("Kiro: Edit");
  });

  it("applies a limit but reports the true total", () => {
    const many = Array.from({ length: 5 }, (_, i) => session({ sessionId: `s${i}`, lastEventAt: `2026-06-26T0${i}:00:00Z` }));
    const { rows, total } = buildSessionRows({ projects: [projects[0]!], parse: () => many, statuses: new Map(), limit: 2 });
    expect(total).toBe(5);
    expect(rows).toHaveLength(2);
  });

  it("countOnline counts working + approval", () => {
    const rows = buildSessionRows({
      projects,
      parse: (p) => (p === "/p/a" ? [session({ sessionId: "a1", lastEventAt: "z" })] : [session({ sessionId: "b1", lastEventAt: "y" })]),
      statuses: new Map<string, LiveStatus>([
        ["a1", { state: "working", action: "" }],
        ["b1", { state: "stopped", action: "" }],
      ]),
    }).rows;
    expect(countOnline(rows)).toBe(1);
  });
});
