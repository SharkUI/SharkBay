import type { TaskViewModel } from "./types.js";

const TASK_FILE_STATUS_ANNOTATION = /\s*\((?:new|added|modified|deleted|renamed)\)\s*$/i;
const TASK_FILE_NEW_ANNOTATION = /\s*\((?:new|added)\)\s*$/i;

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
