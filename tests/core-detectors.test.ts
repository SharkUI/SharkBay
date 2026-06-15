import { describe, expect, it } from "vitest";
import { createCoreMachineDetector } from "../src/plugins/bundled/core-detectors.js";
import type { MachineProbeContext } from "../src/core/execution-provider.js";

describe("Core bundled detectors", () => {
  it("ignores shell startup control sequences when parsing machine profile output", async () => {
    const detector = createCoreMachineDetector();
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
      which: async () => null,
      run: async (command) => {
        if (command.startsWith("hostname")) {
          return { stdout: "\u001b]697;DoneSourcing\u0007host.local\n", stderr: "", exitCode: 0 };
        }
        if (command.startsWith("uname")) {
          return { stdout: "\u001b]697;DoneSourcing\u0007Darwin 25.4.0 arm64\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "\u001b]697;DoneSourcing\u0007/bin/zsh", stderr: "", exitCode: 0 };
      },
      readTextFile: async () => null,
    };

    const patch = await detector.run(ctx);

    expect(patch.hostname).toBe("host.local");
    expect(patch.os?.platform).toBe("darwin");
    expect(patch.shell?.path).toBe("/bin/zsh");
  });
});
