import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanTasks } from "../src/main/tasks.js";
import { makeTempRoot, writeText } from "./helpers.js";

describe("task scanning", () => {
  it("adds GitHub avatar URLs and sorts tasks by created time descending", async () => {
    const repo = await makeTempRoot("tasks");
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
      sessionId: "11111111-1111-4111-8111-111111111111",
    });

    const tasks = await scanTasks(repo);

    expect(tasks.map((task) => task.taskId)).toEqual([
      "NEW001-u123456-mabc123",
      "OLD001-u3960864-mjl25uj",
    ]);
    expect(tasks[0]?.owner.avatarUrl).toBe("https://avatars.githubusercontent.com/u/123456?v=4");
    expect(tasks[1]?.owner.avatarUrl).toBe("https://avatars.githubusercontent.com/u/3960864?v=4");
    expect(tasks[0]?.frontmatter).toEqual(expect.objectContaining({ title: "New task", githubUserId: "123456" }));
    expect(tasks[0]?.sessionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(tasks[0]?.bodyMarkdown).toContain("## Summary");
    expect(tasks[0]?.rawMarkdown).toContain("kind: sharkbay_task");
    expect(tasks[0]?.sourcePath).toContain("NEW001-u123456-mabc123-new-task.md");
  });

  it("extracts all lines from multi-line task sections", async () => {
    const repo = await makeTempRoot("tasks-sections");
    await writeText(path.join(repo, ".sharkbay/tasks/MULTI1-u3960864-mjl25uj-multi-section.md"), [
      "---",
      "kind: sharkbay_task",
      "taskId: MULTI1-u3960864-mjl25uj",
      "taskTag: MULTI1",
      "mode: quick",
      "title: Multi section task",
      "status: completed",
      "actor: SharkUI",
      "githubUserId: 3960864",
      "machine: jl25uj",
      "agent: codex",
      "createdAt: 2026-05-16T01:00:00Z",
      "updatedAt: 2026-05-16T01:00:00Z",
      "completedAt: 2026-05-16T01:00:00Z",
      "commits:",
      "  - abc123",
      "  - def456",
      "---",
      "",
      "## Summary",
      "Fixture task.",
      "",
      "## Files",
      "- src/one.ts",
      "- src/two.ts",
      "",
      "## Work",
      "- First step.",
      "- Second step.",
      "",
      "## Verification",
      "- `npm test` passed.",
      "- `npm run build` passed.",
      "",
      "## Notes",
      "- First note.",
      "- Second note.",
      "",
    ].join("\n"));

    const tasks = await scanTasks(repo);
    const task = tasks[0];

    expect(task?.files).toEqual(["src/one.ts", "src/two.ts"]);
    expect(task?.work).toBe("- First step.\n- Second step.");
    expect(task?.verification).toBe("- `npm test` passed.\n- `npm run build` passed.");
    expect(task?.notes).toBe("- First note.\n- Second note.");
    expect(task?.commits).toEqual(["abc123", "def456"]);
  });

  it("keeps local completed task when it has commit metadata missing from team mirror", async () => {
    const repo = await makeTempRoot("tasks-commit-merge");
    const taskPath = "X4K7R2-u3960864-m0dae87-admin-delete-post.md";
    const base = [
      "kind: sharkbay_task",
      "taskId: X4K7R2-u3960864-m0dae87",
      "taskTag: X4K7R2",
      "mode: task",
      "title: Admin delete social post",
      "status: completed",
      "actor: SharkUI",
      "githubUserId: 3960864",
      "machine: m0dae87",
      "agent: Kiro Claude 4.6",
      "createdAt: 2026-06-11T02:02:01Z",
      "updatedAt: 2026-06-11T02:04:24Z",
    ];
    const body = [
      "## Summary",
      "Allow superAdmin users to delete any social post.",
      "",
      "## Files",
      "- packages/server/src/routes/social.ts",
      "- packages/web/src/pages/PostDetailPage.tsx",
      "",
    ].join("\n");

    await writeText(path.join(repo, ".sharkbay", "team-context", "tasks", "2026", "06", taskPath), [
      "---",
      ...base,
      "---",
      "",
      body,
    ].join("\n"));
    await writeText(path.join(repo, ".sharkbay", "tasks", taskPath), [
      "---",
      ...base,
      "commits:",
      "  - 8831eda2",
      "---",
      "",
      body,
    ].join("\n"));

    const tasks = await scanTasks(repo);
    const task = tasks.find((item) => item.taskId === "X4K7R2-u3960864-m0dae87");

    expect(task?.sourceKind).toBe("local-md");
    expect(task?.commits).toEqual(["8831eda2"]);
  });
});

async function writeTask(
  repo: string,
  relativePath: string,
  input: { taskId: string; taskTag: string; title: string; createdAt: string; githubUserId: number; sessionId?: string },
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
    input.sessionId ? `sessionId: ${input.sessionId}` : null,
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
