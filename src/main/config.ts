import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppearanceTheme, AppearanceThemeInput, AppConfig, IpcRuntimeLike, ProjectConfigInput, RemoveProjectInput, RemoveRootInput, RenameProjectInput, RootConfigInput, StatusChangeNotificationsInput } from "../shared/types.js";
import { isRecord } from "../shared/schema.js";
import { writeJsonAtomic, readJsonFile } from "./json-file.js";

const defaultConfigPath = path.join(os.homedir(), ".sharkbay", "config.json");

export function getConfigPath(explicitPath = process.env.SHARKBAY_CONFIG_PATH): string {
  return path.resolve(explicitPath || defaultConfigPath);
}

export function getRuntimeConfigPath(runtime: IpcRuntimeLike): string {
  return getConfigPath(runtime.configPath);
}

export function createDefaultConfig(): AppConfig {
  return {
    schemaVersion: 1,
    configuredRoots: [],
    configuredProjects: [],
    projectAliases: {},
    disabledPluginIds: [],
    appearanceTheme: "day",
    statusChangeNotificationsEnabled: true,
    agentStatusCompletionSoundEnabled: true,
    agentStatusApprovalSoundEnabled: true,
    updatedAt: today(),
  };
}

export async function setPluginEnabledConfig(runtime: IpcRuntimeLike, pluginId: string, enabled: boolean): Promise<AppConfig> {
  const id = pluginId.trim();
  if (!id) throw new Error("Plugin id is required");
  const configPath = getRuntimeConfigPath(runtime);
  const config = await loadAppConfig(configPath);
  const set = new Set(config.disabledPluginIds);
  if (enabled) set.delete(id);
  else set.add(id);
  config.disabledPluginIds = [...set];
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  return config;
}

export async function loadAppConfig(configPath = getConfigPath()): Promise<AppConfig> {
  const result = await readJsonFile(configPath);
  if (!result.ok) {
    if (result.reason === "missing") {
      return createDefaultConfig();
    }
    throw new Error(`Unable to load app config: ${result.message}`);
  }
  const normalized = normalizeAppConfig(result.data);
  const migrated = await migrateLegacyAppConfig(result.data, normalized);
  if (shouldPersistMigratedConfig(result.data, migrated)) {
    await saveAppConfig(migrated, configPath);
  }
  return migrated;
}

export async function getConfiguredRoots(runtime: IpcRuntimeLike): Promise<AppConfig> {
  return loadAppConfig(getRuntimeConfigPath(runtime));
}

export async function saveAppConfig(config: AppConfig, configPath = getConfigPath()): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await writeJsonAtomic(configPath, normalizeAppConfig(config));
}

export async function addConfiguredRoot(rootPath: string, configPath?: string): Promise<AppConfig>;
export async function addConfiguredRoot(runtime: IpcRuntimeLike, input: RootConfigInput): Promise<AppConfig>;
export async function addConfiguredRoot(first: string | IpcRuntimeLike, second?: string | RootConfigInput): Promise<AppConfig> {
  const rootPath = typeof first === "string" ? first : rootFromInput(second);
  const configPath = typeof first === "string" ? second as string | undefined : getRuntimeConfigPath(first);
  const config = await loadAppConfig(configPath);
  const absolute = path.resolve(rootPath);
  if (!config.configuredRoots.includes(absolute)) {
    config.configuredRoots.push(absolute);
  }
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  return config;
}

export async function removeConfiguredRoot(rootPath: string, configPath?: string): Promise<AppConfig>;
export async function removeConfiguredRoot(runtime: IpcRuntimeLike, input: RemoveRootInput): Promise<AppConfig>;
export async function removeConfiguredRoot(first: string | IpcRuntimeLike, second?: string | RemoveRootInput): Promise<AppConfig> {
  const rootPath = typeof first === "string" ? first : rootFromInput(second);
  const configPath = typeof first === "string" ? second as string | undefined : getRuntimeConfigPath(first);
  const config = await loadAppConfig(configPath);
  const absolute = path.resolve(rootPath);
  config.configuredRoots = config.configuredRoots.filter((root) => root !== absolute);
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  return config;
}

export async function addConfiguredProject(projectPath: string, configPath?: string): Promise<AppConfig>;
export async function addConfiguredProject(runtime: IpcRuntimeLike, input: ProjectConfigInput): Promise<AppConfig>;
export async function addConfiguredProject(first: string | IpcRuntimeLike, second?: string | ProjectConfigInput): Promise<AppConfig> {
  const projectValue = typeof first === "string" ? first : projectFromInput(second);
  const configPath = typeof first === "string" ? second as string | undefined : getRuntimeConfigPath(first);
  const config = await loadAppConfig(configPath);
  const absolute = path.resolve(projectValue);
  if (!config.configuredProjects.includes(absolute)) {
    config.configuredProjects.push(absolute);
  }
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  return config;
}

export async function removeConfiguredProject(projectPath: string, configPath?: string): Promise<AppConfig>;
export async function removeConfiguredProject(runtime: IpcRuntimeLike, input: RemoveProjectInput): Promise<AppConfig>;
export async function removeConfiguredProject(first: string | IpcRuntimeLike, second?: string | RemoveProjectInput): Promise<AppConfig> {
  const projectValue = typeof first === "string" ? first : projectFromInput(second);
  const configPath = typeof first === "string" ? second as string | undefined : getRuntimeConfigPath(first);
  const config = await loadAppConfig(configPath);
  const rawPath = projectValue.startsWith("local:")
    ? decodeURI(projectValue.slice("local:".length))
    : projectValue;
  const absolute = path.resolve(rawPath);
  config.configuredProjects = config.configuredProjects.filter((p) => p !== absolute);
  delete config.projectAliases[`local:${encodeURI(absolute)}`];
  delete config.projectAliases[projectValue];
  delete config.projectAliases[absolute];
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  return config;
}

export async function renameProject(runtime: IpcRuntimeLike, input: RenameProjectInput): Promise<AppConfig> {
  const uri = input.uri?.trim();
  const name = input.name?.trim();
  if (!uri) throw new Error("Project uri is required");
  if (!name) throw new Error("Project name is required");
  const configPath = getRuntimeConfigPath(runtime);
  const config = await loadAppConfig(configPath);
  config.projectAliases[uri] = name;
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  return config;
}

export async function setAppearanceTheme(theme: AppearanceTheme, configPath?: string): Promise<AppConfig>;
export async function setAppearanceTheme(runtime: IpcRuntimeLike, input: AppearanceThemeInput): Promise<AppConfig>;
export async function setAppearanceTheme(first: AppearanceTheme | IpcRuntimeLike, second?: string | AppearanceThemeInput): Promise<AppConfig> {
  const theme = typeof first === "string" ? first : themeFromInput(second);
  const configPath = typeof first === "string" ? second as string | undefined : getRuntimeConfigPath(first);
  const config = await loadAppConfig(configPath);
  config.appearanceTheme = normalizeAppearanceTheme(theme);
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  return config;
}

export async function setStatusChangeNotificationsEnabled(runtime: IpcRuntimeLike, input: StatusChangeNotificationsInput): Promise<AppConfig> {
  const configPath = getRuntimeConfigPath(runtime);
  const config = await loadAppConfig(configPath);
  if (typeof input.enabled === "boolean") {
    config.statusChangeNotificationsEnabled = input.enabled;
    config.agentStatusCompletionSoundEnabled = input.enabled;
    config.agentStatusApprovalSoundEnabled = input.enabled;
  }
  if (typeof input.completionEnabled === "boolean") {
    config.agentStatusCompletionSoundEnabled = input.completionEnabled;
  }
  if (typeof input.approvalEnabled === "boolean") {
    config.agentStatusApprovalSoundEnabled = input.approvalEnabled;
  }
  config.statusChangeNotificationsEnabled = config.agentStatusCompletionSoundEnabled || config.agentStatusApprovalSoundEnabled;
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  return config;
}

function rootFromInput(input: string | RootConfigInput | RemoveRootInput | undefined): string {
  if (typeof input === "string") return input;
  const rootPath = input?.path || input?.rootPath;
  if (!rootPath) {
    throw new Error("Root path is required");
  }
  return rootPath;
}

function projectFromInput(input: string | ProjectConfigInput | RemoveProjectInput | undefined): string {
  if (typeof input === "string") return input;
  const projectPath = input?.uri || input?.path;
  if (!projectPath) {
    throw new Error("Project path is required");
  }
  return projectPath;
}

function normalizeAppConfig(value: unknown): AppConfig {
  if (!isRecord(value)) return createDefaultConfig();
  const legacyStatusSoundsEnabled = value.statusChangeNotificationsEnabled !== false;
  return {
    schemaVersion: 1,
    configuredRoots: Array.isArray(value.configuredRoots)
      ? [...new Set(value.configuredRoots.filter((item): item is string => typeof item === "string").map((item) => path.resolve(item)))]
      : [],
    configuredProjects: Array.isArray(value.configuredProjects)
      ? [...new Set(value.configuredProjects.filter((item): item is string => typeof item === "string").map((item) => path.resolve(item)))]
      : [],
    projectAliases: normalizeProjectAliases(value.projectAliases),
    disabledPluginIds: Array.isArray(value.disabledPluginIds)
      ? [...new Set(value.disabledPluginIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
      : [],
    appearanceTheme: normalizeAppearanceTheme(value.appearanceTheme),
    statusChangeNotificationsEnabled: legacyStatusSoundsEnabled,
    agentStatusCompletionSoundEnabled: typeof value.agentStatusCompletionSoundEnabled === "boolean"
      ? value.agentStatusCompletionSoundEnabled
      : legacyStatusSoundsEnabled,
    agentStatusApprovalSoundEnabled: typeof value.agentStatusApprovalSoundEnabled === "boolean"
      ? value.agentStatusApprovalSoundEnabled
      : legacyStatusSoundsEnabled,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : today(),
  };
}

async function migrateLegacyAppConfig(raw: unknown, normalized: AppConfig): Promise<AppConfig> {
  if (!isRecord(raw)) return normalized;
  const next: AppConfig = {
    ...normalized,
    configuredProjects: [...normalized.configuredProjects],
  };

  if (!Array.isArray(raw.configuredProjects) && Array.isArray(raw.configuredRoots)) {
    for (const root of next.configuredRoots) {
      if (next.configuredProjects.includes(root)) continue;
      if (await isGitProjectDirectory(root)) {
        next.configuredProjects.push(root);
      }
    }
  }

  return next;
}

async function isGitProjectDirectory(directory: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(path.join(directory, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

function shouldPersistMigratedConfig(raw: unknown, normalized: AppConfig): boolean {
  if (!isRecord(raw)) return true;
  if (raw.schemaVersion !== 1) return true;
  if (!Array.isArray(raw.configuredRoots)) return true;
  if (!Array.isArray(raw.configuredProjects)) return true;
  if (!isRecord(raw.projectAliases)) return true;
  if (!Array.isArray(raw.disabledPluginIds)) return true;
  if (raw.appearanceTheme !== normalized.appearanceTheme) return true;
  if (raw.statusChangeNotificationsEnabled !== normalized.statusChangeNotificationsEnabled) return true;
  if (raw.agentStatusCompletionSoundEnabled !== normalized.agentStatusCompletionSoundEnabled) return true;
  if (raw.agentStatusApprovalSoundEnabled !== normalized.agentStatusApprovalSoundEnabled) return true;
  if (raw.updatedAt !== normalized.updatedAt) return true;
  return !sameStringArray(raw.configuredRoots, normalized.configuredRoots)
    || !sameStringArray(raw.configuredProjects, normalized.configuredProjects)
    || JSON.stringify(raw.projectAliases) !== JSON.stringify(normalized.projectAliases)
    || !sameStringArray(raw.disabledPluginIds, normalized.disabledPluginIds);
}

function sameStringArray(raw: unknown, normalized: string[]): boolean {
  return Array.isArray(raw)
    && raw.length === normalized.length
    && raw.every((item, index) => item === normalized[index]);
}

function normalizeProjectAliases(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof key === "string" && typeof val === "string" && key.trim() && val.trim()) {
      result[key.trim()] = val.trim();
    }
  }
  return result;
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAppearanceTheme(value: unknown): AppearanceTheme {
  if (value === "morning" || value === "classic") return "morning";
  return value === "night" ? "night" : "day";
}

function themeFromInput(input: string | AppearanceThemeInput | undefined): AppearanceTheme {
  if (input === "morning" || input === "classic") return "morning";
  if (input === "day" || input === "night") return input;
  if (typeof input === "object") return normalizeAppearanceTheme(input.theme);
  return "day";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString();
}
