import { loadRuntimeConfig } from "../main/config.js";
import { githubRepoFromRemote, readOriginUrls } from "../main/git.js";
import { resolveRepoPath } from "../main/path-safety.js";
import { checkRepoPermission, ensureLocalExclude, getHarnessUpdateStatus, getLocalHarnessIdentity, isGitWorktree, isHarnessInstalled, maintainHarness, resolveGitHubIdentity, uninstallHarness, updateHarnessFiles, updateHarnessProject } from "../main/harness.js";
import { deleteTeamContextBranch, TeamworkSync } from "../main/teamwork-sync.js";
import { scanTasks, watchTasks } from "../main/tasks.js";
import { applicationEvents as channels } from "../shared/application-events.js";
import type { RuntimePaths, ProtocolStatus, TasksChangedEvent } from "../shared/types.js";

const ORIGIN_POLL_MS = 10_000;
const SYNC_INTERVAL_MS = 60_000;

type SyncStep = "identity" | "permission" | "branch" | "sync";
type ProjectSync = {
  timer: ReturnType<typeof setInterval>;
  inFlight?: Promise<void>;
  originKey?: string;
  repo?: string;
  permission?: string;
  sync?: TeamworkSync;
  failures: number;
  retryAt: number;
  error: string | null;
};

function syncError(error: unknown, step: SyncStep): string {
  const { stderr, message, signal } = (error ?? {}) as { stderr?: string; message?: string; signal?: string };
  const detail = `${stderr ?? ""} ${message ?? String(error)}`;
  if (/requires the GitHub CLI|spawn .*gh ENOENT/i.test(detail)) {
    return "Install the GitHub CLI (gh) and run gh auth login to connect team sync.";
  }
  if (/SSO|SAML/i.test(detail)) return "Authorize your GitHub credentials for this organization's single sign-on.";
  if (/rate limit|HTTP 429/i.test(detail)) return "GitHub rate limit reached. Team sync will retry automatically.";
  if (/HTTP 401|gh auth login|not logged in|signed out|bad credentials|authentication failed|could not read (username|password)|terminal prompts disabled|permission denied \(publickey\)/i.test(detail)) {
    return step === "identity" || step === "permission"
      ? "Sign in to GitHub on this host with gh auth login."
      : "Update the Git credentials for origin on this host.";
  }
  if (signal || /timed? ?out|could not resolve|no such host|connection|network|HTTP 5\d\d|status code: 5\d\d|Failed to connect|unexpected disconnect/i.test(detail)) {
    return "Could not reach GitHub. Team sync will retry automatically.";
  }
  if (/protected branch|repository rule|GH006|GH013|hook declined/i.test(detail)) {
    return "GitHub rejected the team context branch update. Check the repository's branch rules.";
  }
  if (/HTTP 40[34]|\b403\b|repository not found|write access|permission denied|denied to|not accessible by/i.test(detail)) {
    return "Team sync needs GitHub write access and credentials that can access this repository.";
  }
  if (step === "identity") return "Could not check GitHub sign-in. Check gh auth status on this host.";
  if (step === "permission") return "Could not check GitHub repository permissions. Team sync will retry automatically.";
  if (step === "branch") return "Could not initialize the team context branch on origin. Team sync will retry automatically.";
  return "Could not sync the team context branch on origin. Team sync will retry automatically.";
}

export async function resolveRuntimeRepoPath(runtime: RuntimePaths, repoPath: string): Promise<string> {
  const config = await loadRuntimeConfig(runtime);
  return (await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects)).repoPath;
}

export function createTaskRuntime(emit: (channel: string, payload: unknown) => void) {
  const projects = new Map<string, ProjectSync>();
  const taskWatcherCleanups = new Map<string, () => void>();
  const harnessOperations = new Map<string, Promise<unknown>>();
  const uninstalling = new Set<string>();
  let stopped = false;

  async function pollProject(repoPath: string, project: ProjectSync, force: boolean): Promise<void> {
    if (!await isHarnessInstalled(repoPath)) {
      clearInterval(project.timer);
      if (projects.get(repoPath) === project) projects.delete(repoPath);
      return;
    }
    const origin = await readOriginUrls(repoPath);
    if (projects.get(repoPath) !== project) return;

    const originKey = JSON.stringify(origin);
    if (originKey !== project.originKey) {
      project.originKey = originKey;
      project.repo = githubRepoFromRemote(origin?.fetch ?? null) ?? undefined;
      project.sync = undefined;
      project.permission = undefined;
      project.failures = 0;
      project.retryAt = 0;
      project.error = null;
    }
    if (!force && Date.now() < project.retryAt) return;

    let step: SyncStep = "identity";
    try {
      if (!origin || !project.repo) {
        const local = await getLocalHarnessIdentity(repoPath);
        const identity = local.githubUserId ? undefined : await resolveGitHubIdentity().catch(() => undefined);
        if (projects.get(repoPath) === project) await runHarnessOperation(repoPath, () => updateHarnessProject(repoPath, null, identity));
      } else if (origin.push.length !== 1 || githubRepoFromRemote(origin.push[0]!)?.toLowerCase() !== project.repo.toLowerCase()) {
        project.error = "Team sync needs origin to fetch from and push to the same GitHub repository.";
      } else {
        let fetchedHead: string | undefined;
        if (!project.sync || project.error) {
          const identity = await resolveGitHubIdentity();
          if (projects.get(repoPath) !== project) return;
          const repo = project.repo;
          await runHarnessOperation(repoPath, () => updateHarnessProject(repoPath, repo, identity));
          step = "permission";
          project.permission = await checkRepoPermission(project.repo);
          const currentOrigin = await readOriginUrls(repoPath);
          if (projects.get(repoPath) !== project || JSON.stringify(currentOrigin) !== originKey) return;
          if (project.permission !== "write" && project.permission !== "admin") {
            project.error = "Team sync needs write access to the GitHub repository on origin.";
            project.retryAt = Date.now() + SYNC_INTERVAL_MS;
            return;
          }
          step = "branch";
          project.sync = new TeamworkSync(repoPath, origin.fetch, origin.push[0]!, identity);
          fetchedHead = await project.sync.ensureContextBranch(project.repo, identity.login);
          if (projects.get(repoPath) !== project) return;
        }
        step = "sync";
        const result = await project.sync.syncOnce(fetchedHead);
        if (result.error) throw new Error(result.error);
        project.error = null;
      }
      project.failures = 0;
      project.retryAt = Date.now() + SYNC_INTERVAL_MS;
    } catch (error) {
      project.error = syncError(error, step);
      project.retryAt = Date.now() + Math.min(ORIGIN_POLL_MS * 2 ** project.failures, SYNC_INTERVAL_MS);
      project.failures++;
    }
  }

  function runProject(repoPath: string, project: ProjectSync, force = false): Promise<void> {
    if (project.inFlight) return project.inFlight;
    project.inFlight = pollProject(repoPath, project, force).finally(() => { project.inFlight = undefined; });
    return project.inFlight;
  }

  function trackInstalledProject(repoPath: string): ProjectSync | undefined {
    if (stopped || uninstalling.has(repoPath)) return undefined;
    const existing = projects.get(repoPath);
    if (existing) return existing;
    const project: ProjectSync = {
      timer: setInterval(() => { void runProject(repoPath, project); }, ORIGIN_POLL_MS),
      retryAt: 0,
      failures: 0,
      error: null,
    };
    project.timer.unref();
    projects.set(repoPath, project);
    void runProject(repoPath, project);
    return project;
  }

  async function trackProject(repoPath: string): Promise<void> {
    if (!projects.has(repoPath) && await isHarnessInstalled(repoPath)) trackInstalledProject(repoPath);
  }

  async function stopProject(repoPath: string): Promise<void> {
    const project = projects.get(repoPath);
    projects.delete(repoPath);
    if (project) {
      clearInterval(project.timer);
      await project.inFlight;
    }
    taskWatcherCleanups.get(repoPath)?.();
    taskWatcherCleanups.delete(repoPath);
  }

  async function getProtocolStatus(repoPath: string): Promise<ProtocolStatus> {
    const installed = await isHarnessInstalled(repoPath);
    const project = installed ? trackInstalledProject(repoPath) : undefined;
    if (installed && await isGitWorktree(repoPath)) await ensureLocalExclude(repoPath).catch(() => {});
    const identity = installed ? await getLocalHarnessIdentity(repoPath) : {};
    const harnessUpdate = installed ? await getHarnessUpdateStatus(repoPath) : { required: false, files: [] };
    const syncStatus = project?.sync?.getStatus();
    return {
      installed,
      harnessInstalled: installed,
      harnessUpdate,
      syncEnabled: Boolean(syncStatus?.lastSyncAt && !project?.error),
      lastSyncAt: syncStatus?.lastSyncAt ?? null,
      pendingCount: syncStatus?.pendingCount ?? 0,
      lastError: project?.error ?? null,
      repo: project?.repo,
      permission: project?.permission,
      ...identity,
    };
  }

  async function installLocalHarness(repoPath: string): Promise<ProtocolStatus> {
    if (!await isHarnessInstalled(repoPath)) {
      await maintainHarness(repoPath);
      await notifyHarnessChange(repoPath, false);
    }
    return getProtocolStatus(repoPath);
  }

  function runHarnessOperation<T>(repoPath: string, action: () => Promise<T>): Promise<T> {
    if (uninstalling.has(repoPath)) throw new Error("Wait for Task Protocol uninstall to finish.");
    const previous = harnessOperations.get(repoPath);
    const operation = Promise.resolve(previous).catch(() => {}).then(action);
    harnessOperations.set(repoPath, operation);
    return operation.finally(() => {
      if (harnessOperations.get(repoPath) === operation) harnessOperations.delete(repoPath);
    });
  }

  function installProtocol(repoPath: string): Promise<ProtocolStatus> {
    return runHarnessOperation(repoPath, () => installLocalHarness(repoPath));
  }

  async function notifyHarnessChange(repoPath: string, wasInstalled: boolean): Promise<void> {
    if (!wasInstalled) {
      taskWatcherCleanups.get(repoPath)?.();
      taskWatcherCleanups.delete(repoPath);
    }
    emitTasks(repoPath, await getTasks(repoPath));
  }

  function emitTasks(repoPath: string, tasks: TasksChangedEvent["tasks"]): void {
    const event: TasksChangedEvent = { repoPath, tasks };
    emit(channels.protocolTasksChanged, event);
  }

  async function getTasks(repoPath: string) {
    const tasks = await scanTasks(repoPath);
    if (!taskWatcherCleanups.has(repoPath)) {
      const cleanup = watchTasks(repoPath, (updated) => emitTasks(repoPath, updated));
      taskWatcherCleanups.set(repoPath, cleanup);
    }
    return tasks;
  }

  async function assertContextCleanupOwner(repoPath: string): Promise<void> {
    const identity = await resolveGitHubIdentity();
    const origin = await readOriginUrls(repoPath);
    const repo = githubRepoFromRemote(origin?.fetch ?? null);
    const owner = repo?.split("/")[0] ?? "";
    if (!repo || owner.toLowerCase() !== identity.login.toLowerCase()) {
      throw new Error("Only the repository owner can clean all task records.");
    }
  }

  return {
    installProtocol,
    trackProject,
    stopProject,
    getTasks,
    getStatus: getProtocolStatus,
    install: installProtocol,
    async prepareForAgentLaunch(repoPath: string) {
      await runHarnessOperation(repoPath, async () => {
        const installed = await isHarnessInstalled(repoPath);
        if (await maintainHarness(repoPath)) await notifyHarnessChange(repoPath, installed);
        trackInstalledProject(repoPath);
      });
    },
    async uninstall(repoPath: string, cleanTeamContext?: boolean, onUninstalled?: () => Promise<void>) {
      if (uninstalling.has(repoPath)) throw new Error("Wait for Task Protocol uninstall to finish.");
      uninstalling.add(repoPath);
      try {
        await harnessOperations.get(repoPath)?.catch(() => {});
        await stopProject(repoPath);
        let contextBranchDeleted = false;
        if (cleanTeamContext) {
          await assertContextCleanupOwner(repoPath);
          contextBranchDeleted = await deleteTeamContextBranch(repoPath);
        }
        const result = await uninstallHarness(repoPath);
        await onUninstalled?.();
        emitTasks(repoPath, []);
        return { ...result, contextBranchDeleted };
      } finally {
        uninstalling.delete(repoPath);
      }
    },
    async syncNow(repoPath: string) {
      await trackProject(repoPath);
      const project = projects.get(repoPath);
      if (project) await runProject(repoPath, project, true);
    },
    async updateHarness(repoPath: string) {
      return runHarnessOperation(repoPath, async () => {
        const installed = await isHarnessInstalled(repoPath);
        await updateHarnessFiles(repoPath);
        await notifyHarnessChange(repoPath, installed);
        return getProtocolStatus(repoPath);
      });
    },
    async stop() {
      stopped = true;
      await Promise.all([...new Set([...projects.keys(), ...taskWatcherCleanups.keys()])].map(stopProject));
    },
  };
}
