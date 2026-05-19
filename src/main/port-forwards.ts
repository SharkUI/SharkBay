import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import net from "node:net";
import { getConfiguredRoots } from "./config.js";
import { createAskPassScript, remoteShellCommand, runSshCommand, sshArgsForRemoteMachine, type SshCommandRunner } from "./remote-machines.js";
import { createDefaultSecretStore, type SecretStore } from "./secrets.js";
import type {
  CreatePortForwardInput,
  DetectRemotePortsInput,
  IpcRuntimeLike,
  PortForwardEvent,
  RemoteDetectedPort,
  RemoteMachine,
  RemotePortForward,
  RemovePortForwardInput,
} from "../shared/types.js";

type PortForwardEvents = {
  update: [PortForwardEvent];
};

type ManagedForward = RemotePortForward & {
  child: ChildProcess | null;
  cleanup: (() => Promise<void>) | null;
};

export class PortForwardManager extends EventEmitter<PortForwardEvents> {
  private forwards = new Map<string, ManagedForward>();
  private sequence = 0;
  private readonly secretStore: SecretStore;
  private readonly runner: SshCommandRunner;

  constructor(options: { secretStore?: SecretStore; runner?: SshCommandRunner } = {}) {
    super();
    this.secretStore = options.secretStore ?? createDefaultSecretStore();
    this.runner = options.runner ?? runSshCommand;
  }

  list(machineId?: string): RemotePortForward[] {
    return [...this.forwards.values()]
      .filter((forward) => !machineId || forward.machineId === machineId)
      .map(publicForward);
  }

  async create(runtime: IpcRuntimeLike, input: CreatePortForwardInput): Promise<RemotePortForward> {
    const machineId = input.machineId.trim();
    const remotePort = sanitizePort(input.remotePort, "Remote port");
    const remoteHost = input.remoteHost?.trim() || "127.0.0.1";
    const localPort = input.localPort === undefined
      ? await findAvailableLocalPort(remotePort)
      : sanitizePort(input.localPort, "Local port");

    if (this.findActive(machineId, localPort, remotePort, remoteHost)) {
      throw new Error("This port forward is already running");
    }

    const config = await getConfiguredRoots(runtime);
    const machine = config.configuredRemoteMachines.find((item) => item.id === machineId);
    if (!machine) {
      throw new Error(`Remote machine "${machineId}" is not configured`);
    }

    const id = `forward-${Date.now().toString(36)}-${++this.sequence}`;
    const forward: ManagedForward = {
      id,
      machineId,
      remoteHost,
      remotePort,
      localPort,
      status: "starting",
      error: null,
      pid: null,
      createdAt: new Date().toISOString(),
      child: null,
      cleanup: null,
    };
    this.forwards.set(id, forward);
    this.emit("update", { forward: publicForward(forward) });

    try {
      await this.spawnForward(forward, machine);
    } catch (error) {
      forward.status = "error";
      forward.error = error instanceof Error ? error.message : String(error);
      this.emit("update", { forward: publicForward(forward) });
      throw error;
    }

    return publicForward(forward);
  }

  async detect(runtime: IpcRuntimeLike, input: DetectRemotePortsInput): Promise<RemoteDetectedPort[]> {
    const machineId = input.machineId.trim();
    const config = await getConfiguredRoots(runtime);
    const machine = config.configuredRemoteMachines.find((item) => item.id === machineId);
    if (!machine) {
      throw new Error(`Remote machine "${machineId}" is not configured`);
    }

    const password = machine.authMode === "password" && machine.passwordSecretId
      ? (await this.secretStore.get(machine.passwordSecretId)) ?? null
      : null;
    const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
    if (!sshArgs.length) {
      throw new Error("Remote machine SSH connection details are incomplete");
    }

    const result = await this.runner([
      "-o", password ? "BatchMode=no" : "BatchMode=yes",
      "-o", "ConnectTimeout=5",
      ...sshArgs,
      "--",
      remoteShellCommand(remotePortDetectionScript()),
    ], 8000, password ? { password } : undefined);

    const activeForwards = this.list(machineId);
    return parseDetectedPorts(machineId, result.stdout)
      .map((port) => annotateDetectedPort(port, activeForwards));
  }

  async remove(input: RemovePortForwardInput): Promise<void> {
    const forward = this.forwards.get(input.id);
    if (!forward) return;
    await this.terminate(forward);
    this.forwards.delete(input.id);
    this.emit("update", { forward: { ...publicForward(forward), status: "stopped" } });
  }

  async closeAll(): Promise<void> {
    const forwards = [...this.forwards.values()];
    this.forwards.clear();
    await Promise.all(forwards.map((forward) => this.terminate(forward)));
  }

  private findActive(machineId: string, localPort: number, remotePort: number, remoteHost: string): ManagedForward | undefined {
    return [...this.forwards.values()].find(
      (forward) =>
        forward.machineId === machineId &&
        forward.localPort === localPort &&
        forward.remotePort === remotePort &&
        forward.remoteHost === remoteHost &&
        (forward.status === "running" || forward.status === "starting"),
    );
  }

  private async spawnForward(forward: ManagedForward, machine: RemoteMachine): Promise<void> {
    const password = machine.authMode === "password" && machine.passwordSecretId
      ? (await this.secretStore.get(machine.passwordSecretId)) ?? null
      : null;
    const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
    if (!sshArgs.length) {
      throw new Error("Remote machine SSH connection details are incomplete");
    }

    const args = [
      "-N",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-o", password ? "BatchMode=no" : "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      "-L", `${forward.localPort}:${forward.remoteHost}:${forward.remotePort}`,
      ...sshArgs,
    ];

    let env: NodeJS.ProcessEnv = process.env;
    if (password) {
      const askPass = await createAskPassScript();
      env = {
        ...process.env,
        DISPLAY: process.env.DISPLAY || "sharkbay",
        SSH_ASKPASS: askPass.scriptPath,
        SSH_ASKPASS_REQUIRE: "force",
        SHARKBAY_SSH_PASSWORD: password,
      };
      forward.cleanup = () => fs.rm(askPass.dir, { recursive: true, force: true });
    }

    const child = spawn("ssh", args, { env, stdio: ["ignore", "pipe", "pipe"], detached: false });
    forward.child = child;
    forward.pid = child.pid ?? null;

    const stderrChunks: string[] = [];
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stderrChunks.push(text);
      while (stderrChunks.join("").length > 2000) stderrChunks.shift();
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onError = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) {
          this.handleExit(forward, code, signal, stderrChunks.join(""));
          return;
        }
        settled = true;
        const message = stderrChunks.join("").trim() || `ssh exited with code ${code ?? "null"}${signal ? ` (${signal})` : ""}`;
        reject(new Error(message));
      };
      child.once("error", onError);
      child.once("exit", onExit);

      setTimeout(() => {
        if (settled || child.exitCode !== null) return;
        settled = true;
        forward.status = "running";
        forward.error = null;
        this.emit("update", { forward: publicForward(forward) });
        child.removeListener("exit", onExit);
        child.on("exit", (code, signal) => this.handleExit(forward, code, signal, stderrChunks.join("")));
        resolve();
      }, 600);
    });
  }

  private handleExit(forward: ManagedForward, code: number | null, signal: NodeJS.Signals | null, stderr: string): void {
    if (!this.forwards.has(forward.id)) return;
    forward.status = "stopped";
    const message = stderr.trim();
    forward.error = message || (code !== 0 || signal ? `ssh exited unexpectedly${signal ? ` (${signal})` : ` (code ${code ?? "null"})`}` : null);
    forward.child = null;
    forward.pid = null;
    this.emit("update", { forward: publicForward(forward) });
    void this.runCleanup(forward);
  }

  private async terminate(forward: ManagedForward): Promise<void> {
    if (forward.child && !forward.child.killed) {
      forward.child.kill("SIGTERM");
    }
    forward.child = null;
    forward.pid = null;
    await this.runCleanup(forward);
  }

  private async runCleanup(forward: ManagedForward): Promise<void> {
    if (!forward.cleanup) return;
    const fn = forward.cleanup;
    forward.cleanup = null;
    try { await fn(); } catch { /* ignore cleanup failure */ }
  }
}

function publicForward(forward: ManagedForward): RemotePortForward {
  return {
    id: forward.id,
    machineId: forward.machineId,
    remoteHost: forward.remoteHost,
    remotePort: forward.remotePort,
    localPort: forward.localPort,
    status: forward.status,
    error: forward.error,
    pid: forward.pid,
    createdAt: forward.createdAt,
  };
}

function sanitizePort(value: unknown, label: string): number {
  const port = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return port;
}

function remotePortDetectionScript(): string {
  return [
    "if command -v ss >/dev/null 2>&1; then",
    "  ss -H -ltnp 2>/dev/null && exit 0",
    "fi",
    "if command -v lsof >/dev/null 2>&1; then",
    "  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null && exit 0",
    "fi",
    "if command -v netstat >/dev/null 2>&1; then",
    "  netstat -ltnp 2>/dev/null && exit 0",
    "fi",
    "exit 0",
  ].join("\n");
}

function parseDetectedPorts(machineId: string, stdout: string): RemoteDetectedPort[] {
  const ports = new Map<string, RemoteDetectedPort>();
  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || /^COMMAND\s+PID\s+/i.test(line) || /^Proto\s+/i.test(line)) continue;
    const parsed = parseSsLine(line) ?? parseLsofLine(line) ?? parseNetstatLine(line);
    if (!parsed || isIgnoredRemotePort(parsed.port)) continue;
    const remoteHost = normalizeRemoteHost(parsed.host);
    const key = `${remoteHost}:${parsed.port}`;
    const existing = ports.get(key);
    if (existing && existing.processName) continue;
    ports.set(key, {
      machineId,
      remoteHost,
      remotePort: parsed.port,
      processName: parsed.processName,
      pid: parsed.pid,
      source: "process",
      label: labelForPort(parsed.port, parsed.processName),
      protocol: protocolForPort(parsed.port),
      forwarded: false,
    });
  }
  return [...ports.values()].sort((a, b) => a.remotePort - b.remotePort || a.remoteHost.localeCompare(b.remoteHost));
}

function parseSsLine(line: string): { host: string; port: number; processName: string | null; pid: number | null } | null {
  const parts = line.split(/\s+/u);
  const address = parts.find((part) => parseAddressPort(part));
  const parsed = address ? parseAddressPort(address) : null;
  if (!parsed) return null;
  const processMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/u);
  return {
    host: parsed.host,
    port: parsed.port,
    processName: processMatch?.[1] ?? null,
    pid: processMatch?.[2] ? Number.parseInt(processMatch[2], 10) : null,
  };
}

function parseLsofLine(line: string): { host: string; port: number; processName: string | null; pid: number | null } | null {
  if (!/\(LISTEN\)/iu.test(line)) return null;
  const parts = line.split(/\s+/u);
  const address = [...parts].reverse().find((part) => parseAddressPort(part));
  const parsed = address ? parseAddressPort(address) : null;
  if (!parsed) return null;
  return {
    host: parsed.host,
    port: parsed.port,
    processName: parts[0] ?? null,
    pid: parts[1] ? Number.parseInt(parts[1], 10) || null : null,
  };
}

function parseNetstatLine(line: string): { host: string; port: number; processName: string | null; pid: number | null } | null {
  if (!/\bLISTEN\b/iu.test(line)) return null;
  const parts = line.split(/\s+/u);
  const address = parts.find((part) => parseAddressPort(part));
  const parsed = address ? parseAddressPort(address) : null;
  if (!parsed) return null;
  const pidProgram = parts.find((part) => /^\d+\//u.test(part));
  const [pidText, processName] = pidProgram?.split("/", 2) ?? [];
  return {
    host: parsed.host,
    port: parsed.port,
    processName: processName || null,
    pid: pidText ? Number.parseInt(pidText, 10) || null : null,
  };
}

function parseAddressPort(value: string): { host: string; port: number } | null {
  const bracketed = value.match(/^\[([^\]]+)\]:(\d+)$/u);
  if (bracketed) {
    const port = Number.parseInt(bracketed[2] ?? "", 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host: bracketed[1] || "::", port };
  }
  const match = value.match(/^(.*):(\d+)$/u);
  if (!match) return null;
  const port = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: match[1] || "0.0.0.0", port };
}

function normalizeRemoteHost(host: string): string {
  const normalized = host.replace(/^\[|\]$/gu, "");
  if (!normalized || normalized === "*" || normalized === "::" || normalized === "0.0.0.0") return "127.0.0.1";
  if (normalized === "localhost") return "127.0.0.1";
  return normalized;
}

function isIgnoredRemotePort(port: number): boolean {
  return port === 22;
}

function annotateDetectedPort(port: RemoteDetectedPort, forwards: RemotePortForward[]): RemoteDetectedPort {
  const forward = forwards.find((item) =>
    item.remotePort === port.remotePort &&
    item.machineId === port.machineId &&
    (item.remoteHost === port.remoteHost || item.remoteHost === "127.0.0.1") &&
    (item.status === "running" || item.status === "starting"),
  );
  if (!forward) return port;
  return {
    ...port,
    forwarded: true,
    forwardId: forward.id,
    localPort: forward.localPort,
    status: forward.status,
  };
}

function labelForPort(port: number, processName: string | null): string {
  const lower = processName?.toLowerCase();
  if (port === 3000 || port === 5173 || lower?.includes("vite")) return "Web app";
  if (port === 5432 || lower?.includes("postgres")) return "PostgreSQL";
  if (port === 3306 || lower?.includes("mysql")) return "MySQL";
  if (port === 6379 || lower?.includes("redis")) return "Redis";
  if (port === 27017 || lower?.includes("mongo")) return "MongoDB";
  if (port === 8888 || lower?.includes("jupyter")) return "Jupyter";
  return processName ? processName : `Port ${port}`;
}

function protocolForPort(port: number): "http" | "https" | null {
  if (port === 443 || port === 8443) return "https";
  if ([80, 3000, 4173, 5173, 8000, 8080, 8888].includes(port)) return "http";
  return null;
}

async function findAvailableLocalPort(preferredPort: number): Promise<number> {
  if (await isLocalPortAvailable(preferredPort)) return preferredPort;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Could not allocate a local port"));
      });
    });
  });
}

function isLocalPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}
