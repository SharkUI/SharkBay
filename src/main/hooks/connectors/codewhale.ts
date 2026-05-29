/**
 * CodeWhale connector.
 *
 * CodeWhale uses TOML config at ~/.codewhale/config.toml with [[hooks.hooks]] entries.
 * Its hook payload format is its own HookEvent enum (tool_lifecycle, approval_lifecycle, etc.)
 * plus the standard events (session_start, session_end, message_submit, tool_call_before/after).
 *
 * The hook command receives JSON on stdin with the event payload.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AgentConnector, ConnectorStatus, HookEventKind, UnifiedHookEvent } from "../types.js";

const EVENT_MAP: Record<string, HookEventKind> = {
  session_start: "session_start",
  session_end: "session_end",
  message_submit: "prompt",
  tool_call_before: "tool_start",
  tool_call_after: "tool_end",
};

const HOOK_EVENTS = ["session_start", "session_end", "message_submit", "tool_call_before", "tool_call_after"];
const MANAGED_NAME = "sharkbay-status";

function shellQuote(s: string): string {
  if (!s) return "''";
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export class CodeWhaleConnector implements AgentConnector {
  readonly id = "deepseek";
  readonly displayName = "CodeWhale";
  readonly supportedEvents: readonly HookEventKind[] = ["session_start", "session_end", "prompt", "tool_start", "tool_end"];

  private readonly configPath = path.join(os.homedir(), ".codewhale", "config.toml");

  async detect(): Promise<boolean> {
    try { fs.accessSync(this.configPath); return true; } catch { return false; }
  }

  async install(hookCliPath: string): Promise<void> {
    await this.uninstall();
    let content = this.readConfig();
    // Use the codewhale-specific hook script (reads env vars, not stdin)
    const binDir = path.dirname(hookCliPath);
    const command = `${shellQuote(path.join(binDir, "sharkbay-hook-codewhale"))}`;

    // Ensure [hooks] section exists with enabled = true
    if (!content.includes("[hooks]")) {
      content = content.trimEnd() + "\n\n[hooks]\nenabled = true\n";
    }

    // Append managed hook entries — pass event name as $1
    const entries = HOOK_EVENTS.map((event) =>
      `\n[[hooks.hooks]]\nevent = "${event}"\ncommand = "${command} ${event}"\nname = "${MANAGED_NAME}"\nbackground = true\ntimeout_secs = 5`
    ).join("\n");

    content += entries + "\n";
    this.writeConfig(content);
  }

  async uninstall(): Promise<void> {
    const content = this.readConfig();
    if (!content.includes(MANAGED_NAME)) return;

    // Remove all [[hooks.hooks]] blocks that contain our managed name
    const lines = content.split("\n");
    const result: string[] = [];
    let i = 0;
    while (i < lines.length) {
      if (lines[i]!.trim() === "[[hooks.hooks]]") {
        // Collect the entire block
        const block: string[] = [lines[i]!];
        i++;
        while (i < lines.length && lines[i]!.trim() !== "" && !lines[i]!.startsWith("[")) {
          block.push(lines[i]!);
          i++;
        }
        // Check if this block is ours
        if (!block.some((l) => l.includes(MANAGED_NAME))) {
          result.push(...block);
        }
      } else {
        result.push(lines[i]!);
        i++;
      }
    }

    // Clean up excessive blank lines
    const cleaned = result.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
    this.writeConfig(cleaned);
  }

  async status(): Promise<ConnectorStatus> {
    if (!(await this.detect())) return "agent_missing";
    const content = this.readConfig();
    return content.includes(MANAGED_NAME) ? "installed" : "not_installed";
  }

  normalize(raw: unknown): UnifiedHookEvent | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    // CodeWhale sends events in two formats:
    // 1. Direct hook dispatch: { type: "tool_lifecycle", tool_name, phase, ... }
    // 2. Wrapped: { at: "...", event: { type: "...", ... } }
    const event = (typeof r.event === "object" && r.event !== null) ? r.event as Record<string, unknown> : r;
    const type = typeof event.type === "string" ? event.type : null;
    if (!type) return null;

    // Map approval_lifecycle → attention
    if (type === "approval_lifecycle") {
      const phase = typeof event.phase === "string" ? event.phase : "";
      if (phase === "requested" || phase === "pending") {
        return {
          agent: this.id,
          sessionId: "",
          event: "attention",
          timestamp: typeof r.at === "string" ? r.at : new Date().toISOString(),
          cwd: typeof event.cwd === "string" ? event.cwd : undefined,
        };
      }
      // approved/denied → back to working
      return {
        agent: this.id,
        sessionId: "",
        event: "tool_start",
        timestamp: typeof r.at === "string" ? r.at : new Date().toISOString(),
        cwd: typeof event.cwd === "string" ? event.cwd : undefined,
      };
    }

    // Map tool_lifecycle
    if (type === "tool_lifecycle") {
      const phase = typeof event.phase === "string" ? event.phase : "";
      const toolName = typeof event.tool_name === "string" ? event.tool_name : "";
      const mapped: HookEventKind = phase === "end" ? "tool_end" : "tool_start";
      return {
        agent: this.id,
        sessionId: typeof event.response_id === "string" ? event.response_id : "",
        event: mapped,
        timestamp: typeof r.at === "string" ? r.at : new Date().toISOString(),
        tool: { name: toolName },
        cwd: typeof event.cwd === "string" ? event.cwd : undefined,
      };
    }

    // Map job_lifecycle (response start/end → working/idle)
    if (type === "job_lifecycle" || type === "response_start") {
      return {
        agent: this.id,
        sessionId: typeof event.job_id === "string" ? event.job_id : typeof event.response_id === "string" ? event.response_id : "",
        event: "prompt",
        timestamp: typeof r.at === "string" ? r.at : new Date().toISOString(),
        cwd: typeof event.cwd === "string" ? event.cwd : undefined,
      };
    }

    if (type === "response_end") {
      return {
        agent: this.id,
        sessionId: typeof event.response_id === "string" ? event.response_id : "",
        event: "turn_end",
        timestamp: typeof r.at === "string" ? r.at : new Date().toISOString(),
        cwd: typeof event.cwd === "string" ? event.cwd : undefined,
      };
    }

    // Fallback: try direct event name mapping (from the hook dispatch context)
    // The hook is triggered with a context JSON that includes hook_event
    const hookEvent = typeof event.hook_event === "string" ? event.hook_event : type;
    const mapped = EVENT_MAP[hookEvent];
    if (mapped) {
      return {
        agent: this.id,
        sessionId: "",
        event: mapped,
        timestamp: typeof r.at === "string" ? r.at : new Date().toISOString(),
        tool: typeof event.tool_name === "string" ? { name: event.tool_name } : undefined,
        prompt: typeof event.prompt === "string" ? event.prompt : undefined,
        cwd: typeof event.cwd === "string" ? event.cwd : undefined,
      };
    }

    return null;
  }

  private readConfig(): string {
    try { return fs.readFileSync(this.configPath, "utf8"); } catch { return ""; }
  }

  private writeConfig(content: string): void {
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.configPath + ".tmp";
    fs.writeFileSync(tmp, content, "utf8");
    fs.renameSync(tmp, this.configPath);
  }
}
