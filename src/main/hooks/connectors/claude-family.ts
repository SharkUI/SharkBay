/**
 * Claude-family connector — covers Claude Code, Codex, and Qwen.
 *
 * These agents share the same hook protocol (stdin JSON with hook_event_name field).
 * Subclasses only differ in config file path and format.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AgentConnector, ConnectorStatus, HookEventKind, UnifiedHookEvent } from "../types.js";

// ---------------------------------------------------------------------------
// Shared normalize logic for Claude hook protocol
// ---------------------------------------------------------------------------

const EVENT_MAP: Record<string, HookEventKind> = {
  SessionStart: "session_start",
  UserPromptSubmit: "prompt",
  PreToolUse: "tool_start",
  PostToolUse: "tool_end",
  Stop: "turn_end",
  SessionEnd: "session_end",
  PermissionRequest: "attention",
  PermissionDenied: "attention",
};

function normalizeClaudePayload(agentId: string, raw: unknown): UnifiedHookEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const hookName = typeof r.hook_event_name === "string" ? r.hook_event_name : null;
  if (!hookName) return null;

  // Notification with permission-related types → attention
  let event = EVENT_MAP[hookName];
  if (!event && hookName === "Notification") {
    const ntype = typeof r.notification_type === "string" ? r.notification_type : "";
    if (ntype === "permission_prompt") {
      event = "attention";
    } else if (ntype === "idle_prompt") {
      event = "turn_end";
    }
  }
  if (!event) return null;

  return {
    agent: agentId,
    sessionId: typeof r.session_id === "string" ? r.session_id : "",
    event,
    timestamp: new Date().toISOString(),
    tool: typeof r.tool_name === "string" ? { name: r.tool_name, input: r.tool_input } : undefined,
    prompt: typeof r.prompt === "string" ? r.prompt : undefined,
    cwd: typeof r.cwd === "string" ? r.cwd : undefined,
  };
}

// ---------------------------------------------------------------------------
// Hook entries that get written to agent config
// ---------------------------------------------------------------------------

// Hook specs: (eventName, matcher, timeout)
// matcher: null = no matcher field, "*" = match all tools/types
// Based on Open Island's proven configuration
const HOOK_EVENT_SPECS: Array<{ name: string; matcher: string | null; timeout: number | null }> = [
  { name: "UserPromptSubmit", matcher: null, timeout: null },
  { name: "SessionStart", matcher: null, timeout: null },
  { name: "SessionEnd", matcher: null, timeout: null },
  { name: "Stop", matcher: null, timeout: null },
  { name: "Notification", matcher: "*", timeout: null },
  { name: "PreToolUse", matcher: "*", timeout: null },
  { name: "PermissionRequest", matcher: "*", timeout: 86400 },
  { name: "PostToolUse", matcher: "*", timeout: null },
  { name: "PermissionDenied", matcher: "*", timeout: null },
];

const MANAGED_MARKER = "sharkbay-managed";

function shellQuote(s: string): string {
  if (!s) return "''";
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function tomlString(s: string): string {
  return JSON.stringify(s);
}

function buildHookEntries(hookCliPath: string, source: string): Record<string, unknown[]> {
  const command = `${shellQuote(hookCliPath)} --source ${source}`;
  const entries: Record<string, unknown[]> = {};
  for (const spec of HOOK_EVENT_SPECS) {
    const hook: Record<string, unknown> = { type: "command", command };
    if (spec.timeout != null) hook.timeout = spec.timeout;
    const group: Record<string, unknown> = { hooks: [hook], _managedBy: MANAGED_MARKER };
    if (spec.matcher != null) group.matcher = spec.matcher;
    entries[spec.name] = [group];
  }
  return entries;
}

// ---------------------------------------------------------------------------
// JSON config connector (Claude, Qwen)
// ---------------------------------------------------------------------------

export class ClaudeConnector implements AgentConnector {
  readonly id: string;
  readonly displayName: string;
  readonly supportedEvents: readonly HookEventKind[] = ["session_start", "prompt", "tool_start", "tool_end", "turn_end", "session_end", "attention"];

  protected readonly configPath: string;
  protected readonly commandName: string;

  constructor(options?: { id?: string; displayName?: string; configPath?: string; commandName?: string }) {
    this.id = options?.id ?? "claude";
    this.displayName = options?.displayName ?? "Claude Code";
    this.configPath = options?.configPath ?? path.join(os.homedir(), ".claude", "settings.json");
    this.commandName = options?.commandName ?? "claude";
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
    const hooks = (config.hooks as Record<string, unknown[]>) ?? {};
    const managed = buildHookEntries(hookCliPath, this.id);
    for (const [event, entries] of Object.entries(managed)) {
      const existing = Array.isArray(hooks[event]) ? hooks[event].filter((e: any) => e?._managedBy !== MANAGED_MARKER) : [];
      hooks[event] = [...existing, ...entries];
    }
    config.hooks = hooks;
    this.writeConfig(config);
  }

  async uninstall(): Promise<void> {
    const config = this.readConfig();
    const hooks = config.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) return;
    for (const spec of HOOK_EVENT_SPECS) {
      const arr = hooks[spec.name];
      if (Array.isArray(arr)) {
        hooks[spec.name] = arr.filter((e: any) => e?._managedBy !== MANAGED_MARKER);
        if (hooks[spec.name]!.length === 0) delete hooks[spec.name];
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
    const hasManaged = HOOK_EVENT_SPECS.some((spec) => { const arr = hooks[spec.name]; return Array.isArray(arr) && arr.some((h: any) => h?._managedBy === MANAGED_MARKER); });
    return hasManaged ? "installed" : "not_installed";
  }

  normalize(raw: unknown): UnifiedHookEvent | null {
    return normalizeClaudePayload(this.id, raw);
  }

  // --- Config I/O (JSON) ---

  protected readConfig(): Record<string, unknown> {
    try {
      return JSON.parse(fs.readFileSync(this.configPath, "utf8"));
    } catch {
      return {};
    }
  }

  protected writeConfig(config: Record<string, unknown>): void {
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.configPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, this.configPath);
  }
}

// ---------------------------------------------------------------------------
// Qwen connector (same protocol, different config path)
// ---------------------------------------------------------------------------

export class QwenConnector extends ClaudeConnector {
  constructor() {
    super({ id: "qwen", displayName: "Qwen Code", configPath: path.join(os.homedir(), ".qwen", "settings.json"), commandName: "qwen" });
  }
}

// ---------------------------------------------------------------------------
// Codex connector (TOML config format)
// ---------------------------------------------------------------------------

export class CodexConnector extends ClaudeConnector {
  constructor() {
    super({ id: "codex", displayName: "Codex CLI", configPath: path.join(os.homedir(), ".codex", "config.toml"), commandName: "codex" });
  }

  // Codex uses TOML. For now, use a simple line-based approach to manage hook entries
  // without pulling in a full TOML library. We append/remove a managed section.

  private readonly sectionStart = "# --- sharkbay-managed-hooks-start ---";
  private readonly sectionEnd = "# --- sharkbay-managed-hooks-end ---";

  override async install(hookCliPath: string): Promise<void> {
    await this.uninstall(); // remove old managed section first
    const content = this.readRawConfig();
    const command = `${shellQuote(hookCliPath)} --source codex`;
    const hookLines = HOOK_EVENT_SPECS.flatMap((spec) => {
      const lines = [`[[hooks.${spec.name}]]`];
      if (spec.matcher != null) lines.push(`matcher = ${tomlString(spec.matcher)}`);
      lines.push(`[[hooks.${spec.name}.hooks]]`);
      lines.push('type = "command"');
      lines.push(`command = ${tomlString(command)}`);
      if (spec.timeout != null) lines.push(`timeout = ${spec.timeout}`);
      return lines;
    });
    const section = [this.sectionStart, ...hookLines, this.sectionEnd].join("\n");
    this.writeRawConfig(content.trimEnd() + "\n\n" + section + "\n");
  }

  override async uninstall(): Promise<void> {
    const content = this.readRawConfig();
    const startIdx = content.indexOf(this.sectionStart);
    const endIdx = content.indexOf(this.sectionEnd);
    if (startIdx < 0 || endIdx < 0) return;
    const cleaned = content.slice(0, startIdx).trimEnd() + "\n" + content.slice(endIdx + this.sectionEnd.length).trimStart();
    this.writeRawConfig(cleaned.trim() + "\n");
  }

  override async status(): Promise<ConnectorStatus> {
    if (!(await this.detect())) return "agent_missing";
    const content = this.readRawConfig();
    return content.includes(this.sectionStart) ? "installed" : "not_installed";
  }

  private readRawConfig(): string {
    try {
      return fs.readFileSync(this.configPath, "utf8");
    } catch {
      return "";
    }
  }

  private writeRawConfig(content: string): void {
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.configPath + ".tmp";
    fs.writeFileSync(tmp, content, "utf8");
    fs.renameSync(tmp, this.configPath);
  }
}
