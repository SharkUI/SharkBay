import { describe, expect, it } from "vitest";
import {
  addConfiguredRemoteMachine,
  getRuntimeConfigPath,
  loadAppConfig,
  removeConfiguredRemoteMachine,
} from "../src/main/config.js";
import { testRemoteMachineConnection } from "../src/main/remote-machines.js";
import { makeTestRuntime } from "./helpers.js";

describe("remote machines", () => {
  it("stores and removes SSH config host machines in app config", async () => {
    const runtime = await makeTestRuntime("remote-machine-config");

    const added = await addConfiguredRemoteMachine(runtime, {
      label: "GPU Worker",
      authMode: "system-ssh-config",
      sshConfigHost: "gpu-01",
      defaultProjectPath: "/home/app",
    });

    expect(added.configuredRemoteMachines).toEqual([
      expect.objectContaining({
        id: "gpu-01",
        label: "GPU Worker",
        host: "gpu-01",
        port: 22,
        sshConfigHost: "gpu-01",
        authMode: "system-ssh-config",
        defaultProjectPath: "/home/app",
      }),
    ]);

    const loaded = await loadAppConfig(getRuntimeConfigPath(runtime));
    expect(loaded.configuredRemoteMachines).toHaveLength(1);

    const removed = await removeConfiguredRemoteMachine(runtime, { id: "gpu-01" });
    expect(removed.configuredRemoteMachines).toEqual([]);
  });

  it("tests saved machines with system ssh batch mode", async () => {
    const runtime = await makeTestRuntime("remote-machine-test");
    await addConfiguredRemoteMachine(runtime, {
      label: "GPU Worker",
      authMode: "system-ssh-config",
      sshConfigHost: "gpu-01",
    });
    const calls: Array<{ args: string[]; timeoutMs: number }> = [];

    const result = await testRemoteMachineConnection(runtime, { id: "gpu-01" }, async (args, timeoutMs) => {
      calls.push({ args, timeoutMs });
      return { stdout: "sharkbay-ok", stderr: "" };
    });

    expect(result).toEqual({ ok: true, message: "Connected." });
    expect(calls).toEqual([
      {
        args: [
          "-o", "BatchMode=yes",
          "-o", "ConnectTimeout=8",
          "gpu-01",
          "--",
          "printf",
          "sharkbay-ok",
        ],
        timeoutMs: 8000,
      },
    ]);
  });

  it("builds SSH args for key-file machines without storing key contents", async () => {
    const runtime = await makeTestRuntime("remote-machine-key-file");
    const added = await addConfiguredRemoteMachine(runtime, {
      label: "Raw GPU",
      authMode: "key-file",
      host: "10.0.0.8",
      port: 2222,
      username: "ubuntu",
      keyPath: "~/.ssh/gpu_key",
    });
    const machineId = added.configuredRemoteMachines[0]?.id ?? "";
    const calls: Array<string[]> = [];

    const result = await testRemoteMachineConnection(runtime, { id: machineId }, async (args) => {
      calls.push(args);
      return { stdout: "sharkbay-ok", stderr: "" };
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual([
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      "-i", "~/.ssh/gpu_key",
      "-p", "2222",
      "ubuntu@10.0.0.8",
      "--",
      "printf",
      "sharkbay-ok",
    ]);
  });

  it("stores only a password secret reference for password machines", async () => {
    const runtime = await makeTestRuntime("remote-machine-password-config");

    const added = await addConfiguredRemoteMachine(runtime, {
      label: "Password Box",
      authMode: "ssh-agent",
      host: "10.0.0.9",
      username: "deploy",
      password: "secret-password",
    });

    expect(added.configuredRemoteMachines[0]).toEqual(expect.objectContaining({
      authMode: "password",
      host: "10.0.0.9",
      username: "deploy",
      hasPassword: true,
      passwordSecretId: "remote-machine:10.0.0.9:password",
    }));
    expect(JSON.stringify(await loadAppConfig(getRuntimeConfigPath(runtime)))).not.toContain("secret-password");
  });

  it("tests password machines through askpass without putting the password in args", async () => {
    const runtime = await makeTestRuntime("remote-machine-password-test");
    const added = await addConfiguredRemoteMachine(runtime, {
      label: "Password Box",
      authMode: "ssh-agent",
      host: "10.0.0.9",
      port: 2200,
      username: "deploy",
      password: "secret-password",
    });
    const machineId = added.configuredRemoteMachines[0]?.id ?? "";
    const calls: Array<{ args: string[]; password?: string }> = [];

    const result = await testRemoteMachineConnection(runtime, { id: machineId }, async (args, _timeoutMs, options) => {
      calls.push({ args, password: options?.password });
      return { stdout: "sharkbay-ok", stderr: "" };
    }, {
      get: async () => "secret-password",
      set: async () => undefined,
      delete: async () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(calls[0]?.password).toBe("secret-password");
    expect(calls[0]?.args).toContain("BatchMode=no");
    expect(calls[0]?.args).toContain("deploy@10.0.0.9");
    expect(calls[0]?.args).not.toContain("secret-password");
  });
});
