#!/usr/bin/env node
/**
 * sharkbay-hook — lightweight CLI invoked by agent hooks.
 *
 * Reads JSON payload from stdin, forwards it to the SharkBay HookBridge via Unix socket.
 * Exits 0 unconditionally (fail-open).
 *
 * Usage: sharkbay-hook --source <agent-id>
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

const SOCKET_PATH_FILE = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "SharkBay",
  "hook-socket-path",
);

function getSource(): string {
  const idx = process.argv.indexOf("--source");
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1]! : "unknown";
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
    // Timeout: if stdin doesn't close in 5s, proceed with what we have
    setTimeout(() => resolve(data), 5000).unref();
  });
}

function getSocketPath(): string | null {
  try {
    return fs.readFileSync(SOCKET_PATH_FILE, "utf8").trim();
  } catch {
    return null;
  }
}

function send(socketPath: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const conn = net.createConnection(socketPath, () => {
      conn.end(message + "\n", () => resolve());
    });
    conn.on("error", () => resolve());
    conn.setTimeout(3000, () => { conn.destroy(); resolve(); });
  });
}

async function main(): Promise<void> {
  const source = getSource();
  const payload = await readStdin();
  if (!payload.trim()) process.exit(0);

  const socketPath = getSocketPath();
  if (!socketPath) process.exit(0);

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    process.exit(0);
  }

  const message = JSON.stringify({ source, payload: parsed });
  await send(socketPath, message);
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
