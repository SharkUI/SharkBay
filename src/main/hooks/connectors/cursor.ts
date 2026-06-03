/**
 * Cursor CLI connector — maps Cursor's hook events to unified format.
 *
 * Cursor uses: sessionStart, sessionEnd, beforeSubmitPrompt, stop,
 * beforeShellExecution, afterShellExecution, afterFileEdit, beforeReadFile.
 * Config: ~/.cursor/hooks.json (version: 1 schema)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AgentConnector, ConnectorStatus, HookEventKind, UnifiedHookEvent } from "../types.js";

const EVENT_MAP: Record<string, HookEventKind> = {
  sessionStart: "session_start",
  sessionEnd: "session_end",
  beforeSubmitPrompt: "prompt",
  beforeShellExecution: "tool_start",
  afterShellExecution: "tool_end",
  afterFileEdit: "tool_end",
  stop: "turn_end",
};

const HOOK_EVENTS = ["sessionStart", "sessionEnd", "beforeSubmitPrompt", "beforeShellExecution", "afterShellExecution", "afterFileEdit", "stop"];
const MANAGED_MARKER = "sharkbay-managed";

function shellQuote(s: string): string {
  if (!s) return "''";
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export class CursorConnector implements AgentConnector {
  readonly id = "cursor";
  readonly displayName = "Cursor CLI";
  readonly supportedEvents: readonly HookEventKind[] = ["session_start", "session_end", "prompt", "tool_start", "tool_end", "turn_end"];

  private readonly configPath = path.join(os.homedir(), ".cursor", "hooks.json");

  async detect(): Promise<boolean> {
    try { fs.accessSync(path.dirname(this.configPath)); return true; } catch { return false; }
  }

  async install(hookCliPath: string): Promise<void> {
    await this.uninstall();
    const config = this.readConfig();
    const hooks = (config.hooks as Record<string, unknown[]>) ?? {};
    for (const event of HOOK_EVENTS) {
      const entry = { command: `${shellQuote(hookCliPath)} --source cursor`, _managedBy: MANAGED_MARKER };
      const existing = Array.isArray(hooks[event]) ? hooks[event].filter((e: any) => e?._managedBy !== MANAGED_MARKER) : [];
      hooks[event] = [...existing, entry];
    }
    config.hooks = hooks;
    if (!config.version) config.version = 1;
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

  async status(): Promise<ConnectorStatus> {
    if (!(await this.detect())) return "agent_missing";
    const config = this.readConfig();
    const hooks = config.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) return "not_installed";
    const hasManaged = HOOK_EVENTS.some((e) => Array.isArray(hooks[e]) && hooks[e].some((h: any) => h?._managedBy === MANAGED_MARKER));
    return hasManaged ? "installed" : "not_installed";
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
      cwd: Array.isArray(r.workspace_roots) && typeof r.workspace_roots[0] === "string" ? r.workspace_roots[0] : undefined,
    };
  }

  private readConfig(): Record<string, unknown> {
    try { return JSON.parse(fs.readFileSync(this.configPath, "utf8")); } catch { return {}; }
  }

  private writeConfig(config: Record<string, unknown>): void {
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.configPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, this.configPath);
  }
}
