import { readFile, readdir } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

export type TaskViewModel = {
  taskId: string;
  taskTag: string;
  title: string;
  mode: "quick" | "task";
  status: "active" | "paused" | "completed" | "blocked" | "abandoned";
  sync: "local" | "pending" | "synced" | "failed";
  owner: { githubLogin: string; githubUserId?: number; avatarUrl?: string };
  agent?: string;
  machine?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  commit?: string;
  files?: string[];
  summary?: string;
  verification?: string;
  work?: string;
  notes?: string;
  sourceKind: "local-md" | "team-md";
  readOnly: boolean;
};

export async function parseTaskFile(filePath: string): Promise<TaskViewModel | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const fm = parseFrontmatter(match[1]!);
  const body = match[2] ?? "";

  if (!fm["taskId"] || !fm["title"]) return null;

  const isTeam = filePath.includes("team-context/tasks");

  return {
    taskId: fm["taskId"]!,
    taskTag: fm["taskTag"] ?? "",
    title: fm["title"]!,
    mode: (fm["mode"] as TaskViewModel["mode"]) ?? "task",
    status: (fm["status"] as TaskViewModel["status"]) ?? "active",
    sync: (fm["sync"] as TaskViewModel["sync"]) ?? (isTeam ? "synced" : "local"),
    owner: { githubLogin: fm["actor"] ?? fm["owner"] ?? "unknown", githubUserId: fm["githubUserId"] ? Number(fm["githubUserId"]) : undefined },
    agent: fm["agent"],
    machine: fm["machine"],
    createdAt: fm["createdAt"],
    updatedAt: fm["updatedAt"],
    completedAt: fm["completedAt"],
    commit: fm["commit"],
    files: extractFilesList(body),
    summary: extractSection(body, "Summary"),
    verification: extractSection(body, "Verification"),
    work: extractSection(body, "Work"),
    notes: extractSection(body, "Notes"),
    sourceKind: isTeam ? "team-md" : "local-md",
    readOnly: isTeam,
  };
}

export async function scanTasks(repoPath: string): Promise<TaskViewModel[]> {
  const localDir = join(repoPath, ".sharkbay", "tasks");
  const teamDir = join(repoPath, ".sharkbay", "team-context", "tasks");

  const [localTasks, teamTasks] = await Promise.all([
    readTaskDir(localDir),
    readTaskDir(teamDir),
  ]);

  const merged = new Map<string, TaskViewModel>();
  for (const t of teamTasks) merged.set(t.taskId, t);
  for (const t of localTasks) {
    if (t.status === "active" || t.sync === "pending" || !merged.has(t.taskId)) {
      merged.set(t.taskId, t);
    }
  }
  return [...merged.values()];
}

export function watchTasks(repoPath: string, onChange: (tasks: TaskViewModel[]) => void): () => void {
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void scanTasks(repoPath).then(onChange); }, 200);
  };

  for (const sub of ["tasks", "team-context/tasks"]) {
    try {
      const w = watch(join(repoPath, ".sharkbay", sub), { recursive: true }, debounced);
      watchers.push(w);
    } catch { /* dir may not exist yet */ }
  }

  return () => {
    if (timer) clearTimeout(timer);
    for (const w of watchers) w.close();
  };
}

async function readTaskDir(dir: string): Promise<TaskViewModel[]> {
  const results: TaskViewModel[] = [];
  await walkMdFiles(dir, results);
  return results;
}

async function walkMdFiles(dir: string, results: TaskViewModel[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (name.endsWith(".md")) {
      const task = await parseTaskFile(full);
      if (task) results.push(task);
    } else if (!name.includes(".")) {
      // Likely a directory (year/month folders don't have extensions)
      await walkMdFiles(full, results);
    }
  }
}

function parseFrontmatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

function extractSection(body: string, heading: string): string | undefined {
  const re = new RegExp(`^##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=^##\\s|$)`, "m");
  const m = body.match(re);
  return m?.[1]?.trim() || undefined;
}

function extractFilesList(body: string): string[] | undefined {
  const section = extractSection(body, "Files");
  if (!section) return undefined;
  const files = section.split("\n").map((l) => l.replace(/^-\s*/, "").trim()).filter(Boolean);
  return files.length > 0 ? files : undefined;
}
