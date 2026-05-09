import { describe, expect, it } from "vitest";
import {
  projectTerminalActivityStates,
  resolveSelectedCandidate,
  shouldResetTerminalObservationForInput,
  terminalActivityForCandidate,
  validTerminalResizeDimensions,
} from "../src/renderer/workflow.js";

describe("renderer workflow contracts", () => {
  it("skips terminal resize dimensions from hidden or unmeasured surfaces", () => {
    expect(validTerminalResizeDimensions(80, 24)).toBe(true);
    expect(validTerminalResizeDimensions(80.8, 24.2)).toBe(true);
    expect(validTerminalResizeDimensions(0, 24)).toBe(false);
    expect(validTerminalResizeDimensions(80, 0)).toBe(false);
    expect(validTerminalResizeDimensions(Number.NaN, 24)).toBe(false);
    expect(validTerminalResizeDimensions(80, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("resolves selected candidate by id", () => {
    const candidates = [
      { id: "/workspace/A", name: "A", path: "/workspace/A", rootPath: "/workspace" },
      { id: "/workspace/B", name: "B", path: "/workspace/B", rootPath: "/workspace" },
    ];
    expect(resolveSelectedCandidate(candidates, "/workspace/B")?.id).toBe("/workspace/B");
    expect(resolveSelectedCandidate(candidates, "/workspace/missing")?.id).toBe("/workspace/A");
    expect(resolveSelectedCandidate([], null)).toBeNull();
  });

  it("does not treat terminal focus control sequences as user input", () => {
    expect(shouldResetTerminalObservationForInput("\u001b[I")).toBe(false);
    expect(shouldResetTerminalObservationForInput("\u001b[O")).toBe(false);
    expect(shouldResetTerminalObservationForInput("\u001b[O\u001b[I")).toBe(false);
    expect(shouldResetTerminalObservationForInput("\u001b[O\u001b[O")).toBe(false);
    expect(shouldResetTerminalObservationForInput("a")).toBe(true);
    expect(shouldResetTerminalObservationForInput("\r")).toBe(true);
    expect(shouldResetTerminalObservationForInput("\u001b[Oa")).toBe(true);
  });

  it("resolves project row terminal activity from candidate or path keys", () => {
    const candidate = { id: "candidate:/workspace/App", path: "/workspace/App" };
    expect(terminalActivityForCandidate(candidate, { "candidate:/workspace/App": "working" })).toBe("working");
    expect(terminalActivityForCandidate(candidate, { "/workspace/App": "idle" })).toBe("idle");
    expect(terminalActivityForCandidate(candidate, {})).toBeNull();
  });

  it("excludes service tabs from project terminal activity labels", () => {
    expect(
      projectTerminalActivityStates([
        { projectId: "project-a", tabs: [{ activityState: "working", session: { service: { id: "dev" } } }] },
      ]),
    ).toEqual({});

    expect(
      projectTerminalActivityStates([
        { projectId: "project-a", tabs: [{ activityState: "working", session: {} }] },
        { projectId: "project-b", tabs: [{ activityState: "done", session: {} }] },
      ]),
    ).toEqual({ "project-a": "working", "project-b": "idle" });
  });
});
