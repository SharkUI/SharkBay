import { describe, expect, it } from "vitest";
import { createAgentMachineDetector } from "../src/plugins/bundled/agent-detector.js";
import type { MachineProbeContext } from "../src/core/execution-provider.js";

describe("Agent bundled detector", () => {
  it("reports available and missing agent CLIs in machine profile shape", async () => {
    const detector = createAgentMachineDetector();
    const ctx: MachineProbeContext = {
      target: {
        id: "local",
        kind: "local",
        label: "Local",
        status: "available",
        uri: "local:",
        displayPath: "Local",
        createdAt: "2026-05-16T00:00:00Z",
        updatedAt: "2026-05-16T00:00:00Z",
      },
      which: async (command) => command === "codex" ? "/opt/homebrew/bin/codex" : null,
      run: async (command) => ({
        stdout: command.includes("codex") ? "codex 1.2.3\n" : "",
        stderr: "",
        exitCode: 0,
      }),
      readTextFile: async () => null,
    };

    const patch = await detector.run(ctx);

    expect(patch.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "codex",
        command: "codex",
        available: true,
        path: "/opt/homebrew/bin/codex",
        version: "codex 1.2.3",
      }),
      expect.objectContaining({
        id: "claude",
        command: "claude",
        available: false,
        path: null,
        version: null,
      }),
    ]));
  });
});
