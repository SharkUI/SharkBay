import { describe, expect, it } from "vitest";
import { addConfiguredRemoteMachine } from "../src/main/config.js";
import { SshProvider } from "../src/providers/ssh/ssh-provider.js";
import { makeTestRuntime } from "./helpers.js";

describe("SshProvider", () => {
  it("exposes remote project profile through the final provider interface", async () => {
    const runtime = await makeTestRuntime("ssh-provider");
    await addConfiguredRemoteMachine(runtime, {
      label: "GPU Worker",
      authMode: "system-ssh-config",
      sshConfigHost: "gpu-01",
    });
    const provider = new SshProvider({
      runner: async (args) => {
        const command = args.at(-1) ?? "";
        if (command.includes("'rev-parse'")) return { stdout: "/home/app/model-worker\n", stderr: "" };
        if (command.includes("'branch'")) return { stdout: "main\n", stderr: "" };
        if (command.includes("'symbolic-ref'")) return { stdout: "refs/remotes/origin/main\n", stderr: "" };
        if (command.includes("'config'")) return { stdout: "git@github.com:org/model-worker.git\n", stderr: "" };
        if (command.includes("'status'")) return { stdout: "", stderr: "" };
        throw new Error(`Unexpected command: ${command}`);
      },
    });

    const profile = await provider.readProjectProfile(runtime, "ssh://gpu-01/home/app/model-worker");

    expect(profile).toMatchObject({
      projectUri: "ssh://gpu-01/home/app/model-worker",
      targetId: "gpu-01",
      targetKind: "ssh",
      name: "model-worker",
      displayPath: "gpu-01:/home/app/model-worker",
      vcs: {
        type: "git",
        root: "/home/app/model-worker",
        branch: "main",
        remoteOrigin: "git@github.com:org/model-worker.git",
        dirty: false,
      },
    });
  });
});
