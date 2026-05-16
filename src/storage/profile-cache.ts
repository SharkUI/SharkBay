import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { IpcRuntimeLike, MachineProfile, ProjectFingerprint, ProjectProfile } from "../shared/types.js";

export type CachedProfile<T, F = unknown> = {
  value: T;
  cachedAt: string;
  fingerprint?: F;
};

export type ProfileCacheOptions = {
  machineTtlMs?: number;
  projectTtlMs?: number;
};

const DEFAULT_MACHINE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PROJECT_TTL_MS = 15 * 60 * 1000;

export class ProfileCache {
  private readonly machineTtlMs: number;
  private readonly projectTtlMs: number;

  constructor(options: ProfileCacheOptions = {}) {
    this.machineTtlMs = options.machineTtlMs ?? DEFAULT_MACHINE_TTL_MS;
    this.projectTtlMs = options.projectTtlMs ?? DEFAULT_PROJECT_TTL_MS;
  }

  async readMachineProfile(runtime: IpcRuntimeLike, targetId: string): Promise<MachineProfile | null> {
    return this.read<MachineProfile>(runtime, "machine-profiles", targetId, this.machineTtlMs);
  }

  async writeMachineProfile(runtime: IpcRuntimeLike, targetId: string, profile: MachineProfile): Promise<void> {
    await this.write(runtime, "machine-profiles", targetId, profile);
  }

  async readProjectProfile(runtime: IpcRuntimeLike, projectUri: string): Promise<ProjectProfile | null> {
    const cached = await this.readWithFingerprint<ProjectProfile, ProjectFingerprint>(runtime, "project-profiles", projectUri, this.projectTtlMs);
    return cached?.value ?? null;
  }

  async readProjectProfileWithFingerprint(runtime: IpcRuntimeLike, projectUri: string): Promise<CachedProfile<ProjectProfile, ProjectFingerprint> | null> {
    return this.readWithFingerprint<ProjectProfile, ProjectFingerprint>(runtime, "project-profiles", projectUri, this.projectTtlMs);
  }

  async writeProjectProfile(runtime: IpcRuntimeLike, projectUri: string, profile: ProjectProfile, fingerprint?: ProjectFingerprint): Promise<void> {
    await this.write(runtime, "project-profiles", projectUri, profile, fingerprint);
  }

  private async read<T>(runtime: IpcRuntimeLike, category: string, key: string, ttlMs: number): Promise<T | null> {
    const cached = await this.readWithFingerprint<T, unknown>(runtime, category, key, ttlMs);
    return cached?.value ?? null;
  }

  private async readWithFingerprint<T, F>(runtime: IpcRuntimeLike, category: string, key: string, ttlMs: number): Promise<CachedProfile<T, F> | null> {
    try {
      const filePath = cacheFilePath(runtime, category, key);
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as CachedProfile<T, F>;
      if (!parsed || typeof parsed !== "object" || !("value" in parsed)) return null;
      if (isExpired(parsed.cachedAt, ttlMs)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async write<T, F>(runtime: IpcRuntimeLike, category: string, key: string, value: T, fingerprint?: F): Promise<void> {
    const filePath = cacheFilePath(runtime, category, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const payload: CachedProfile<T, F> = fingerprint === undefined
      ? { value, cachedAt: new Date().toISOString() }
      : { value, cachedAt: new Date().toISOString(), fingerprint };
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

function isExpired(cachedAt: string, ttlMs: number): boolean {
  if (!ttlMs || ttlMs <= 0) return false;
  const time = Date.parse(cachedAt);
  return !Number.isFinite(time) || Date.now() - time > ttlMs;
}

export function cacheFilePath(runtime: IpcRuntimeLike, category: string, key: string): string {
  return path.join(runtime.userDataPath, "cache", category, `${hashKey(key)}.json`);
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
