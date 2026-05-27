import { describe, expect, it } from "vitest";
import {
  firstHttpUrl,
  observeServiceUrl,
  projectTerminalActivityStates,
  resolveSelectedCandidate,
  shouldEnsureCodeGraphForSelection,
  shouldKeepCurrentServiceUrl,
  shouldResetTerminalObservationForInput,
  terminalActivityAfterQuiet,
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
      { id: "local:/workspace/A", uri: "local:/workspace/A", name: "A", providerId: "local", providerKind: "local" as const, displayPath: "/workspace/A", rootUri: "local:/workspace" },
      { id: "local:/workspace/B", uri: "local:/workspace/B", name: "B", providerId: "local", providerKind: "local" as const, displayPath: "/workspace/B", rootUri: "local:/workspace" },
    ];
    expect(resolveSelectedCandidate(candidates, "local:/workspace/B")?.id).toBe("local:/workspace/B");
    expect(resolveSelectedCandidate(candidates, "/workspace/missing")?.id).toBe("local:/workspace/A");
    expect(resolveSelectedCandidate([], null)).toBeNull();
  });

  it("does not treat terminal focus control sequences as user input", () => {
    expect(shouldResetTerminalObservationForInput("\u001b[I")).toBe(false);
    expect(shouldResetTerminalObservationForInput("\u001b[O")).toBe(false);
    expect(shouldResetTerminalObservationForInput("\u001b[O\u001b[I")).toBe(false);
    expect(shouldResetTerminalObservationForInput("\u001b[O\u001b[O")).toBe(false);
    expect(shouldResetTerminalObservationForInput("\u001b[?1004h")).toBe(false);
    expect(shouldResetTerminalObservationForInput("\u001b[?1004l")).toBe(false);
    expect(shouldResetTerminalObservationForInput("a")).toBe(true);
    expect(shouldResetTerminalObservationForInput("\r")).toBe(true);
    expect(shouldResetTerminalObservationForInput("\u001b[Oa")).toBe(true);
  });

  it("resolves project row terminal activity from candidate or path keys", () => {
    const candidate = { id: "local:/workspace/App", uri: "local:/workspace/App" };
    expect(terminalActivityForCandidate(candidate, { "local:/workspace/App": "working" })).toBe("working");
    expect(terminalActivityForCandidate(candidate, {})).toBeNull();
  });

  it("downgrades working activity to attention after terminal output goes quiet", () => {
    expect(terminalActivityAfterQuiet("working")).toBe("done");
    expect(terminalActivityAfterQuiet("done")).toBe("idle");
    expect(terminalActivityAfterQuiet("idle")).toBe("idle");
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

  it("prefers local service URLs and keeps them over later documentation links", () => {
    const nextOutput = [
      "- Local:         http://localhost:3000",
      "- Network:       http://10.1.2.243:3000",
      "See https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory",
    ].join("\n");

    expect(firstHttpUrl(nextOutput)).toBe("http://localhost:3000");
    expect(shouldKeepCurrentServiceUrl("http://localhost:3000", "https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory")).toBe(true);
    expect(shouldKeepCurrentServiceUrl("https://nextjs.org/docs", "http://127.0.0.1:3000")).toBe(false);
  });

  it("initializes unindexed local Git projects when selected", () => {
    expect(shouldEnsureCodeGraphForSelection({
      providerKind: "local",
      isGitManaged: true,
      statusState: "uninitialized",
    })).toBe(true);
    expect(shouldEnsureCodeGraphForSelection({
      providerKind: "local",
      isGitManaged: true,
      statusState: "stale",
    })).toBe(false);
    expect(shouldEnsureCodeGraphForSelection({
      providerKind: "local",
      isGitManaged: false,
      statusState: "uninitialized",
    })).toBe(false);
    expect(shouldEnsureCodeGraphForSelection({
      providerKind: "ssh",
      isGitManaged: true,
      statusState: "uninitialized",
    })).toBe(false);
  });

  it("observes service URLs across streamed terminal chunks", () => {
    let observation = observeServiceUrl("", "  ➜  Local:   http://localhost");
    expect(observation.url).toBeNull();

    observation = observeServiceUrl(observation.output, ":7777/\r\n  ➜  Network: use --host to expose");
    expect(observation.url).toBe("http://localhost:7777/");
  });

  it("keeps URLs intact when ANSI styling splits host and port", () => {
    const viteOutput = "  \u001b[32m➜\u001b[39m  Local:   \u001b[36mhttp://localhost:\u001b[1m7777\u001b[22m/\u001b[39m";
    expect(firstHttpUrl(viteOutput)).toBe("http://localhost:7777/");

    let observation = observeServiceUrl("", "  ➜  Local:   \u001b[36mhttp://localhost:\u001b[1m");
    expect(observation.url).toBeNull();

    observation = observeServiceUrl(observation.output, "7777\u001b[22m/\u001b[39m");
    expect(observation.url).toBe("http://localhost:7777/");
  });
});
