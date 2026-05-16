import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import { getConfiguredRoots } from "./config.js";
import { createAskPassScript, sshArgsForRemoteMachine } from "./remote-machines.js";
import { createDefaultSecretStore, type SecretStore } from "./secrets.js";
import type {
  CreatePortForwardInput,
  IpcRuntimeLike,
  PortForwardEvent,
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

  constructor(options: { secretStore?: SecretStore } = {}) {
    super();
    this.secretStore = options.secretStore ?? createDefaultSecretStore();
  }

  list(machineId?: string): RemotePortForward[] {
    return [...this.forwards.values()]
      .filter((forward) => !machineId || forward.machineId === machineId)
      .map(publicForward);
  }

  async create(runtime: IpcRuntimeLike, input: CreatePortForwardInput): Promise<RemotePortForward> {
    const machineId = input.machineId.trim();
    const remotePort = sanitizePort(input.remotePort, "Remote port");
    const localPort = sanitizePort(input.localPort, "Local port");
    const remoteHost = input.remoteHost?.trim() || "127.0.0.1";

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
