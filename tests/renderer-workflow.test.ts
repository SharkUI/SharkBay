import { describe, expect, it } from "vitest";
import {
  firstHttpUrl,
  formatSessionModelName,
  observeServiceUrl,
  resolveSelectedCandidate,
  shouldEnsureCodeGraphForSelection,
  shouldKeepCurrentServiceUrl,
  projectActivityForCandidate,
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

  it("resolves project row hook activity from candidate or path keys", () => {
    const candidate = { id: "local:/workspace/App", uri: "local:/workspace/App" };
    expect(projectActivityForCandidate(candidate, { "local:/workspace/App": "working" })).toBe("working");
    expect(projectActivityForCandidate(candidate, {})).toBeNull();
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
      providerKind: "container",
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

  it("formats session model names without collapsing Codex model versions", () => {
    expect(formatSessionModelName("gpt-5.5")).toBe("gpt-5.5");
    expect(formatSessionModelName("openai/gpt-5.5")).toBe("gpt-5.5");
    expect(formatSessionModelName("us.anthropic.claude-opus-4-6-v1")).toBe("Opus 4.6");
    expect(formatSessionModelName("claude-3-5-sonnet-20241022")).toBe("Sonnet 3.5");
    expect(formatSessionModelName("models/gemini-2.5-pro")).toBe("gemini-2.5-pro");
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
