import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";

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
}

export class TeamworkSync {
  private repoPath: string;
  private timer: ReturnType<typeof setInterval> | null = null;
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

  async syncOnce(): Promise<SyncResult> {
    try {
      // 1. Fetch
      const fetched = await this.fetch();

      // 2. Refresh mirror
      await this.refreshMirrorFromRemote();

      // 3+4. Find completed local tasks not in mirror
      const remoteFiles = await this.listRemoteFiles();
      const pending = await this.findPendingTasks(remoteFiles);
      this.pendingCount = pending.length;

      // 5+6. Push pending tasks with retry
      const pushed: string[] = [];
      if (pending.length > 0) {
        await this.pushTasksWithRetry(pending);
        pushed.push(...pending.map((t) => t.taskId));
        // 7. Refresh mirror again after successful push
        await this.refreshMirrorFromRemote();
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
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

    // Extract full taskId from remote filenames (everything before the slug)
    // Filename format: <taskTag>-u<userId>-m<machineId>-<slug>.md
    // taskId is: <taskTag>-u<userId>-m<machineId>
    const remoteTaskIds = new Set<string>();
    for (const f of remoteFiles) {
      const basename = f.split("/").pop()?.replace(/\.md$/, "") ?? "";
      const taskId = extractTaskId(basename);
      if (taskId) remoteTaskIds.add(taskId);
    }

    const pending: CompletedTask[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const basename = entry.replace(/\.md$/, "");
      const taskId = extractTaskId(basename);
      if (!taskId) continue;
      if (remoteTaskIds.has(taskId)) continue;
      const content = await readFile(join(tasksDir, entry), "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const hasCompleted = fmMatch[1]!.split("\n").some((l) => l.startsWith("status:") && l.includes("completed"));
      if (!hasCompleted) continue;
      pending.push({ taskId, filename: entry, completedAt: new Date().toISOString(), content });
    }
    return pending;
  }

  private async pushTasksWithRetry(tasks: CompletedTask[]): Promise<void> {
    for (let attempt = 0; attempt < MAX_PUSH_RETRIES; attempt++) {
      try {
        await this.pushTasks(tasks);
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("rejected") || msg.includes("non-fast-forward")) {
          // Fetch and retry
          await this.fetch();
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
        const date = new Date(task.completedAt);
        const yyyy = date.getFullYear().toString();
        const mm = (date.getMonth() + 1).toString().padStart(2, "0");
        const blobHash = await this.git(["hash-object", "-w", "--stdin"], task.content);
        const path = `${TASKS_PREFIX}${yyyy}/${mm}/${task.filename}`;
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
