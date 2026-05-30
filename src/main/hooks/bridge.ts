/**
 * HookBridge — Unix socket server that receives hook events from the sharkbay-hook CLI.
 *
 * Socket path: /tmp/sharkbay-hooks-<uid>.sock
 * Protocol: newline-delimited JSON, short-connection (one message per connect).
 * Wire format: { "source": "<agent-id>", "payload": <raw-agent-json> }
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";

import type { HookBridgeMessage, UnifiedHookEvent } from "./types.js";

export type HookBridgeEvents = {
  event: [HookBridgeMessage];
  error: [Error];
};

export type HookBridgeOptions = {
  /** Override socket directory (default: /tmp) */
  socketDir?: string;
  /** Override the file where the active socket path is persisted */
  socketPathFile?: string;
  /** Override uid (for testing) */
  uid?: number;
};

export class HookBridge extends EventEmitter<HookBridgeEvents> {
  private server: net.Server | null = null;
  private socketPath: string = "";
  private socketPathFile: string;
  private readonly socketDir: string;
  private readonly uid: number;

  constructor(options: HookBridgeOptions = {}) {
    super();
    this.socketDir = options.socketDir ?? "/tmp";
    this.uid = options.uid ?? process.getuid?.() ?? 0;
    this.socketPathFile = options.socketPathFile ?? "";
  }

  get path(): string {
    return this.socketPath;
  }

  async start(appDataPath: string): Promise<void> {
    if (this.server) return;

    this.socketPath = path.join(this.socketDir, `sharkbay-hooks-${this.uid}.sock`);
    if (!this.socketPathFile) {
      this.socketPathFile = path.join(appDataPath, "hook-socket-path");
    }

    this.deployHookCli(appDataPath);
    await this.cleanStaleSocket();

    const server = net.createServer((conn) => this.handleConnection(conn));
    await new Promise<void>((resolve, reject) => {
      server.listen(this.socketPath, () => resolve());
      server.once("error", reject);
    });
    this.server = server;

    fs.writeFileSync(this.socketPathFile, this.socketPath, "utf8");
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    try { fs.unlinkSync(this.socketPath); } catch {}
    try { fs.unlinkSync(this.socketPathFile); } catch {}
  }

  private deployHookCli(appDataPath: string): void {
    const binDir = path.join(appDataPath, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const socketPathFileLiteral = JSON.stringify(this.socketPathFile);

    // Main hook CLI (stdin-based, for Claude/Codex/Gemini/Kiro/Qwen)
    const hookCliPath = path.join(binDir, "sharkbay-hook");
    const script = `#!/usr/bin/env node
const fs = require("fs");
const net = require("net");
const SOCKET_PATH_FILE = ${socketPathFileLiteral};
const idx = process.argv.indexOf("--source");
const source = idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : "unknown";
let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { data += c; });
process.stdin.on("end", () => {
  if (!data.trim()) process.exit(0);
  let socketPath;
  try { socketPath = fs.readFileSync(SOCKET_PATH_FILE, "utf8").trim(); } catch { process.exit(0); }
  let parsed;
  try { parsed = JSON.parse(data); } catch { process.exit(0); }
  const msg = JSON.stringify({ source, payload: parsed, pid: process.ppid }) + "\\n";
  const conn = net.createConnection(socketPath, () => { conn.end(msg, () => process.exit(0)); });
  conn.on("error", () => process.exit(0));
  conn.setTimeout(3000, () => { conn.destroy(); process.exit(0); });
});
setTimeout(() => process.exit(0), 5000).unref();
`;
    fs.writeFileSync(hookCliPath, script, { mode: 0o755 });

    // CodeWhale hook script (env-var based)
    const codewhaleHookPath = path.join(binDir, "sharkbay-hook-codewhale");
    const codewhaleScript = `#!/usr/bin/env node
const fs = require("fs");
const net = require("net");
const SOCKET_PATH_FILE = ${socketPathFileLiteral};
const eventName = process.argv[2] || process.env.DEEPSEEK_HOOK_EVENT || "";
let data = "";

function env(name) {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function assignIfPresent(target, key, value) {
  if (value !== undefined && target[key] === undefined) target[key] = value;
}

function buildPayload(raw) {
  const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  assignIfPresent(payload, "hook_event", eventName);
  assignIfPresent(payload, "type", payload.hook_event);
  assignIfPresent(payload, "tool_name", env("DEEPSEEK_TOOL_NAME"));
  assignIfPresent(payload, "tool_args", env("DEEPSEEK_TOOL_ARGS"));
  assignIfPresent(payload, "tool_result", env("DEEPSEEK_TOOL_RESULT"));
  assignIfPresent(payload, "tool_exit_code", env("DEEPSEEK_TOOL_EXIT_CODE"));
  assignIfPresent(payload, "tool_success", env("DEEPSEEK_TOOL_SUCCESS"));
  assignIfPresent(payload, "mode", env("DEEPSEEK_MODE"));
  assignIfPresent(payload, "previous_mode", env("DEEPSEEK_PREVIOUS_MODE"));
  assignIfPresent(payload, "session_id", env("DEEPSEEK_SESSION_ID"));
  assignIfPresent(payload, "message", env("DEEPSEEK_MESSAGE"));
  assignIfPresent(payload, "error", env("DEEPSEEK_ERROR"));
  assignIfPresent(payload, "workspace", env("DEEPSEEK_WORKSPACE"));
  assignIfPresent(payload, "cwd", payload.workspace);
  assignIfPresent(payload, "model", env("DEEPSEEK_MODEL"));
  assignIfPresent(payload, "total_tokens", env("DEEPSEEK_TOTAL_TOKENS"));
  assignIfPresent(payload, "session_cost", env("DEEPSEEK_SESSION_COST"));
  return payload;
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { data += c; });
process.stdin.on("end", () => {
  let socketPath;
  try { socketPath = fs.readFileSync(SOCKET_PATH_FILE, "utf8").trim(); } catch { process.exit(0); }
  let raw = {};
  if (data.trim()) {
    try { raw = JSON.parse(data); } catch {}
  }
  const msg = JSON.stringify({ source: "codewhale", payload: buildPayload(raw), pid: process.ppid }) + "\\n";
  const conn = net.createConnection(socketPath, () => { conn.end(msg, () => process.exit(0)); });
  conn.on("error", () => process.exit(0));
  conn.setTimeout(3000, () => { conn.destroy(); process.exit(0); });
});
setTimeout(() => process.exit(0), 5000).unref();
`;
    fs.writeFileSync(codewhaleHookPath, codewhaleScript, { mode: 0o755 });
  }

  private async cleanStaleSocket(): Promise<void> {
    try {
      fs.statSync(this.socketPath);
    } catch {
      return;
    }
    try { fs.unlinkSync(this.socketPath); } catch {}
  }

  private handleConnection(conn: net.Socket): void {
    let data = "";
    conn.on("data", (chunk) => { data += chunk.toString(); });
    conn.on("end", () => {
      conn.destroy();
      const line = data.trim();
      if (!line) return;
      try {
        const msg = JSON.parse(line) as HookBridgeMessage;
        if (typeof msg.source === "string" && msg.payload != null) {
          this.emit("event", msg);
        }
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    });
    conn.on("error", () => conn.destroy());
  }
}
