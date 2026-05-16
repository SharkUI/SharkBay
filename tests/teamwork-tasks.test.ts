import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanTasks } from "../src/main/teamwork-tasks.js";
import { makeTempRoot, writeText } from "./helpers.js";

describe("teamwork task scanning", () => {
  it("adds GitHub avatar URLs and sorts tasks by created time descending", async () => {
    const repo = await makeTempRoot("teamwork-tasks");
    await writeTask(repo, ".sharkbay/tasks/OLD001-u3960864-mjl25uj-old-task.md", {
      taskId: "OLD001-u3960864-mjl25uj",
      taskTag: "OLD001",
      title: "Old task",
      createdAt: "2026-05-16T01:00:00Z",
      githubUserId: 3960864,
    });
    await writeTask(repo, ".sharkbay/team-context/tasks/2026/05/NEW001-u123456-mabc123-new-task.md", {
      taskId: "NEW001-u123456-mabc123",
      taskTag: "NEW001",
      title: "New task",
      createdAt: "2026-05-16T03:00:00Z",
      githubUserId: 123456,
    });

    const tasks = await scanTasks(repo);

    expect(tasks.map((task) => task.taskId)).toEqual([
      "NEW001-u123456-mabc123",
      "OLD001-u3960864-mjl25uj",
    ]);
    expect(tasks[0]?.owner.avatarUrl).toBe("https://avatars.githubusercontent.com/u/123456?v=4");
    expect(tasks[1]?.owner.avatarUrl).toBe("https://avatars.githubusercontent.com/u/3960864?v=4");
    expect(tasks[0]?.frontmatter).toEqual(expect.objectContaining({ title: "New task", githubUserId: "123456" }));
    expect(tasks[0]?.bodyMarkdown).toContain("## Summary");
    expect(tasks[0]?.rawMarkdown).toContain("kind: sharkbay_task");
    expect(tasks[0]?.sourcePath).toContain("NEW001-u123456-mabc123-new-task.md");
  });
});

async function writeTask(
  repo: string,
  relativePath: string,
  input: { taskId: string; taskTag: string; title: string; createdAt: string; githubUserId: number },
): Promise<void> {
  await writeText(path.join(repo, relativePath), [
    "---",
    "kind: sharkbay_task",
    `taskId: ${input.taskId}`,
    `taskTag: ${input.taskTag}`,
    "mode: quick",
    `title: ${input.title}`,
    "status: completed",
    "actor: SharkUI",
    `githubUserId: ${input.githubUserId}`,
    "machine: jl25uj",
    "agent: codex",
    `createdAt: ${input.createdAt}`,
    `updatedAt: ${input.createdAt}`,
    `completedAt: ${input.createdAt}`,
    "---",
    "",
    "## Summary",
    "Fixture task.",
    "",
  ].join("\n"));
}
