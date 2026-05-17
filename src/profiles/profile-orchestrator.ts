import type { ExecutionProviderRegistry } from "../core/provider-registry.js";
import { parseProjectUri } from "../core/project-uri.js";
import { JobScheduler } from "../core/job-scheduler.js";
import type { IpcRuntimeLike, MachineProfile, ProfileDepth, ProfileReadOptions, ProjectFingerprint, ProjectProfile } from "../shared/types.js";
import { detectorMatchesDepth } from "../plugins/plugin-host.js";
import type { PluginHost, MachineProfilePatch, ProjectProfilePatch } from "../plugins/plugin-host.js";
import { ProfileCache } from "../storage/profile-cache.js";
import type { DiagnosticsCollector } from "../core/diagnostics.js";

const DEFAULT_DEPTH: ProfileDepth = "standard";

export class ProfileOrchestrator {
  constructor(
    private readonly providers: ExecutionProviderRegistry,
    private readonly pluginHost: PluginHost,
    private readonly scheduler = new JobScheduler(),
    private readonly cache = new ProfileCache(),
    private readonly diagnostics?: DiagnosticsCollector,
  ) {}

  async readMachineProfile(runtime: IpcRuntimeLike, targetId: string, options?: ProfileReadOptions): Promise<MachineProfile> {
    const depth: ProfileDepth = options?.depth ?? DEFAULT_DEPTH;
    const cacheKey = `${targetId}|${depth}`;
    if (!options?.refresh) {
      const cached = await this.cache.readMachineProfile(runtime, cacheKey);
      if (cached) {
        this.diagnostics?.recordCacheHit("machine");
        return cached;
      }
      this.diagnostics?.recordCacheMiss("machine");
    }
    const provider = this.providers.providerForTargetId(targetId);
    const base = await provider.readMachineProfile(runtime, targetId, options);
    const ctx = await provider.createMachineProbeContext(runtime, targetId);
    const detectors = this.pluginHost.listMachineDetectors().filter((detector) => detectorMatchesDepth(detector, depth));
    const patches = await Promise.all(detectors.map((detector) =>
      this.scheduler.schedule<MachineProfilePatch>({
        kind: "machine-profile",
        targetId,
        priority: options?.refresh ? "interactive" : "background",
        timeoutMs: 5000,
        dedupeKey: `machine:${targetId}:${detector.pluginId}:${detector.id}`,
        run: async () => {
          try {
            return await detector.run(ctx);
          } catch (error) {
            return { warnings: [{ code: "detector-failed", message: `${detector.id}: ${error instanceof Error ? error.message : String(error)}`, source: detector.pluginId }] };
          }
        },
      })
    ));
    const profile = mergeMachineProfile(base, patches);
    await this.cache.writeMachineProfile(runtime, cacheKey, profile);
    return profile;
  }

  async readProjectProfile(runtime: IpcRuntimeLike, projectUri: string, options?: ProfileReadOptions): Promise<ProjectProfile> {
    const depth: ProfileDepth = options?.depth ?? DEFAULT_DEPTH;
    const cacheKey = `${projectUri}|${depth}`;
    const provider = this.providers.providerForUri(projectUri);
    const currentFingerprint = await provider.readProjectFingerprint?.(runtime, projectUri).catch(() => undefined);
    if (!options?.refresh) {
      const cached = await this.cache.readProjectProfileWithFingerprint(runtime, cacheKey);
      if (cached && (!currentFingerprint || fingerprintsMatch(cached.fingerprint, currentFingerprint))) {
        this.diagnostics?.recordCacheHit("project");
        return cached.value;
      }
      this.diagnostics?.recordCacheMiss("project");
    }
    const base = await provider.readProjectProfile(runtime, projectUri, options);
    const ctx = await provider.createProjectProbeContext(runtime, projectUri);
    const parsed = parseProjectUri(projectUri);
    const targetId = parsed.targetId;
    const detectors = this.pluginHost.listProjectDetectors().filter((detector) => detectorMatchesDepth(detector, depth));
    const patches = await Promise.all(detectors.map((detector) =>
      this.scheduler.schedule<ProjectProfilePatch>({
        kind: "project-profile",
        targetId,
        projectUri,
        priority: options?.refresh ? "interactive" : "background",
        timeoutMs: 5000,
        dedupeKey: `project:${projectUri}:${detector.pluginId}:${detector.id}`,
        run: async () => {
          try {
            return await detector.run(ctx);
          } catch (error) {
            return { warnings: [{ code: "detector-failed", message: `${detector.id}: ${error instanceof Error ? error.message : String(error)}`, source: detector.pluginId }] };
          }
        },
      })
    ));
    const profile = mergeProjectProfile(base, patches, projectUri);
    await this.cache.writeProjectProfile(runtime, cacheKey, profile, currentFingerprint);
    return profile;
  }
}

function fingerprintsMatch(cached: ProjectFingerprint | undefined, current: ProjectFingerprint): boolean {
  if (!cached) return false;
  if ((cached.gitHead ?? null) !== (current.gitHead ?? null)) return false;
  const cachedKeys = Object.keys(cached.manifestMtimes ?? {});
  const currentKeys = Object.keys(current.manifestMtimes);
  if (cachedKeys.length !== currentKeys.length) return false;
  for (const key of currentKeys) {
    if ((cached.manifestMtimes?.[key] ?? null) !== (current.manifestMtimes[key] ?? null)) return false;
  }
  return true;
}

function mergeMachineProfile(base: MachineProfile, patches: MachineProfilePatch[]): MachineProfile {
  let profile: MachineProfile = base;
  for (const patch of patches) {
    profile = {
      ...profile,
      hostname: patch.hostname ?? profile.hostname,
      os: patch.os ? { ...profile.os, ...patch.os } : profile.os,
      shell: patch.shell ? { ...profile.shell, ...patch.shell } : profile.shell,
      tools: mergeById(profile.tools, patch.tools),
      languages: mergeById(profile.languages, patch.languages),
      packageManagers: mergeById(profile.packageManagers, patch.packageManagers),
      agents: mergeById(profile.agents, patch.agents),
      warnings: [...profile.warnings, ...(patch.warnings ?? [])],
    };
  }
  return profile;
}

function mergeProjectProfile(base: ProjectProfile, patches: ProjectProfilePatch[], projectUri: string): ProjectProfile {
  const parsed = parseProjectUri(projectUri);
  let profile: ProjectProfile = {
    ...base,
    name: base.name || (parsed.kind === "local" ? parsed.path.split("/").pop() ?? "" : parsed.kind === "ssh" ? parsed.path.split("/").pop() ?? "" : base.name),
  };
  for (const patch of patches) {
    profile = {
      ...profile,
      name: patch.name ?? profile.name,
      displayPath: patch.displayPath ?? profile.displayPath,
      vcs: patch.vcs ? { ...profile.vcs, ...patch.vcs } : profile.vcs,
      languages: mergeDetected(profile.languages, patch.languages),
      frameworks: mergeDetected(profile.frameworks, patch.frameworks),
      packageManagers: mergeDetected(profile.packageManagers, patch.packageManagers),
      commands: { ...profile.commands, ...(patch.commands ?? {}) },
      services: mergeById(profile.services, patch.services),
      env: patch.env ? {
        files: mergeStrings(profile.env.files, patch.env.files),
        exampleFiles: mergeStrings(profile.env.exampleFiles, patch.env.exampleFiles),
        requiredKeys: mergeStrings(profile.env.requiredKeys ?? [], patch.env.requiredKeys),
      } : profile.env,
      structure: patch.structure ? {
        monorepo: profile.structure.monorepo || Boolean(patch.structure.monorepo),
        workspaces: mergeByName(profile.structure.workspaces, patch.structure.workspaces),
        importantFiles: mergeStrings(profile.structure.importantFiles, patch.structure.importantFiles),
      } : profile.structure,
      warnings: [...profile.warnings, ...(patch.warnings ?? [])],
    };
  }
  return profile;
}

function mergeById<T extends { id: string }>(left: T[], right: T[] | undefined): T[] {
  if (!right?.length) return left;
  const items = new Map(left.map((item) => [item.id, item]));
  for (const item of right) items.set(item.id, { ...items.get(item.id), ...item });
  return [...items.values()];
}

function mergeByName<T extends { name: string }>(left: T[], right: T[] | undefined): T[] {
  if (!right?.length) return left;
  const items = new Map(left.map((item) => [item.name, item]));
  for (const item of right) items.set(item.name, { ...items.get(item.name), ...item });
  return [...items.values()];
}

function mergeDetected<T extends { id: string; confidence: number }>(left: T[], right: T[] | undefined): T[] {
  return mergeById(left, right).sort((a, b) => b.confidence - a.confidence);
}

function mergeStrings(left: string[], right: string[] | undefined): string[] {
  return [...new Set([...left, ...(right ?? [])])];
}
