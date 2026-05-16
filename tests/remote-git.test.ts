import { describe, expect, it } from "vitest";
import { addConfiguredRemoteMachine } from "../src/main/config.js";
import { readRemoteGitDirtyFiles, readRemoteGitHistory, readRemoteGitMetadata } from "../src/main/remote-git.js";
import { makeTestRuntime } from "./helpers.js";

describe("remote git", () => {
  it("reads git metadata, history, and dirty files over ssh", async () => {
    const runtime = await makeTestRuntime("remote-git");
    await addConfiguredRemoteMachine(runtime, {
      label: "GPU Worker",
      authMode: "system-ssh-config",
      sshConfigHost: "gpu-01",
    });
    const calls: string[][] = [];
    const projectUri = "ssh://gpu-01/home/app/model-worker";
    const runner = async (args: string[]) => {
      calls.push(args);
      const command = args.at(-1) ?? "";
      if (command.includes("'rev-parse'")) return { stdout: "/home/app/model-worker\n", stderr: "" };
      if (command.includes("'branch'")) return { stdout: "main\n", stderr: "" };
      if (command.includes("'symbolic-ref'")) return { stdout: "refs/remotes/origin/main\n", stderr: "" };
      if (command.includes("'config'")) return { stdout: "git@github.com:org/model-worker.git\n", stderr: "" };
      if (command.includes("'status'") && command.includes("'-uall'")) return { stdout: " M README.md\n?? src/new.ts\n", stderr: "" };
      if (command.includes("'status'")) return { stdout: " M README.md\n", stderr: "" };
      if (command.includes("'reflog'")) {
        return { stdout: "abc123\u001fHEAD@{0}\u001fcommit: update\u001f2026-05-15T00:00:00+00:00\n", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command}`);
    };

    const [metadata, history, dirtyFiles] = await Promise.all([
      readRemoteGitMetadata(runtime, projectUri, { runner }),
      readRemoteGitHistory(runtime, projectUri, 50, { runner }),
      readRemoteGitDirtyFiles(runtime, projectUri, { runner }),
    ]);

    expect(metadata).toMatchObject({
      isGitRepository: true,
      gitRoot: "/home/app/model-worker",
      currentBranch: "main",
      defaultBranch: "main",
      remoteOrigin: "git@github.com:org/model-worker.git",
      dirtyWorktree: true,
    });
    expect(history).toEqual([{
      hash: "abc123",
      selector: "HEAD@{0}",
      action: "commit: update",
      date: "2026-05-15T00:00:00+00:00",
    }]);
    expect(dirtyFiles.map((file) => file.path)).toEqual(["README.md", "src/new.ts"]);
    expect(calls[0]).toEqual(expect.arrayContaining(["-o", "BatchMode=yes", "gpu-01", "--"]));
    expect(calls.map((args) => args.at(-1))).toContain("sh -c 'git -C '\\''/home/app/model-worker'\\'' '\\''rev-parse'\\'' '\\''--show-toplevel'\\'''");
  });
});
