/**
 * HookBridge — Unix socket server that receives hook events from the sharkbay-hook CLI.
 *
 * Socket path: /tmp/sharkbay-hooks-<uid>-<instanceToken>.sock
 * Protocol: newline-delimited JSON, short-connection (one message per connect).
 * Wire format: { "source": "<agent-id>", "payload": <raw-agent-json> }
 */

import { randomBytes } from "node:crypto";
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
  private readonly instanceToken: string;

  constructor(options: HookBridgeOptions = {}) {
    super();
    this.socketDir = options.socketDir ?? "/tmp";
    this.uid = options.uid ?? process.getuid?.() ?? 0;
    this.instanceToken = randomBytes(4).toString("hex");
    this.socketPathFile = options.socketPathFile ?? "";
  }

  get path(): string {
    return this.socketPath;
  }

  async start(appDataPath: string): Promise<void> {
    this.socketPath = path.join(this.socketDir, `sharkbay-hooks-${this.uid}-${this.instanceToken}.sock`);
    if (!this.socketPathFile) {
      this.socketPathFile = path.join(appDataPath, "hook-socket-path");
    }

    this.deployHookCli(appDataPath);
    await this.cleanStaleSocket();

    this.server = net.createServer((conn) => this.handleConnection(conn));
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.socketPath, () => resolve());
      this.server!.once("error", reject);
    });

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
    const hookCliPath = path.join(binDir, "sharkbay-hook");
    fs.mkdirSync(binDir, { recursive: true });
    const script = `#!/usr/bin/env node
const fs = require("fs");
const net = require("net");
const path = require("path");
const os = require("os");
const SOCKET_PATH_FILE = path.join(os.homedir(), "Library", "Application Support", "SharkBay", "hook-socket-path");
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
  const msg = JSON.stringify({ source, payload: parsed }) + "\\n";
  const conn = net.createConnection(socketPath, () => { conn.end(msg, () => process.exit(0)); });
  conn.on("error", () => process.exit(0));
  conn.setTimeout(3000, () => { conn.destroy(); process.exit(0); });
});
setTimeout(() => process.exit(0), 5000).unref();
`;
    fs.writeFileSync(hookCliPath, script, { mode: 0o755 });
  }

  private async cleanStaleSocket(): Promise<void> {
    try {
      fs.statSync(this.socketPath);
    } catch {
      return; // no existing socket
    }
    // Attempt connect to check liveness
    const alive = await new Promise<boolean>((resolve) => {
      const client = net.createConnection(this.socketPath, () => {
        client.destroy();
        resolve(true);
      });
      client.once("error", () => resolve(false));
    });
    if (!alive) {
      try { fs.unlinkSync(this.socketPath); } catch {}
    }
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
