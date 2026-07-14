import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const maxRequestBytes = 1024 * 1024;

export type ReviewControlMethod = "start" | "status" | "wait" | "cancel" | "complete";

export type ReviewControlRequest = {
  requestId: string;
  method: ReviewControlMethod;
  params: Record<string, unknown>;
};

export type ReviewControlHandler = (request: ReviewControlRequest) => Promise<unknown>;

export class ReviewControlServer {
  readonly clientPath: string;
  readonly socketPathFile: string;
  readonly socketPath: string;
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();

  constructor(private readonly userDataPath: string, private readonly handle: ReviewControlHandler) {
    this.clientPath = path.join(userDataPath, "bin", "sharkbay-review-control");
    this.socketPathFile = path.join(userDataPath, "review-control-socket-path");
    const uid = typeof process.getuid === "function" ? process.getuid() : "user";
    this.socketPath = path.join(os.tmpdir(), `sharkbay-review-${uid}-${randomUUID().slice(0, 8)}.sock`);
  }

  async start(): Promise<void> {
    await this.stop();
    await mkdir(path.dirname(this.clientPath), { recursive: true });
    await writeFile(this.clientPath, reviewControlClientScript(), "utf8");
    await chmod(this.clientPath, 0o755);
    await rm(this.socketPath, { force: true });

    const server = net.createServer((socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.server = server;
    await chmod(this.socketPath, 0o600);
    await writeFile(this.socketPathFile, `${this.socketPath}\n`, "utf8");
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) {
      for (const socket of this.sockets) socket.destroy();
      this.sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await rm(this.socketPath, { force: true });
    const publishedSocketPath = await readFile(this.socketPathFile, "utf8").catch(() => "");
    if (publishedSocketPath.trim() === this.socketPath) await rm(this.socketPathFile, { force: true });
  }

  private accept(socket: net.Socket): void {
    this.sockets.add(socket);
    socket.once("close", () => this.sockets.delete(socket));
    let buffer = "";
    let handled = false;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      if (handled) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > maxRequestBytes) {
        handled = true;
        writeResponse(socket, { ok: false, error: "Review control request is too large" });
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      void this.dispatch(socket, buffer.slice(0, newline));
    });
  }

  private async dispatch(socket: net.Socket, line: string): Promise<void> {
    let requestId: string | null = null;
    try {
      const request = JSON.parse(line) as Partial<ReviewControlRequest>;
      requestId = typeof request.requestId === "string" ? request.requestId : null;
      if (typeof request.requestId !== "string" || !request.requestId || !isReviewControlMethod(request.method) || !request.params || typeof request.params !== "object") {
        throw new Error("Invalid Review control request");
      }
      const result = await this.handle({ requestId: request.requestId, method: request.method, params: request.params as Record<string, unknown> });
      writeResponse(socket, { requestId: request.requestId, ok: true, result });
    } catch (error) {
      writeResponse(socket, { requestId, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

function writeResponse(socket: net.Socket, response: Record<string, unknown>): void {
  socket.end(`${JSON.stringify(response)}\n`);
}

function isReviewControlMethod(value: unknown): value is ReviewControlMethod {
  return value === "start" || value === "status" || value === "wait" || value === "cancel" || value === "complete";
}

export function reviewControlClientScript(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const command = process.argv[2];
const values = {};
const positional = [];
for (let index = 3; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key) continue;
  if (!key.startsWith("--")) { positional.push(key); continue; }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail("Missing value for " + key);
  values[key.slice(2)] = value;
  index += 1;
}
if (!values.run && !values["run-id"] && positional[0]) values.run = positional[0];

const callerTerminalSessionId = process.env.SHARKBAY_TERMINAL_SESSION_ID || "";
let params;
if (command === "start") {
  params = {
    repoPath: required("repo"),
    taskId: required("task-id"),
    agentId: required("agent"),
    parentTerminalSessionId: callerTerminalSessionId,
  };
} else if (command === "complete") {
  params = {
    runId: requiredRun(),
    reportPath: required("report"),
    callerTerminalSessionId,
    completionToken: values["completion-token"] || "",
  };
} else if (command === "status" || command === "cancel") {
  params = { runId: requiredRun(), callerTerminalSessionId };
} else if (command === "wait") {
  params = {
    runId: requiredRun(),
    callerTerminalSessionId,
    timeoutMs: values["timeout-ms"] ? Number(values["timeout-ms"]) : (values.timeout ? Number(values.timeout) * 1000 : undefined),
  };
} else {
  fail("Usage: sharkbay-review-control <start|status|wait|cancel|complete> [options]");
}

const supportDir = path.dirname(path.dirname(__filename));
let socketPath;
try {
  socketPath = fs.readFileSync(path.join(supportDir, "review-control-socket-path"), "utf8").trim();
} catch {
  fail("SharkBay is not running");
}
const socket = net.createConnection(socketPath);
let response = "";
socket.setEncoding("utf8");
const requestId = process.pid + "-" + Date.now();
socket.on("connect", () => socket.write(JSON.stringify({ requestId, method: command, params }) + "\\n"));
socket.on("data", (chunk) => { response += chunk; });
socket.on("error", () => fail("SharkBay is not running"));
socket.on("end", () => {
  try {
    const parsed = JSON.parse(response.trim());
    if (!parsed.ok) fail(parsed.error || "Review control request failed");
    process.stdout.write(JSON.stringify(parsed.result) + "\\n");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
});

function required(name) {
  const value = values[name];
  if (!value) fail("Missing --" + name);
  return value;
}

function requiredRun() {
  const value = values.run || values["run-id"];
  if (!value) fail("Missing --run");
  return value;
}

function fail(message) {
  process.stderr.write("sharkbay review: " + message + "\\n");
  process.exit(1);
}
`;
}
