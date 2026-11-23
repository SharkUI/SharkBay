/**
 * Kiro CLI connector — maps Kiro's camelCase hook events to unified format.
 *
 * Kiro uses: agentSpawn, userPromptSubmit, preToolUse, postToolUse, stop.
 * Note: Kiro does not emit a session_end event; relies on 5-min timeout fallback.
 * Config: ~/.kiro/agents/sharkbay.json (launched via --agent sharkbay).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AgentConnector, ConnectorStatus, HookEventKind, UnifiedHookEvent } from "../types.js";
import type { SessionHookLaunch } from "../session-launch.js";
import { readJsonFile, writeJsonAtomic } from "../../json-file.js";

const EVENT_MAP: Record<string, HookEventKind> = {
  agentSpawn: "session_start",
  userPromptSubmit: "prompt",
  preToolUse: "tool_start",
  postToolUse: "tool_end",
  stop: "turn_end",
  SessionStart: "session_start",
  UserPromptSubmit: "prompt",
  PreToolUse: "tool_start",
  PostToolUse: "tool_end",
  Stop: "turn_end",
  SessionEnd: "session_end",
};

const HOOK_EVENTS = ["agentSpawn", "userPromptSubmit", "preToolUse", "postToolUse", "stop"];
const MANAGED_MARKER = "sharkbay-managed";
const DEFAULT_TOOLS = ["*"];
const STANDALONE_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionEnd"];
const DEFAULT_PROFILE = "sharkbay-status";
const agentFlag = /((?:^|\s)['"]?--agent['"]?(?:=|\s+)['"]?)([\w.-]+)(?=['"\s]|$)/u;

export async function registerKiroLaunchHooks(
  hookCli: string, command: string, cwd: string, env: NodeJS.ProcessEnv, version: string,
): Promise<SessionHookLaunch> {
  const osHome = env.HOME || os.homedir();
  const home = env.KIRO_HOME && path.isAbsolute(env.KIRO_HOME) ? env.KIRO_HOME : path.join(osHome, ".kiro");
  const settings = await readJsonFile(path.join(home, "settings", "cli.json"));
  if (!settings.ok && settings.reason !== "missing") throw new Error(settings.message);
  const config = settings.ok && record(settings.data) ? settings.data : {};
  const engine = command.match(/(?:^|\s)--agent-engine(?:=|\s+)['"]?(v[123])(?=['"\s]|$)/u)?.[1]
    ?? command.match(/(?:^|\s)--(v[23])(?=\s|$)/u)?.[1]
    ?? env.KIRO_AGENT_ENGINE
    ?? config["chat.agentEngine"];
  const [,major,minor] = version.match(/(\d+)\.(\d+)\.\d+/u) ?? [];
  const v3 = engine === "v3" || (engine == null && Number(major) >= 3);
  const supportedStandalone = Number(major) >= 3 || Number(major) === 2 && Number(minor) >= 29;
  const hookCommand = `'${hookCli.replace(/'/g, "'\\''")}' --source kiro --managed-launch`;
  if (v3 && supportedStandalone) {
    const dir = Number(major) === 2 && Number(minor) < 31 ? path.join(osHome, ".kiro") : home;
    const file = path.join(dir, "hooks", "sharkbay-status.json");
    await updateKiroFile(file, (current, exists) => {
      if (exists && (current.version !== "v1" || Object.keys(current).some(key => key !== "version" && key !== "hooks")
        || !Array.isArray(current.hooks) || !current.hooks.length || !current.hooks.every(isManagedListEntry))) {
        throw new Error("Kiro standalone hook file belongs to the user");
      }
      return { version: "v1", hooks: STANDALONE_EVENTS.map(event => listEntry(event, hookCommand)) };
    });
    return {};
  }
  if (v3) return {};
  const explicit = command.match(agentFlag)?.[2];
  if (!explicit && /(?:^|\s)['"]?--agent['"]?(?:=|\s|$)/u.test(command)) return {};
  const configured = typeof config["chat.defaultAgent"] === "string" ? config["chat.defaultAgent"] : undefined;
  const selected = explicit ?? configured;
  const builtin = !selected || selected === "kiro_default";
  const profile = builtin ? DEFAULT_PROFILE : selected;
  if (!/^[\w.-]+$/u.test(profile) || profile === "." || profile === "..") return {};
  const globalAgents = env.KIRO_AGENT_CONFIG_DIR && path.isAbsolute(env.KIRO_AGENT_CONFIG_DIR)
    ? env.KIRO_AGENT_CONFIG_DIR
    : path.join(home, "agents");
  const file = await findKiroProfile(profile, cwd, globalAgents, !env.KIRO_AGENT_CONFIG_DIR && !builtin);
  await updateKiroFile(file, (current, exists) => {
    if (builtin && exists && (current.name !== DEFAULT_PROFILE || (!Object.values(record(current.hooks) ? current.hooks : {})
      .some(entries => Array.isArray(entries) && entries.some(isManagedObjectEntry))))) {
      throw new Error("Kiro profile name is already in use");
    }
    if (!builtin && !exists) throw new Error("The selected Kiro profile does not have an editable configuration");
    return { ...(exists ? current : { name: DEFAULT_PROFILE, tools: DEFAULT_TOOLS }), hooks: mergeProfileHooks(current, hookCommand) };
  });
  if (!builtin) return {};
  return explicit ? { command: command.replace(agentFlag, `$1${DEFAULT_PROFILE}`) } : { args: ["--agent", DEFAULT_PROFILE] };
}

async function findKiroProfile(profile: string, cwd: string, globalAgents: string, checkWorkspace: boolean): Promise<string> {
  if (checkWorkspace) {
    for (let dir = cwd; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, ".kiro", "agents", `${profile}.json`);
      if (fs.existsSync(candidate)) return candidate;
      if (fs.existsSync(path.join(dir, ".git")) || dir === path.dirname(dir)) break;
    }
  }
  return path.join(globalAgents, `${profile}.json`);
}

async function updateKiroFile(file: string, merge: (current: Record<string, unknown>, exists: boolean) => Record<string, unknown>): Promise<void> {
  const stat = await fs.promises.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (stat && !stat.isFile()) throw new Error("Kiro hook configuration is not a regular file");
  const read = await readJsonFile(file);
  if (!read.ok && read.reason !== "missing") throw new Error(read.message);
  const current = read.ok ? read.data : {};
  if (!record(current)) throw new Error("Unsupported Kiro configuration");
  const next = merge(current, read.ok);
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await writeJsonAtomic(file, next);
}

function mergeProfileHooks(current: Record<string, unknown>, command: string): unknown {
  if (Array.isArray(current.hooks) || (current.hooks === undefined && record(current.permissions))) {
    return [...(Array.isArray(current.hooks) ? current.hooks.filter(entry => !isManagedListEntry(entry)) : []),
      ...HOOK_EVENTS.map(event => listEntry(event, command))];
  }
  if (current.hooks !== undefined && !record(current.hooks)) throw new Error("Unsupported Kiro hooks");
  const hooks = { ...(record(current.hooks) ? current.hooks : {}) };
  for (const event of HOOK_EVENTS) {
    const existing = hooks[event];
    if (existing !== undefined && !Array.isArray(existing)) throw new Error("Unsupported Kiro hook list");
    hooks[event] = [
      ...(Array.isArray(existing) ? existing.filter(entry => !isManagedObjectEntry(entry)) : []),
      { command, timeout_ms: 5000, ...(event === "preToolUse" || event === "postToolUse" ? { matcher: "*" } : {}), _managedBy: MANAGED_MARKER },
    ];
  }
  return hooks;
}

function listEntry(trigger: string, command: string) {
  return { name: `sharkbay-status-${trigger}`, trigger, action: { type: "command", command }, timeout: 5 };
}

function isManagedListEntry(value: unknown): boolean {
  return record(value) && typeof value.name === "string" && value.name.startsWith("sharkbay-status-")
    && record(value.action) && typeof value.action.command === "string" && value.action.command.includes("--source kiro");
}

function isManagedObjectEntry(value: unknown): boolean {
  return record(value) && value._managedBy === MANAGED_MARKER;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class KiroConnector implements AgentConnector {
  readonly id = "kiro";
  readonly displayName = "Kiro CLI";
  readonly supportedEvents: readonly HookEventKind[] = ["session_start", "prompt", "tool_start", "tool_end", "turn_end", "session_end"];

  private readonly agentsDir = path.join(os.homedir(), ".kiro", "agents");
  private readonly configPath = path.join(os.homedir(), ".kiro", "agents", "sharkbay.json");

  async detect(): Promise<boolean> {
    try { fs.accessSync(this.agentsDir); return true; } catch { return false; }
  }

  async install(hookCliPath: string): Promise<void> {
    const config = this.readConfig();
    config.name = "sharkbay";
    if (!config.tools) config.tools = DEFAULT_TOOLS;
    const hooks = (config.hooks as Record<string, unknown[]>) ?? {};
    for (const event of HOOK_EVENTS) {
      const entry = { command: `"${hookCliPath}" --source kiro`, timeout_ms: 5000, _managedBy: MANAGED_MARKER };
      const existing = Array.isArray(hooks[event]) ? hooks[event].filter((e: any) => e?._managedBy !== MANAGED_MARKER) : [];
      hooks[event] = [...existing, entry];
    }
    config.hooks = hooks;
    this.writeConfig(config);
  }

  async uninstall(): Promise<void> {
    const config = this.readConfig();
    const hooks = config.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) return;
    for (const event of HOOK_EVENTS) {
      if (Array.isArray(hooks[event])) {
        hooks[event] = hooks[event].filter((e: any) => e?._managedBy !== MANAGED_MARKER);
        if (hooks[event].length === 0) delete hooks[event];
      }
    }
    if (Object.keys(hooks).length === 0) delete config.hooks;
    this.writeConfig(config);
  }

  async status(expectedHookCliPath?: string): Promise<ConnectorStatus> {
    if (!(await this.detect())) return "agent_missing";
    const config = this.readConfig();
    const hooks = config.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) return "not_installed";
    const hasManaged = HOOK_EVENTS.some((e) => Array.isArray(hooks[e]) && hooks[e].some((h: any) => h?._managedBy === MANAGED_MARKER));
    if (!hasManaged) return "not_installed";
    if (expectedHookCliPath) {
      const expected = `"${expectedHookCliPath}" --source kiro`;
      const managed = Object.values(hooks).flat().filter((h: any) => h?._managedBy === MANAGED_MARKER);
      if (!managed.every((h: any) => h.command === expected)) return "outdated";
    }
    return "installed";
  }

  normalize(raw: unknown): UnifiedHookEvent | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const hookName = typeof r.hook_event_name === "string" ? r.hook_event_name : null;
    if (!hookName) return null;

    const event = EVENT_MAP[hookName];
    if (!event) return null;

    return {
      agent: this.id,
      sessionId: typeof r.session_id === "string" ? r.session_id : "",
      event,
      timestamp: new Date().toISOString(),
      tool: typeof r.tool_name === "string" ? { name: r.tool_name, input: r.tool_input } : undefined,
      prompt: typeof r.prompt === "string" ? r.prompt : undefined,
      cwd: typeof r.cwd === "string" ? r.cwd : undefined,
    };
  }

  private readConfig(): Record<string, unknown> {
    try { return JSON.parse(fs.readFileSync(this.configPath, "utf8")); } catch { return {}; }
  }

  private writeConfig(config: Record<string, unknown>): void {
    fs.mkdirSync(this.agentsDir, { recursive: true });
    const tmp = this.configPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, this.configPath);
  }
}
