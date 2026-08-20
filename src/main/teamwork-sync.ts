import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { generateKnowledgeSite } from "./knowledge-site.js";

const execFileAsync = promisify(execFile);

const BRANCH = "sharkbay-team-context";
const REMOTE_REF = `origin/${BRANCH}`;
const TASKS_PREFIX = ".sharkbay-team-context/tasks/";
const MIRROR_DIR = ".sharkbay/team-context";
const INTERVAL_MS = 60_000;
const MAX_PUSH_RETRIES = 3;

export type SyncStatus = {
  enabled: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  lastError: string | null;
};

export type SyncResult = {
  fetched: boolean;
  pushed: string[];
  error: string | null;
};

interface CompletedTask {
  taskId: string;
  filename: string;
  completedAt: string;
  content: string;
  targetPath?: string;
}

interface RemoteTask {
  taskId: string;
  path: string;
  content: string;
  updatedAtMs: number;
}

export class TeamworkSync {
  private repoPath: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncInFlight: Promise<SyncResult> | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private pendingCount = 0;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  start(): void {
    if (this.timer) return;
    void this.syncOnce();
    this.timer = setInterval(() => { void this.syncOnce(); }, INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus(): SyncStatus {
    return {
      enabled: this.timer !== null,
      lastSyncAt: this.lastSyncAt,
      pendingCount: this.pendingCount,
      lastError: this.lastError,
    };
  }

  /** Ensure the remote context branch exists; create if missing. */
  async ensureContextBranch(repo: string, login: string): Promise<void> {
    // Check if remote branch exists
    try {
      await this.git(["ls-remote", "--exit-code", "origin", `refs/heads/${BRANCH}`]);
      // Exists — just fetch
      await this.fetch();
      return;
    } catch { /* branch doesn't exist, create it */ }

    // Create orphan branch with minimal structure
    const indexFile = join(this.repoPath, ".git", "tmp-init-index");
    const env = { ...process.env, GIT_INDEX_FILE: indexFile };
    try {
      await this.gitEnv(["read-tree", "--empty"], env);

      const projectMd = `---\nkind: sharkbay_team_context\nrepo: ${repo}\ncreatedAt: ${new Date().toISOString()}\ncreatedBy: ${login}\n---\n`;
      const projectBlob = await this.git(["hash-object", "-w", "--stdin"], projectMd);
      await this.gitEnv(["update-index", "--add", "--cacheinfo", `100644,${projectBlob},.sharkbay-team-context/project.md`], env);

      const gitkeepBlob = await this.git(["hash-object", "-w", "--stdin"], "");
      await this.gitEnv(["update-index", "--add", "--cacheinfo", `100644,${gitkeepBlob},.sharkbay-team-context/tasks/.gitkeep`], env);

      const treeHash = await this.gitEnv(["write-tree"], env);
      const commitHash = await this.git(["commit-tree", treeHash, "-m", "init: sharkbay-team-context"]);
      await this.git(["push", "origin", `${commitHash}:refs/heads/${BRANCH}`]);
      await this.git(["fetch", "origin", BRANCH]);
    } finally {
      await unlink(indexFile).catch(() => {});
    }
  }

  syncOnce(): Promise<SyncResult> {
    if (this.syncInFlight) return this.syncInFlight;
    const sync = this.runSyncOnce().finally(() => {
      if (this.syncInFlight === sync) this.syncInFlight = null;
    });
    this.syncInFlight = sync;
    return sync;
  }

  private async runSyncOnce(): Promise<SyncResult> {
    try {
      // 1. Fetch
      const fetched = await this.fetch();

      // 2. Refresh mirror
      await this.refreshMirrorFromRemote();

      // 3+4. Find completed local tasks that are missing remotely or newer
      // than the remote copy, then push with retry.
      const pushedTasks = await this.pushPendingTasksWithRetry();
      const pushed: string[] = [];
      if (pushedTasks.length > 0) {
        pushed.push(...pushedTasks.map((t) => t.taskId));
        // 7. Refresh mirror again after successful push
        await this.refreshMirrorFromRemote();
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      // Regenerate knowledge site if sources changed
      void generateKnowledgeSite(this.repoPath).catch(() => {});
      return { fetched, pushed, error: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError = msg;
      return { fetched: false, pushed: [], error: msg };
    }
  }

  private async fetch(): Promise<boolean> {
    try {
      await this.git(["fetch", "origin", BRANCH]);
      return true;
    } catch {
      return false;
    }
  }

  private async listRemoteFiles(): Promise<string[]> {
    try {
      const out = await this.git(["ls-tree", "-r", "--name-only", REMOTE_REF, "--", TASKS_PREFIX]);
      return out ? out.split("\n").filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  private async refreshMirrorFromRemote(): Promise<void> {
    const remoteFiles = await this.listRemoteFiles();
    const mirrorTasksDir = join(this.repoPath, MIRROR_DIR, "tasks");
    await mkdir(mirrorTasksDir, { recursive: true });

    for (const filePath of remoteFiles) {
      const content = await this.git(["show", `${REMOTE_REF}:${filePath}`]);
      const relativePath = filePath.replace(TASKS_PREFIX, "");
      const localPath = join(mirrorTasksDir, relativePath);
      await mkdir(dirname(localPath), { recursive: true });
      await writeFile(localPath, content);
    }
  }

  private async findPendingTasks(remoteFiles: string[]): Promise<CompletedTask[]> {
    const tasksDir = join(this.repoPath, ".sharkbay", "tasks");
    let entries: string[];
    try {
      entries = await readdir(tasksDir);
    } catch {
      return [];
    }

    const remoteTasks = await this.readRemoteTasks(remoteFiles);

    const pending: CompletedTask[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const basename = entry.replace(/\.md$/, "");
      const taskId = extractTaskId(basename);
      if (!taskId) continue;
      const content = await readFile(join(tasksDir, entry), "utf-8");
      const frontmatter = parseTaskFrontmatter(content);
      if (!frontmatter || frontmatter["status"] !== "completed") continue;

      const remote = remoteTasks.get(taskId);
      if (remote && normalizeTaskContent(remote.content) === normalizeTaskContent(content)) continue;

      const localUpdatedAtMs = taskUpdatedAtMs(frontmatter);
      if (remote && !shouldPushLocalTask(localUpdatedAtMs, remote)) continue;

      pending.push({
        taskId,
        filename: entry,
        completedAt: taskCompletedAt(frontmatter),
        content,
        targetPath: remote?.path,
      });
    }
    return pending;
  }

  private async pushPendingTasksWithRetry(): Promise<CompletedTask[]> {
    for (let attempt = 0; attempt < MAX_PUSH_RETRIES; attempt++) {
      const remoteFiles = await this.listRemoteFiles();
      const tasks = await this.findPendingTasks(remoteFiles);
      this.pendingCount = tasks.length;
      if (tasks.length === 0) return [];

      try {
        await this.pushTasks(tasks);
        this.pendingCount = 0;
        return tasks;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("rejected") || msg.includes("non-fast-forward")) {
          // Fetch and recompute pending tasks; another agent may have pushed a
          // newer copy while this sync was preparing its tree.
          await this.fetch();
          await this.refreshMirrorFromRemote();
          continue;
        }
        throw e;
      }
    }
    throw new Error("Push failed after retries");
  }

  private async pushTasks(tasks: CompletedTask[]): Promise<void> {
    const indexFile = join(this.repoPath, ".git", "tmp-sync-index");
    const env = { ...process.env, GIT_INDEX_FILE: indexFile };

    try {
      try {
        await this.gitEnv(["read-tree", REMOTE_REF], env);
      } catch {
        await this.gitEnv(["read-tree", "--empty"], env);
      }

      for (const task of tasks) {
        const date = parseDateOrNow(task.completedAt);
        const yyyy = date.getFullYear().toString();
        const mm = (date.getMonth() + 1).toString().padStart(2, "0");
        const blobHash = await this.git(["hash-object", "-w", "--stdin"], task.content);
        const path = task.targetPath ?? `${TASKS_PREFIX}${yyyy}/${mm}/${task.filename}`;
        await this.gitEnv(["update-index", "--add", "--cacheinfo", `100644,${blobHash},${path}`], env);
      }

      const treeHash = await this.gitEnv(["write-tree"], env);

      let parentArg: string[];
      try {
        const parentHash = await this.git(["rev-parse", REMOTE_REF]);
        parentArg = ["-p", parentHash];
      } catch {
        parentArg = [];
      }

      const commitHash = await this.git([
        "commit-tree", treeHash, ...parentArg, "-m", `sync: push ${tasks.length} task(s)`,
      ]);

      await this.git(["update-ref", `refs/remotes/${REMOTE_REF}`, commitHash]);
      await this.git(["push", "origin", `${commitHash}:refs/heads/${BRANCH}`]);
    } finally {
      await unlink(indexFile).catch(() => {});
    }
  }

  private async git(args: string[], stdin?: string): Promise<string> {
    if (stdin !== undefined) {
      return new Promise((resolve, reject) => {
        const proc = spawn("git", ["-C", this.repoPath, ...args], { timeout: 15_000 });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
        proc.on("error", reject);
        proc.on("close", (code: number | null) => {
          if (code === 0) resolve(stdout.trimEnd());
          else reject(new Error(stderr || `git exited ${code}`));
        });
        proc.stdin.end(stdin);
      });
    }
    const { stdout } = await execFileAsync("git", ["-C", this.repoPath, ...args], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
    return String(stdout).trimEnd();
  }

  private async gitEnv(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
    const { stdout } = await execFileAsync("git", ["-C", this.repoPath, ...args], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024, env });
    return stdout.trimEnd();
  }

  private async readRemoteTasks(remoteFiles: string[]): Promise<Map<string, RemoteTask>> {
    const remoteTasks = new Map<string, RemoteTask>();
    for (const path of remoteFiles) {
      const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
      const filenameTaskId = extractTaskId(basename);
      if (!filenameTaskId) continue;

      const content = await this.git(["show", `${REMOTE_REF}:${path}`]);
      const frontmatter = parseTaskFrontmatter(content) ?? {};
      const taskId = frontmatter["taskId"] || filenameTaskId;
      remoteTasks.set(taskId, {
        taskId,
        path,
        content,
        updatedAtMs: taskUpdatedAtMs(frontmatter),
      });
    }
    return remoteTasks;
  }
}

export async function hasLocalContextBranch(repoPath: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", "--quiet", REMOTE_REF], { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

export async function deleteTeamContextBranch(repoPath: string): Promise<boolean> {
  let exists = false;
  try {
    await execFileAsync("git", ["-C", repoPath, "ls-remote", "--exit-code", "origin", `refs/heads/${BRANCH}`], { timeout: 10_000 });
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
    await execFileAsync("git", ["-C", repoPath, "push", "origin", `:refs/heads/${BRANCH}`], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
  }
  await execFileAsync("git", ["-C", repoPath, "update-ref", "-d", REMOTE_REF], { timeout: 3_000 }).catch(() => {});
  return exists;
}

/** Extract taskId from filename: <taskTag>-u<userId>-m<machineId>-<slug> → <taskTag>-u<userId>-m<machineId> */
function extractTaskId(basename: string): string | null {
  const match = basename.match(/^([A-Z0-9]{6}-u\d+-m[A-Za-z0-9]+)(?:-|$)/);
  return match?.[1] ?? null;
}

function parseTaskFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const result: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function shouldPushLocalTask(localUpdatedAtMs: number, remote: RemoteTask): boolean {
  return localUpdatedAtMs > remote.updatedAtMs;
}

function taskCompletedAt(frontmatter: Record<string, string>): string {
  return frontmatter["completedAt"] || frontmatter["updatedAt"] || frontmatter["createdAt"] || new Date().toISOString();
}

function taskUpdatedAtMs(frontmatter: Record<string, string>): number {
  return Math.max(
    timestamp(frontmatter["updatedAt"]),
    timestamp(frontmatter["completedAt"]),
    timestamp(frontmatter["createdAt"]),
  );
}

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseDateOrNow(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeTaskContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trimEnd();
}
