import { describe, expect, it } from "vitest";
import {
  isNewTaskFileRecord,
  shouldOpenTaskFileDiff,
  taskDetailCommits,
  taskFileActionPath,
  extractArtifactPath,
  extractReviewPath,
} from "../src/shared/task-detail-helpers.js";
import type { TaskViewModel } from "../src/shared/types.js";

describe("task detail helpers", () => {
  it("normalizes task file status annotations with or without a separating space", () => {
    expect(taskFileActionPath("packages/server/src/middleware/proxy-secret.ts (new)")).toBe("packages/server/src/middleware/proxy-secret.ts");
    expect(taskFileActionPath("packages/server/src/middleware/proxy-secret.ts(new)")).toBe("packages/server/src/middleware/proxy-secret.ts");
    expect(taskFileActionPath("src/old.ts(deleted)")).toBe("src/old.ts");
    expect(taskFileActionPath("src/changed.ts (modified)")).toBe("src/changed.ts");
    expect(taskFileActionPath("src/regular.ts")).toBe("src/regular.ts");
  });

  it("detects new task file records with or without a separating space", () => {
    expect(isNewTaskFileRecord("src/new.ts (new)")).toBe(true);
    expect(isNewTaskFileRecord("src/new.ts(new)")).toBe(true);
    expect(isNewTaskFileRecord("src/added.ts(added)")).toBe(true);
    expect(isNewTaskFileRecord("src/deleted.ts(deleted)")).toBe(false);
    expect(isNewTaskFileRecord("src/regular.ts")).toBe(false);
  });

  it("routes task file rows to diff only when the row has diffable state", () => {
    expect(shouldOpenTaskFileDiff("src/new.ts(new)", "src/new.ts", ["abc123"])).toBe(false);
    expect(shouldOpenTaskFileDiff("src/changed.ts", "src/changed.ts", ["abc123"])).toBe(true);
    expect(shouldOpenTaskFileDiff("src/changed.ts", "src/changed.ts", [], "M")).toBe(true);
    expect(shouldOpenTaskFileDiff("src/untracked.ts", "src/untracked.ts", [], "??")).toBe(false);
    expect(shouldOpenTaskFileDiff("src/clean.ts", "src/clean.ts", [])).toBe(false);
  });

  it("extracts artifact and review paths from record lines", () => {
    expect(extractArtifactPath("- `.sharkbay/site/artifacts/T1/ab12cd.html` shows the overview")).toBe(".sharkbay/site/artifacts/T1/ab12cd.html");
    expect(extractArtifactPath("- .sharkbay/site/artifacts/T1/plain.html overview")).toBe(".sharkbay/site/artifacts/T1/plain.html");
    expect(extractArtifactPath("- no artifact here")).toBeNull();

    expect(extractReviewPath("- Looks good `.sharkbay/reviews/T1-AB12CD.md` verdict")).toBe(".sharkbay/reviews/T1-AB12CD.md");
    expect(extractReviewPath("- Blocker in .sharkbay/reviews/T1-XY.md today")).toBe(".sharkbay/reviews/T1-XY.md");
    expect(extractReviewPath("- verdict only")).toBeNull();
  });

  it("falls back from structured commits to legacy commit and raw frontmatter commits", () => {
    expect(taskDetailCommits(task({ commits: ["abc123", "def456"], commit: "legacy" }))).toEqual(["abc123", "def456"]);
    expect(taskDetailCommits(task({ commits: [], commit: "legacy" }))).toEqual(["legacy"]);
    expect(taskDetailCommits(task({
      rawMarkdown: [
        "---",
        "commits:",
        "  - raw-one",
        "  - raw-two",
        "---",
      ].join("\n"),
    }))).toEqual(["raw-one", "raw-two"]);
  });
});

function task(overrides: Partial<TaskViewModel>): TaskViewModel {
  return {
    taskId: "T1-u3960864-m81ae10",
    taskTag: "T1",
    title: "Task",
    status: "completed",
    mode: "task",
    agent: "Codex",
    owner: {
      githubUserId: 3960864,
      githubLogin: "SharkUI",
      avatarUrl: "https://avatars.githubusercontent.com/u/3960864?v=4",
    },
    machine: "81ae10",
    createdAt: "2026-06-19T00:00:00Z",
    updatedAt: "2026-06-19T00:00:00Z",
    sync: "synced",
    sourceKind: "local-md",
    sourcePath: ".sharkbay/tasks/T1-u3960864-m81ae10-task.md",
    readOnly: false,
    frontmatter: {},
    bodyMarkdown: "",
    rawMarkdown: "",
    files: [],
    ...overrides,
  };
}
