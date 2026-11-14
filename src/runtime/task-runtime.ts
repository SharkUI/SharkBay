import { loadRuntimeConfig } from "../main/config.js";
import { readGitMetadata } from "../main/git.js";
import { resolveRepoPath } from "../main/path-safety.js";
import { checkRepoPermission, ensureLocalExclude, generateMachineId, getHarnessUpdateStatus, getLocalHarnessIdentity, getMachineId, installHarness, isGitWorktree, isHarnessInstalled, resolveGitHubIdentity, uninstallHarness, updateHarnessFiles } from "../main/harness.js";
import { deleteTeamContextBranch, hasLocalContextBranch, TeamworkSync } from "../main/teamwork-sync.js";
import { scanTasks, watchTasks } from "../main/tasks.js";
import { applicationEvents as channels } from "../shared/application-events.js";
import type { RuntimePaths, ProtocolStatus, TasksChangedEvent } from "../shared/types.js";

export async function resolveRuntimeRepoPath(runtime: RuntimePaths, repoPath: string): Promise<string> {
  const config = await loadRuntimeConfig(runtime);
  return (await resolveRepoPath(repoPath, config.configuredRoots, config.configuredProjects)).repoPath;
}

export function createTaskRuntime(emit: (channel: string, payload: unknown) => void) {
  const syncInstances = new Map<string, TeamworkSync>();
  const taskWatcherCleanups = new Map<string, () => void>();
  async function syncForStatus(repoPath: string, installed: boolean): Promise<TeamworkSync | null> {
    const existing = syncInstances.get(repoPath);
    if (existing) return existing;
    if (!installed || !await hasLocalContextBranch(repoPath)) return null;

    const sync = new TeamworkSync(repoPath);
    sync.start();
    syncInstances.set(repoPath, sync);
    return sync;
  }

  async function getProtocolStatus(repoPath: string): Promise<ProtocolStatus> {
    const harnessInstalled = await isHarnessInstalled(repoPath);
    const installed = harnessInstalled;
    if (harnessInstalled && await isGitWorktree(repoPath)) {
      await ensureLocalExclude(repoPath).catch(() => {});
    }
    const identity = harnessInstalled ? await getLocalHarnessIdentity(repoPath) : {};
    const contextAvailable = harnessInstalled ? await hasLocalContextBranch(repoPath).catch(() => false) : false;
    const sync = await syncForStatus(repoPath, contextAvailable);
    const syncStatus = sync?.getStatus();
    const harnessUpdate = harnessInstalled ? await getHarnessUpdateStatus(repoPath) : { required: false, files: [] };
    return {
      installed,
      harnessInstalled,
      harnessUpdate,
      syncEnabled: syncStatus?.enabled ?? false,
      lastSyncAt: syncStatus?.lastSyncAt ?? null,
      pendingCount: syncStatus?.pendingCount ?? 0,
      lastError: syncStatus?.lastError ?? null,
      githubLogin: identity.githubLogin,
      githubUserId: identity.githubUserId,
      machineId: identity.machineId,
    };
  }

  async function installProtocol(repoPath: string): Promise<ProtocolStatus> {
    const gitMeta = await readGitMetadata(repoPath);
    const machineId = await getMachineId(repoPath) ?? generateMachineId();

    // If git + GitHub remote available, do full install with team sync
    const repo = gitMeta.isGitRepository ? githubRepoFromRemote(gitMeta.remoteOrigin) : null;
    if (repo) {
      const identity = await resolveGitHubIdentity().catch(() => null);
      if (!identity) return installLocalOnlyProtocol(repoPath, gitMeta, machineId, null, repo);
      const permission = await checkRepoPermission(repo, identity.login);
      if (permission !== "admin" && permission !== "write") return installLocalOnlyProtocol(repoPath, gitMeta, machineId, identity, repo, permission);

      const sync = syncInstances.get(repoPath) ?? new TeamworkSync(repoPath);
      await sync.ensureContextBranch(repo, identity.login);

      await installHarness(repoPath, {
        githubLogin: identity.login,
        githubUserId: identity.id,
        machineId,
        agent: "",
        repo,
      });

      sync.start();
      syncInstances.set(repoPath, sync);
      const syncStatus = sync.getStatus();
      return {
        installed: true,
        harnessInstalled: true,
        harnessUpdate: { required: false, files: [] },
        syncEnabled: syncStatus.enabled,
        lastSyncAt: syncStatus.lastSyncAt,
        pendingCount: syncStatus.pendingCount,
        lastError: syncStatus.lastError,
        githubLogin: identity.login,
        githubUserId: identity.id,
        machineId,
        repo,
        branch: gitMeta.currentBranch ?? undefined,
        permission,
      };
    }

    return installLocalOnlyProtocol(repoPath, gitMeta, machineId);
  }

  async function installLocalOnlyProtocol(
    repoPath: string,
    gitMeta: Awaited<ReturnType<typeof readGitMetadata>>,
    machineId: string,
    resolvedIdentity: { login: string; id: number } | null | undefined = undefined,
    repo?: string,
    permission?: string,
  ): Promise<ProtocolStatus> {
    // Local-only install: no git, no GitHub remote, or no write permission - tasks work but sync is unavailable
    let identity: { login: string; id: number } | null = null;
    if (resolvedIdentity) {
      identity = resolvedIdentity;
    } else if (resolvedIdentity === undefined) {
      try { identity = await resolveGitHubIdentity(); } catch { /* gh CLI may not be available */ }
    }
    await installHarness(repoPath, {
      githubLogin: identity?.login ?? "unknown",
      githubUserId: identity?.id ?? 0,
      machineId,
      agent: "",
      repo,
    });

    return {
      installed: true,
      harnessInstalled: true,
      harnessUpdate: { required: false, files: [] },
      syncEnabled: false,
      lastSyncAt: null,
      pendingCount: 0,
      lastError: null,
      githubLogin: identity?.login,
      githubUserId: identity?.id,
      machineId,
      repo,
      branch: gitMeta.currentBranch ?? undefined,
      permission,
    };
  }

  async function assertContextCleanupOwner(repoPath: string): Promise<void> {
    const identity = await resolveGitHubIdentity();
    const gitMeta = await readGitMetadata(repoPath);
    const repo = githubRepoFromRemote(gitMeta.remoteOrigin);
    const owner = repo?.split("/")[0] ?? "";
    if (!repo || owner.toLowerCase() !== identity.login.toLowerCase()) {
      throw new Error("Only the repository owner can clean all task records.");
    }
  }

  function githubRepoFromRemote(remoteOrigin: string | null): string | null {
    const match = remoteOrigin?.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
    return match?.[1] ?? null;
  }
  return {
    installProtocol,
    async getTasks(repoPath: string) {
    const tasks = await scanTasks(repoPath);
    if (!taskWatcherCleanups.has(repoPath)) {
      const cleanup = watchTasks(repoPath, (updated) => {
        const event: TasksChangedEvent = { repoPath, tasks: updated };
        emit(channels.protocolTasksChanged, event);
      });
      taskWatcherCleanups.set(repoPath, cleanup);
    }
    return tasks;
  },
    async getStatus(repoPath: string) { return getProtocolStatus(repoPath); },
    async install(repoPath: string) { return installProtocol(repoPath); },
    async uninstall(repoPath: string, cleanTeamContext?: boolean) {
    const sync = syncInstances.get(repoPath);
    sync?.stop();
    syncInstances.delete(repoPath);

    let contextBranchDeleted = false;
    if (cleanTeamContext) {
      await assertContextCleanupOwner(repoPath);
      contextBranchDeleted = await deleteTeamContextBranch(repoPath);
    }

    const result = await uninstallHarness(repoPath);
    const cleanup = taskWatcherCleanups.get(repoPath);
    cleanup?.();
    taskWatcherCleanups.delete(repoPath);
    const event: TasksChangedEvent = { repoPath, tasks: [] };
    emit(channels.protocolTasksChanged, event);
    return { ...result, contextBranchDeleted };
  },
    async syncNow(repoPath: string) {
    let sync = syncInstances.get(repoPath);
    if (!sync) {
      sync = new TeamworkSync(repoPath);
      sync.start();
      syncInstances.set(repoPath, sync);
    }
    await sync.syncOnce();
  },
    async updateHarness(repoPath: string) {
    await updateHarnessFiles(repoPath);
    return getProtocolStatus(repoPath);
  },
    stop() {
      for (const sync of syncInstances.values()) sync.stop();
      syncInstances.clear();
      for (const cleanup of taskWatcherCleanups.values()) cleanup();
      taskWatcherCleanups.clear();
    },
  };
}
