/**
 * Reasonix connector.
 *
 * Reasonix loads command hooks from <Reasonix home>/settings.json and sends a
 * camelCase JSON payload on stdin. The payload does not contain a native
 * session id, so SharkBay's hook bridge adds the launch-scoped id.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AgentConnector, ConnectorStatus, HookEventKind, UnifiedHookEvent } from "../types.js";

const EVENT_MAP: Record<string, HookEventKind> = {
  SessionStart: "session_start",
  SessionEnd: "session_end",
  UserPromptSubmit: "prompt",
  PreToolUse: "tool_start",
  PostToolUse: "tool_end",
  Stop: "turn_end",
  PermissionRequest: "attention",
  Notification: "attention",
};

const HOOK_SPECS: Array<{ event: string; match?: string }> = [
  { event: "SessionStart" },
  { event: "SessionEnd" },
  { event: "UserPromptSubmit" },
  { event: "PreToolUse", match: "*" },
  { event: "PostToolUse", match: "*" },
  { event: "Stop" },
  { event: "PermissionRequest", match: "*" },
  { event: "Notification" },
];

const MANAGED_DESCRIPTION = "SharkBay agent status";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export class ReasonixConnector implements AgentConnector {
  readonly id = "reasonix";
  readonly displayName = "Reasonix";
  readonly supportedEvents: readonly HookEventKind[] = ["session_start", "session_end", "prompt", "tool_start", "tool_end", "turn_end", "attention"];

  private readonly configPath: string;

  constructor(options: { configPath?: string } = {}) {
    this.configPath = options.configPath ?? path.join(reasonixHome(), "settings.json");
  }

  async detect(): Promise<boolean> {
    try {
      fs.accessSync(path.dirname(this.configPath));
      return true;
    } catch {
      return false;
    }
  }

  async install(hookCliPath: string): Promise<void> {
    const config = this.readConfig();
    const hooks = readHooks(config);
    removeManagedHooks(hooks);

    const command = `${shellQuote(hookCliPath)} --source reasonix`;
    for (const spec of HOOK_SPECS) {
      const entry: Record<string, unknown> = {
        command,
        description: MANAGED_DESCRIPTION,
        timeout: 5000,
      };
      if (spec.match) entry.match = spec.match;
      const existing = Array.isArray(hooks[spec.event]) ? hooks[spec.event]! : [];
      hooks[spec.event] = [...existing, entry];
    }

    config.hooks = hooks;
    this.writeConfig(config);
  }

  async uninstall(): Promise<void> {
    const config = this.readConfig();
    const hooks = readHooks(config);
    if (!removeManagedHooks(hooks)) return;
    if (Object.keys(hooks).length === 0) delete config.hooks;
    else config.hooks = hooks;
    this.writeConfig(config);
  }

  async status(): Promise<ConnectorStatus> {
    if (!(await this.detect())) return "agent_missing";
    const hooks = readHooks(this.readConfig());
    return Object.values(hooks).some((entries) => Array.isArray(entries) && entries.some(isManagedHook))
      ? "installed"
      : "not_installed";
  }

  normalize(raw: unknown): UnifiedHookEvent | null {
    if (!isRecord(raw)) return null;
    const eventName = readString(raw, "event");
    const event = eventName ? EVENT_MAP[eventName] : undefined;
    if (!event) return null;

    const toolName = readString(raw, "toolName") ?? "";
    const message = readString(raw, "message") ?? "";
    const prompt = event === "attention"
      ? message || toolName || undefined
      : readString(raw, "prompt") ?? undefined;

    return {
      agent: this.id,
      sessionId: readString(raw, "sharkbaySessionId") ?? "",
      event,
      timestamp: new Date().toISOString(),
      tool: toolName ? {
        name: toolName,
        input: raw.toolArgs,
        response: raw.toolResult,
      } : undefined,
      prompt,
      cwd: readString(raw, "cwd") ?? undefined,
    };
  }

  private readConfig(): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeConfig(config: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const tmp = `${this.configPath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, this.configPath);
  }
}

function reasonixHome(): string {
  const override = process.env.REASONIX_HOME?.trim();
  if (override) return path.resolve(override);
  if (process.platform === "win32" && process.env.APPDATA) return path.join(process.env.APPDATA, "reasonix");
  return path.join(os.homedir(), ".reasonix");
}

function readHooks(config: Record<string, unknown>): Record<string, unknown[]> {
  return isRecord(config.hooks) ? config.hooks as Record<string, unknown[]> : {};
}

function removeManagedHooks(hooks: Record<string, unknown[]>): boolean {
  let changed = false;
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const remaining = entries.filter((entry) => !isManagedHook(entry));
    if (remaining.length === entries.length) continue;
    changed = true;
    if (remaining.length === 0) delete hooks[event];
    else hooks[event] = remaining;
  }
  return changed;
}

function isManagedHook(value: unknown): boolean {
  return isRecord(value)
    && value.description === MANAGED_DESCRIPTION
    && typeof value.command === "string"
    && value.command.includes("--source reasonix");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const next = value[key];
  return typeof next === "string" ? next : null;
}
