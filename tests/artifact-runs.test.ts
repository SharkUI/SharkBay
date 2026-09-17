import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactRunManager, type ArtifactRunManagerDeps } from "../src/main/artifact-runs.js";
import type { TaskViewModel } from "../src/main/tasks.js";
import type { ArtifactReadyEvent, TerminalCreateInput, TerminalSession } from "../src/shared/types.js";
import { makeTempRoot } from "./helpers.js";

describe("ArtifactRunManager", () => {
  it("starts an Artifact agent, validates its page, opens it, and notifies the parent", async () => {
    const repo = await makeTempRoot("artifact-runs");
    const task = taskFixture(repo);
    const created: TerminalCreateInput[] = [];
    const ready: ArtifactReadyEvent[] = [];
    const notifications: string[] = [];
    let notifyCalls = 0;
    const manager = new ArtifactRunManager({
      ...managerDeps(repo, task, created, async (_sessionId, text) => {
        notifications.push(text);
        return { state: ++notifyCalls === 1 ? "draft-pending" : "submitted", session: parentSession(repo) };
      }),
      notificationRetryMs: 5,
      onReady: (event) => ready.push(event),
    });

    const started = await manager.start({
      repoPath: repo,
      taskId: task.taskId,
      parentTerminalSessionId: "term-parent",
    });
    expect(started.run.agentId).toBe("reasonix");
    expect(started.run.status).toBe("running");
    expect(created[0]).toMatchObject({
      agentId: "reasonix",
      artifact: {
        taskId: task.taskId,
        artifactPath: started.run.artifactPath,
        runId: started.run.id,
        completionToken: expect.any(String),
      },
    });

    const completionToken = created[0]!.artifact!.completionToken!;
    await expect(manager.complete({
      runId: started.run.id,
      artifactPath: started.run.artifactPath,
      completionToken,
    })).rejects.toThrow("missing or empty");

    const absoluteArtifactPath = path.join(repo, started.run.artifactPath);
    await fs.writeFile(absoluteArtifactPath, "<!doctype html><title>Task result</title>", "utf8");
    const completed = await manager.complete({
      runId: started.run.id,
      artifactPath: started.run.artifactPath,
      completionToken,
    });

    expect(completed.status).toBe("completed");
    expect(ready).toEqual([{ path: absoluteArtifactPath, repo }]);
    await expect(waitFor(() => notifyCalls === 2)).resolves.toBe(true);
    expect(notifications[0]).toContain(`saved at \`${started.run.artifactPath}\``);
    manager.dispose();
  });

  it("marks the run failed and removes an empty reservation when the Artifact terminal exits", async () => {
    const repo = await makeTempRoot("artifact-runs-exit");
    const task = taskFixture(repo);
    const notifications: string[] = [];
    const manager = new ArtifactRunManager(managerDeps(repo, task, [], async (_sessionId, text) => {
      notifications.push(text);
      return { state: "submitted", session: parentSession(repo) };
    }));
    const started = await manager.start({
      repoPath: repo,
      taskId: task.taskId,
      agentId: "opencode",
      parentTerminalSessionId: "term-parent",
    });

    manager.handleTerminalExit(started.run.artifactTerminalSessionId);

    await expect(waitFor(() => notifications.length === 1)).resolves.toBe(true);
    expect(notifications[0]).toContain(`Artifact \`${started.run.id}\` by opencode failed`);
    await expect(waitFor(async () => !await fs.stat(path.join(repo, started.run.artifactPath)).catch(() => null))).resolves.toBe(true);
    manager.dispose();
  });
});

function managerDeps(
  repo: string,
  task: TaskViewModel,
  created: TerminalCreateInput[],
  notifyTerminal: ArtifactRunManagerDeps["notifyTerminal"],
): ArtifactRunManagerDeps {
  return {
    resolveRepoPath: async () => repo,
    scanTasks: async () => [task],
    listAgentClis: async () => [
      { id: "opencode", label: "OpenCode", command: "opencode", executablePath: "/usr/local/bin/opencode", shortLabel: "OC" },
      { id: "reasonix", label: "Reasonix", command: "reasonix", executablePath: "/usr/local/bin/reasonix", shortLabel: "Rx" },
    ],
    createTerminal: async (input) => {
      created.push(input);
      return artifactSession(input.cwdUri, input.agentId);
    },
    inspectTerminal: async () => ({ session: parentSession(repo, "reasonix"), projectRoot: repo, hasPendingInput: false }),
    notifyTerminal,
    reserveArtifactPath: async (_repoPath, taskId) => {
      const relative = `.sharkbay/artifacts/${taskId.split("-")[0]}-TEST01.html`;
      await fs.mkdir(path.dirname(path.join(repo, relative)), { recursive: true });
      await fs.writeFile(path.join(repo, relative), "", "utf8");
      return relative;
    },
  };
}

function taskFixture(repo: string): TaskViewModel {
  return {
    taskId: "TASK01-u1-m1",
    taskTag: "TASK01",
    title: "Artifact task",
    mode: "task",
    status: "active",
    sync: "local",
    owner: { githubLogin: "test" },
    sourcePath: path.join(repo, ".sharkbay", "tasks", "TASK01.md"),
    frontmatter: {},
    bodyMarkdown: "",
    rawMarkdown: "",
    sourceKind: "local-md",
    readOnly: false,
  };
}

function parentSession(repo: string, agentId = "codex"): TerminalSession {
  return {
    id: "term-parent",
    cwdUri: `local:${encodeURI(repo)}`,
    title: agentId,
    shell: "/bin/zsh",
    pid: 100,
    status: "running",
    createdAt: "2026-09-17T00:00:00.000Z",
    agentId,
  };
}

function artifactSession(cwdUri: string, agentId?: string): TerminalSession {
  return {
    id: "term-artifact",
    cwdUri,
    title: "Artifact",
    shell: "/bin/zsh",
    pid: 101,
    status: "running",
    createdAt: "2026-09-17T00:00:00.000Z",
    agentId,
  };
}

async function waitFor(read: () => boolean | Promise<boolean>): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await read()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
}
