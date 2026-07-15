import type { TaskViewModel } from "./types.js";

const TASK_FILE_STATUS_ANNOTATION = /\s*\((?:new|added|modified|deleted|renamed)\)\s*$/i;
const TASK_FILE_NEW_ANNOTATION = /\s*\((?:new|added)\)\s*$/i;
const TASK_TAB_TITLE_LENGTH = 10;
const taskTitleSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function taskTitlesBySessionId(tasks: TaskViewModel[]): Record<string, string> {
  const latest = new Map<string, { title: string; createdAt: number }>();
  for (const task of tasks) {
    const sessionId = task.sessionId?.trim();
    const title = task.title.trim();
    if (!sessionId || !title) continue;
    const createdAt = Date.parse(task.createdAt ?? "");
    const existing = latest.get(sessionId);
    if (!existing || (Number.isFinite(createdAt) && (!Number.isFinite(existing.createdAt) || createdAt > existing.createdAt))) {
      latest.set(sessionId, { title, createdAt });
    }
  }
  return Object.fromEntries([...latest].map(([sessionId, task]) => [sessionId, task.title]));
}

export function formatTaskTabTitle(title: string): string {
  const graphemes = [...taskTitleSegmenter.segment(title.trim())].map((part) => part.segment);
  return graphemes.length > TASK_TAB_TITLE_LENGTH
    ? `${graphemes.slice(0, TASK_TAB_TITLE_LENGTH).join("")}...`
    : graphemes.join("");
}

export function taskDetailCommits(task: TaskViewModel): string[] {
  if (task.commits?.length) return task.commits;
  if (task.commit) return [task.commit];
  const match = task.rawMarkdown.match(/^commits:\s*\n((?:\s+-\s+.+\n?)+)/m);
  return match?.[1]?.split("\n").map((line) => line.replace(/^\s*-\s*/, "").trim()).filter(Boolean) ?? [];
}

export function taskDetailLines(value?: string): string[] {
  return (value ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

export function stripTaskBullet(line: string): string {
  return line.replace(/^[-*]\s+/, "");
}

/** Extract the first `.html` path token from an Artifacts record line, if any. */
export function extractArtifactPath(line: string): string | null {
  const match = line.match(/[^\s`'"]+\.html/);
  return match ? match[0] : null;
}

/** Extract the first `.md` path token from a Reviews record line, if any. */
export function extractReviewPath(line: string): string | null {
  const match = line.match(/[^\s`'"]+\.md/);
  return match ? match[0] : null;
}

export function taskFileActionPath(file: string): string {
  return file.replace(TASK_FILE_STATUS_ANNOTATION, "").trim();
}

export function isNewTaskFileRecord(file: string): boolean {
  return TASK_FILE_NEW_ANNOTATION.test(file);
}

export function shouldOpenTaskFileDiff(file: string, actionPath: string, commits: string[], dirtyStatus?: string): boolean {
  if (isNewTaskFileRecord(file)) return false;
  return commits.length > 0 || Boolean(dirtyStatus && dirtyStatus !== "??");
}
