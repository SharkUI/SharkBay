import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppearanceTheme, AppearanceThemeInput, AppConfig, IpcRuntimeLike, ProjectConfigInput, RemoteMachine, RemoteMachineInput, RemoveProjectInput, RemoveRemoteMachineInput, RemoveRootInput, RenameProjectInput, RootConfigInput } from "../shared/types.js";
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
    configuredRemoteProjects: [],
    configuredRemoteMachines: [],
    projectAliases: {},
    disabledPluginIds: [],
    appearanceTheme: "day",
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
  if (projectValue.startsWith("ssh://")) {
    if (!config.configuredRemoteProjects.includes(projectValue)) {
      config.configuredRemoteProjects.push(projectValue);
    }
  } else {
    const absolute = path.resolve(projectValue);
    if (!config.configuredProjects.includes(absolute)) {
      config.configuredProjects.push(absolute);
    }
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
  if (projectValue.startsWith("ssh://")) {
    config.configuredRemoteProjects = config.configuredRemoteProjects.filter((p) => p !== projectValue);
    delete config.projectAliases[projectValue];
  } else {
    const rawPath = projectValue.startsWith("local:")
      ? decodeURI(projectValue.slice("local:".length))
      : projectValue;
    const absolute = path.resolve(rawPath);
    config.configuredProjects = config.configuredProjects.filter((p) => p !== absolute);
    delete config.projectAliases[`local:${encodeURI(absolute)}`];
    delete config.projectAliases[projectValue];
    delete config.projectAliases[absolute];
  }
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

export async function addConfiguredRemoteMachine(runtime: IpcRuntimeLike, input: RemoteMachineInput): Promise<AppConfig> {
  return (await upsertConfiguredRemoteMachine(runtime, input)).config;
}

export async function upsertConfiguredRemoteMachine(runtime: IpcRuntimeLike, input: RemoteMachineInput): Promise<{ config: AppConfig; machine: RemoteMachine }> {
  const configPath = getRuntimeConfigPath(runtime);
  const config = await loadAppConfig(configPath);
  const machine = remoteMachineFromInput(input, config.configuredRemoteMachines);
  const existingIndex = config.configuredRemoteMachines.findIndex((item) => item.id === machine.id);
  const existing = existingIndex >= 0 ? config.configuredRemoteMachines[existingIndex] : null;
  const passwordSecretId = machine.authMode === "password" ? remoteMachinePasswordSecretId(machine.id) : undefined;
  const nextMachine = {
    ...machine,
    passwordSecretId,
    hasPassword: machine.authMode === "password" ? Boolean(input.password || existing?.hasPassword) : undefined,
  };
  if (existingIndex >= 0) {
    config.configuredRemoteMachines[existingIndex] = {
      ...nextMachine,
      createdAt: existing?.createdAt ?? machine.createdAt,
      updatedAt: now(),
    };
  } else {
    config.configuredRemoteMachines.push(nextMachine);
  }
  config.updatedAt = today();
  await saveAppConfig(config, configPath);
  const savedMachine = config.configuredRemoteMachines[existingIndex >= 0 ? existingIndex : config.configuredRemoteMachines.length - 1];
  if (!savedMachine) {
    throw new Error("Remote machine was not saved");
  }
  return { config, machine: savedMachine };
}

export async function removeConfiguredRemoteMachine(runtime: IpcRuntimeLike, input: RemoveRemoteMachineInput): Promise<AppConfig> {
  const id = input.id?.trim();
  if (!id) {
    throw new Error("Remote machine id is required");
  }
  const configPath = getRuntimeConfigPath(runtime);
  const config = await loadAppConfig(configPath);
  config.configuredRemoteMachines = config.configuredRemoteMachines.filter((machine) => machine.id !== id);
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
  return {
    schemaVersion: 1,
    configuredRoots: Array.isArray(value.configuredRoots)
      ? [...new Set(value.configuredRoots.filter((item): item is string => typeof item === "string").map((item) => path.resolve(item)))]
      : [],
    configuredProjects: Array.isArray(value.configuredProjects)
      ? [...new Set(value.configuredProjects.filter((item): item is string => typeof item === "string").map((item) => path.resolve(item)))]
      : [],
    configuredRemoteProjects: Array.isArray(value.configuredRemoteProjects)
      ? [...new Set(value.configuredRemoteProjects.filter((item): item is string => typeof item === "string" && item.startsWith("ssh://")))]
      : [],
    configuredRemoteMachines: normalizeRemoteMachines(value.configuredRemoteMachines),
    projectAliases: normalizeProjectAliases(value.projectAliases),
    disabledPluginIds: Array.isArray(value.disabledPluginIds)
      ? [...new Set(value.disabledPluginIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
      : [],
    appearanceTheme: normalizeAppearanceTheme(value.appearanceTheme),
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
  if (!Array.isArray(raw.configuredRemoteProjects)) return true;
  if (!Array.isArray(raw.configuredRemoteMachines)) return true;
  if (!isRecord(raw.projectAliases)) return true;
  if (!Array.isArray(raw.disabledPluginIds)) return true;
  if (raw.appearanceTheme !== normalized.appearanceTheme) return true;
  if (raw.updatedAt !== normalized.updatedAt) return true;
  return !sameStringArray(raw.configuredRoots, normalized.configuredRoots)
    || !sameStringArray(raw.configuredProjects, normalized.configuredProjects)
    || !sameStringArray(raw.configuredRemoteProjects, normalized.configuredRemoteProjects)
    || JSON.stringify(raw.configuredRemoteMachines) !== JSON.stringify(normalized.configuredRemoteMachines)
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

function normalizeRemoteMachines(value: unknown): RemoteMachine[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const machines: RemoteMachine[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = normalizeOptionalString(item.label);
    const sshConfigHost = normalizeOptionalString(item.sshConfigHost);
    const host = normalizeOptionalString(item.host) || sshConfigHost;
    const id = normalizeRemoteMachineId(normalizeOptionalString(item.id) || sshConfigHost || host || label);
    if (!id || !label || !host || seen.has(id)) continue;
    seen.add(id);
    const port = typeof item.port === "number" && Number.isInteger(item.port) && item.port > 0 ? item.port : 22;
    const authMode = normalizeRemoteMachineAuthMode(item.authMode);
    const passwordSecretId = normalizeOptionalString(item.passwordSecretId);
    machines.push({
      id,
      label,
      host,
      port,
      username: normalizeOptionalString(item.username) || undefined,
      sshConfigHost: sshConfigHost || undefined,
      authMode,
      keyPath: normalizeOptionalString(item.keyPath) || undefined,
      passwordSecretId: authMode === "password" ? passwordSecretId || remoteMachinePasswordSecretId(id) : undefined,
      hasPassword: authMode === "password" ? Boolean(item.hasPassword || passwordSecretId) : undefined,
      defaultProjectPath: normalizeOptionalString(item.defaultProjectPath) || undefined,
      createdAt: normalizeOptionalString(item.createdAt) || now(),
      updatedAt: normalizeOptionalString(item.updatedAt) || now(),
    });
  }
  return machines;
}

function remoteMachineFromInput(input: RemoteMachineInput, existing: RemoteMachine[]): RemoteMachine {
  const label = input.label.trim();
  const authMode = input.password && input.authMode === "ssh-agent" ? "password" : normalizeRemoteMachineAuthMode(input.authMode);
  const sshConfigHost = normalizeOptionalString(input.sshConfigHost);
  const host = normalizeOptionalString(input.host) || sshConfigHost;
  const username = normalizeOptionalString(input.username);
  const keyPath = normalizeOptionalString(input.keyPath);
  const port = typeof input.port === "number" && Number.isInteger(input.port) && input.port > 0 ? input.port : 22;
  if (!label) {
    throw new Error("Remote machine label is required");
  }
  if (authMode === "system-ssh-config" && !sshConfigHost) {
    throw new Error("SSH config host is required");
  }
  if (authMode !== "system-ssh-config" && !host) {
    throw new Error("Host is required");
  }
  if (authMode === "key-file" && !keyPath) {
    throw new Error("Key path is required");
  }
  if (authMode === "password" && !username) {
    throw new Error("Username is required for password login");
  }
  const idSource = sshConfigHost || host || label;
  const id = uniqueRemoteMachineId(normalizeRemoteMachineId(idSource), existing);
  const timestamp = now();
  return {
    id,
    label,
    host,
    port,
    username: username || undefined,
    sshConfigHost: sshConfigHost || undefined,
    authMode,
    keyPath: keyPath || undefined,
    passwordSecretId: authMode === "password" ? remoteMachinePasswordSecretId(id) : undefined,
    hasPassword: authMode === "password" ? Boolean(input.password) : undefined,
    defaultProjectPath: normalizeOptionalString(input.defaultProjectPath) || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeRemoteMachineAuthMode(value: unknown): RemoteMachine["authMode"] {
  if (value === "ssh-agent" || value === "key-file" || value === "password") return value;
  return "system-ssh-config";
}

export function remoteMachinePasswordSecretId(machineId: string): string {
  return `remote-machine:${normalizeRemoteMachineId(machineId)}:password`;
}

function uniqueRemoteMachineId(baseId: string, existing: RemoteMachine[]): string {
  const fallback = baseId || "remote";
  const existingIds = new Set(existing.map((machine) => machine.id));
  if (!existingIds.has(fallback)) return fallback;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${fallback}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${fallback}-${Date.now().toString(36)}`;
}

function normalizeRemoteMachineId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
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
