import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewRunManager, type ReviewRunManagerDeps } from "../src/main/review-runs.js";
import type { TaskViewModel } from "../src/main/tasks.js";
import type { TerminalCreateInput, TerminalSession } from "../src/shared/types.js";
import { makeTempRoot } from "./helpers.js";

describe("ReviewRunManager", () => {
  it("validates completion and retries parent notification after a draft clears", async () => {
    const repo = await makeTempRoot("review-runs");
    const task = taskFixture(repo);
    const created: TerminalCreateInput[] = [];
    let notifyCalls = 0;
    const deps = managerDeps(repo, task, created, async () => ({
      state: ++notifyCalls === 1 ? "draft-pending" : "submitted",
      session: parentSession(repo),
    }));
    const manager = new ReviewRunManager({ ...deps, notificationRetryMs: 5 });

    const started = await manager.start({
      repoPath: repo,
      taskId: task.taskId,
      agentId: "opencode",
      origin: "agent",
      parentTerminalSessionId: "term-parent",
    });

    expect(started.run.status).toBe("running");
    expect(created[0]).toMatchObject({
      agentId: "opencode",
      review: {
        taskId: task.taskId,
        runId: started.run.id,
        reviewPath: started.run.reportPath,
        completionToken: expect.any(String),
      },
    });
    const completionToken = created[0]!.review!.completionToken!;
    await expect(manager.complete({
      runId: started.run.id,
      reportPath: started.run.reportPath,
      completionToken: "wrong-token",
    })).rejects.toThrow("Only the reviewer can complete");
    await expect(manager.complete({
      runId: started.run.id,
      reportPath: started.run.reportPath,
      completionToken,
    })).rejects.toThrow("missing or empty");
    expect(manager.status(started.run.id).status).toBe("running");

    const outsideReport = path.join(repo, "outside-report.md");
    await fs.writeFile(outsideReport, "not the reserved report\n", "utf8");
    await fs.rm(path.join(repo, started.run.reportPath));
    await fs.symlink(outsideReport, path.join(repo, started.run.reportPath));
    await expect(manager.complete({
      runId: started.run.id,
      reportPath: started.run.reportPath,
      completionToken,
    })).rejects.toThrow("missing or empty");
    await fs.rm(path.join(repo, started.run.reportPath));
    await fs.writeFile(path.join(repo, started.run.reportPath), "Verdict: pass\n", "utf8");
    const completed = await manager.complete({
      runId: started.run.id,
      reportPath: started.run.reportPath,
      completionToken,
    });
    expect(completed.status).toBe("completed");
    expect(completed.notifiedAt).toBeUndefined();

    await expect(waitFor(() => manager.status(started.run.id).notifiedAt)).resolves.toBeTruthy();
    expect(notifyCalls).toBe(2);
    manager.dispose();
  });

  it("fails a running Review when its reviewer terminal exits", async () => {
    const repo = await makeTempRoot("review-runs-exit");
    const task = taskFixture(repo);
    const notifications: string[] = [];
    let notifyCalls = 0;
    const manager = new ReviewRunManager({
      ...managerDeps(repo, task, [], async (_sessionId, text) => {
        notifications.push(text);
        if (++notifyCalls === 1) throw new Error("transient notification failure");
        return { state: "submitted", session: parentSession(repo) };
      }),
      notificationRetryMs: 5,
    });
    const started = await manager.start({
      repoPath: repo,
      taskId: task.taskId,
      agentId: "codewhale",
      origin: "agent",
      parentTerminalSessionId: "term-parent",
    });

    await expect(manager.wait(started.run.id, "term-parent", 1)).resolves.toMatchObject({ status: "running" });
    const waiting = manager.wait(started.run.id, "term-parent", 1000);
    manager.handleTerminalExit(started.run.reviewerTerminalSessionId);

    await expect(waiting).resolves.toMatchObject({
      status: "failed",
      error: expect.stringContaining("exited before completing"),
    });
    await expect(waitFor(() => manager.status(started.run.id).notifiedAt)).resolves.toBeTruthy();
    expect(notifyCalls).toBe(2);
    expect(notifications[0]).toContain(`Review \`${started.run.id}\` by codewhale failed`);
    expect(notifications[0]).toContain(`review.sh status --run ${started.run.id}`);
    await expect(waitForMissing(path.join(repo, ".sharkbay", "reviews", "TASK01-TEST01.md"))).resolves.toBe(true);
    manager.dispose();
  });

  it("removes the reserved empty report when reviewer startup fails", async () => {
    const repo = await makeTempRoot("review-runs-start-failure");
    const task = taskFixture(repo);
    const deps = managerDeps(repo, task, [], async () => null);
    deps.createTerminal = async () => { throw new Error("reviewer failed to start"); };
    const manager = new ReviewRunManager(deps);

    await expect(manager.start({
      repoPath: repo,
      taskId: task.taskId,
      agentId: "opencode",
      origin: "agent",
      parentTerminalSessionId: "term-parent",
    })).rejects.toThrow("reviewer failed to start");

    await expect(fs.stat(path.join(repo, ".sharkbay", "reviews", "TASK01-TEST01.md")).catch(() => null)).resolves.toBeNull();
    manager.dispose();
  });
});

function managerDeps(
  repo: string,
  task: TaskViewModel,
  created: TerminalCreateInput[],
  notifyTerminal: ReviewRunManagerDeps["notifyTerminal"],
): ReviewRunManagerDeps {
  return {
    resolveRepoPath: async () => repo,
    scanTasks: async () => [task],
    listAgentClis: async () => [
      { id: "opencode", label: "OpenCode", command: "opencode", executablePath: "/usr/local/bin/opencode", shortLabel: "OC" },
      { id: "codewhale", label: "CodeWhale", command: "codewhale", executablePath: "/usr/local/bin/codewhale", shortLabel: "CW" },
    ],
    createTerminal: async (input) => {
      created.push(input);
      return reviewerSession(input.cwdUri, input.agentId);
    },
    inspectTerminal: async () => ({ session: parentSession(repo), projectRoot: repo, hasPendingInput: false }),
    notifyTerminal,
    closeTerminal: async () => undefined,
    reserveReviewPath: async (_repoPath, taskId) => {
      const relative = `.sharkbay/reviews/${taskId.split("-")[0]}-TEST01.md`;
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
    title: "Review task",
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

function parentSession(repo: string): TerminalSession {
  return {
    id: "term-parent",
    cwdUri: `local:${encodeURI(repo)}`,
    title: "codex",
    shell: "/bin/zsh",
    pid: 100,
    status: "running",
    createdAt: "2026-07-13T00:00:00.000Z",
    agentId: "codex",
  };
}

function reviewerSession(cwdUri: string, agentId?: string): TerminalSession {
  return {
    id: "term-reviewer",
    cwdUri,
    title: "Review",
    shell: "/bin/zsh",
    pid: 101,
    status: "running",
    createdAt: "2026-07-13T00:00:00.000Z",
    agentId,
  };
}

async function waitFor(read: () => string | undefined): Promise<string | undefined> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return undefined;
}

async function waitForMissing(filePath: string): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!await fs.stat(filePath).catch(() => null)) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
}
