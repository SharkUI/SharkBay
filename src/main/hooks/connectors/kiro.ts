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

const EVENT_MAP: Record<string, HookEventKind> = {
  agentSpawn: "session_start",
  userPromptSubmit: "prompt",
  preToolUse: "tool_start",
  postToolUse: "tool_end",
  stop: "turn_end",
};

const HOOK_EVENTS = ["agentSpawn", "userPromptSubmit", "preToolUse", "postToolUse", "stop"];
const MANAGED_MARKER = "sharkbay-managed";
const DEFAULT_TOOLS = ["*"];

export class KiroConnector implements AgentConnector {
  readonly id = "kiro";
  readonly displayName = "Kiro CLI";
  readonly supportedEvents: readonly HookEventKind[] = ["session_start", "prompt", "tool_start", "tool_end", "turn_end"];

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
