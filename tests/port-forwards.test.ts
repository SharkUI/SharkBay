import { describe, expect, it } from "vitest";
import { addConfiguredRemoteMachine } from "../src/main/config.js";
import { PortForwardManager } from "../src/main/port-forwards.js";
import { makeTestRuntime } from "./helpers.js";

describe("port forwards", () => {
  it("detects listening remote ports from ssh process output", async () => {
    const runtime = await makeTestRuntime("port-forward-detect");
    await addConfiguredRemoteMachine(runtime, {
      label: "GPU Worker",
      authMode: "system-ssh-config",
      sshConfigHost: "gpu-01",
    });
    const calls: string[][] = [];
    const manager = new PortForwardManager({
      runner: async (args) => {
        calls.push(args);
        return {
          stdout: [
            "LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:((\"node\",pid=1234,fd=22))",
            "LISTEN 0 128 0.0.0.0:5432 0.0.0.0:* users:((\"postgres\",pid=55,fd=7))",
            "LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:((\"sshd\",pid=1,fd=3))",
          ].join("\n"),
          stderr: "",
        };
      },
    });

    const detected = await manager.detect(runtime, { machineId: "gpu-01" });

    expect(detected).toEqual([
      expect.objectContaining({
        machineId: "gpu-01",
        remoteHost: "127.0.0.1",
        remotePort: 5173,
        processName: "node",
        pid: 1234,
        label: "Web app",
        protocol: "http",
        forwarded: false,
      }),
      expect.objectContaining({
        remoteHost: "127.0.0.1",
        remotePort: 5432,
        processName: "postgres",
        label: "PostgreSQL",
        protocol: null,
      }),
    ]);
    expect(calls[0]).toEqual(expect.arrayContaining(["-o", "BatchMode=yes", "gpu-01", "--"]));
  });
});
