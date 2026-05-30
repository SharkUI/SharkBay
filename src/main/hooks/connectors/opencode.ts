/**
 * OpenCode connector — installs a JS plugin that forwards events to HookBridge.
 *
 * Unlike other connectors that use a CLI hook script called per-event, OpenCode
 * uses an in-process JS plugin that subscribes to the `event` hook and sends
 * normalized events over the Unix socket.
 *
 * Config: ~/.config/opencode/opencode.jsonc (plugin registration)
 * Plugin: ~/.config/opencode/plugins/sharkbay/index.js
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AgentConnector, ConnectorStatus, HookEventKind, UnifiedHookEvent } from "../types.js";

const MANAGED_MARKER = "sharkbay-managed";

const EVENT_MAP: Record<string, HookEventKind> = {
  "session.created": "session_start",
  "session.idle": "turn_end",
  "session.status.busy": "prompt",
  "message.part.updated.tool.running": "tool_start",
  "message.part.updated.tool.completed": "tool_end",
  "message.part.updated.tool.error": "tool_end",
  "permission.updated": "attention",
};

export class OpenCodeConnector implements AgentConnector {
  readonly id = "opencode";
  readonly displayName = "OpenCode";
  readonly supportedEvents: readonly HookEventKind[] = ["session_start", "prompt", "tool_start", "tool_end", "turn_end", "attention"];

  private readonly configDir = path.join(os.homedir(), ".config", "opencode");
  private readonly configPath = path.join(os.homedir(), ".config", "opencode", "opencode.jsonc");
  private readonly pluginDir = path.join(os.homedir(), ".config", "opencode", "plugins", "sharkbay");
  private readonly pluginEntry = path.join(os.homedir(), ".config", "opencode", "plugins", "sharkbay", "index.js");

  async detect(): Promise<boolean> {
    try {
      fs.accessSync(this.configDir);
      return true;
    } catch {
      return false;
    }
  }

  async install(hookCliPath: string): Promise<void> {
    const appDataPath = path.dirname(path.dirname(hookCliPath));
    const socketPathFile = path.join(appDataPath, "hook-socket-path");
    this.writePlugin(socketPathFile);
    this.registerPlugin();
  }

  async uninstall(): Promise<void> {
    this.unregisterPlugin();
    try {
      fs.rmSync(this.pluginDir, { recursive: true, force: true });
    } catch {}
  }

  async status(): Promise<ConnectorStatus> {
    if (!(await this.detect())) return "agent_missing";
    try {
      fs.accessSync(this.pluginEntry);
      const config = this.readConfig();
      const plugins = Array.isArray(config.plugin) ? config.plugin : [];
      const hasManaged = plugins.some(
        (p: unknown) => (typeof p === "string" && p === "./plugins/sharkbay") || (Array.isArray(p) && p[0] === "./plugins/sharkbay"),
      );
      return hasManaged ? "installed" : "not_installed";
    } catch {
      return "not_installed";
    }
  }

  normalize(raw: unknown): UnifiedHookEvent | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    const eventType = typeof r.event_type === "string" ? r.event_type : null;
    if (!eventType) return null;

    const event = EVENT_MAP[eventType];
    if (!event) return null;

    return {
      agent: this.id,
      sessionId: typeof r.session_id === "string" ? r.session_id : "",
      event,
      timestamp: typeof r.timestamp === "string" ? r.timestamp : new Date().toISOString(),
      tool: typeof r.tool_name === "string" ? { name: r.tool_name, input: r.tool_input } : undefined,
      prompt: typeof r.prompt === "string" ? r.prompt : undefined,
      cwd: typeof r.cwd === "string" ? r.cwd : undefined,
    };
  }

  private writePlugin(socketPath: string): void {
    fs.mkdirSync(this.pluginDir, { recursive: true });

    const pluginPackageJson = JSON.stringify(
      { name: "sharkbay-opencode-plugin", version: "1.0.0", type: "module", _managedBy: MANAGED_MARKER },
      null,
      2,
    );
    fs.writeFileSync(path.join(this.pluginDir, "package.json"), pluginPackageJson + "\n", "utf8");

    const pluginScript = generatePluginScript(socketPath);
    const tmp = this.pluginEntry + ".tmp";
    fs.writeFileSync(tmp, pluginScript, "utf8");
    fs.renameSync(tmp, this.pluginEntry);
  }

  private registerPlugin(): void {
    const config = this.readConfig();
    if (!Array.isArray(config.plugin)) config.plugin = [];
    const plugins = config.plugin as unknown[];
    const alreadyRegistered = plugins.some(
      (p) => (typeof p === "string" && p === "./plugins/sharkbay") || (Array.isArray(p) && p[0] === "./plugins/sharkbay"),
    );
    if (!alreadyRegistered) {
      plugins.push("./plugins/sharkbay");
    }
    this.writeConfig(config);
  }

  private unregisterPlugin(): void {
    const config = this.readConfig();
    if (!Array.isArray(config.plugin)) return;
    config.plugin = (config.plugin as unknown[]).filter(
      (p) => !(typeof p === "string" && p === "./plugins/sharkbay") && !(Array.isArray(p) && p[0] === "./plugins/sharkbay"),
    );
    if ((config.plugin as unknown[]).length === 0) delete config.plugin;
    this.writeConfig(config);
  }

  private readConfig(): Record<string, unknown> {
    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      return JSON.parse(stripJsoncComments(raw));
    } catch {
      return {};
    }
  }

  private writeConfig(config: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const tmp = this.configPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, this.configPath);
  }
}

function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    if (inString) {
      if (text[i] === "\\" && i + 1 < text.length) {
        result += text[i]! + text[i + 1]!;
        i += 2;
      } else if (text[i] === '"') {
        result += text[i];
        inString = false;
        i++;
      } else {
        result += text[i];
        i++;
      }
    } else if (text[i] === '"') {
      result += text[i];
      inString = true;
      i++;
    } else if (text[i] === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

function generatePluginScript(socketPathFile: string): string {
  return `// SharkBay OpenCode plugin — forwards lifecycle events to HookBridge.
// Auto-generated. Do not edit manually.
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";

const SOCKET_PATH_FILE = ${JSON.stringify(socketPathFile)};

function send(payload) {
  let socketPath;
  try { socketPath = readFileSync(SOCKET_PATH_FILE, "utf8").trim(); } catch { return; }
  if (!socketPath) return;
  const msg = JSON.stringify({ source: "opencode", payload }) + "\\n";
  const conn = createConnection(socketPath, () => { conn.end(msg); });
  conn.on("error", () => {});
  conn.setTimeout(3000, () => conn.destroy());
}

export default async function(input) {
  const cwd = input?.directory || input?.project?.worktree || undefined;

  return {
    async event({ event }) {
      const type = event.type;

      if (type === "session.created") {
        const dir = event.properties?.info?.directory || cwd;
        const model = event.properties?.info?.model?.id || "";
        send({ event_type: "session.created", session_id: event.properties?.info?.id || "", cwd: dir, model, timestamp: new Date().toISOString() });
      } else if (type === "session.status") {
        const status = event.properties?.status;
        if (status?.type === "busy") {
          send({ event_type: "session.status.busy", session_id: event.properties?.sessionID || "", cwd, timestamp: new Date().toISOString() });
        }
      } else if (type === "session.idle") {
        send({ event_type: "session.idle", session_id: event.properties?.sessionID || "", cwd, timestamp: new Date().toISOString() });
      } else if (type === "permission.updated") {
        const perm = event.properties;
        send({ event_type: "permission.updated", session_id: perm?.sessionID || "", cwd, prompt: perm?.title || "", timestamp: new Date().toISOString() });
      } else if (type === "message.part.updated") {
        const part = event.properties?.part;
        if (part?.type === "tool") {
          const state = part.state;
          if (state?.status === "running") {
            send({ event_type: "message.part.updated.tool.running", session_id: part.sessionID || "", cwd, tool_name: part.tool || "", timestamp: new Date().toISOString() });
          } else if (state?.status === "completed" || state?.status === "error") {
            const eventType = state.status === "completed" ? "message.part.updated.tool.completed" : "message.part.updated.tool.error";
            send({ event_type: eventType, session_id: part.sessionID || "", cwd, tool_name: part.tool || "", timestamp: new Date().toISOString() });
          }
        }
      }
    },
  };
}
`;
}
