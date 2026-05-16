import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import * as pty from "node-pty";
import { getConfiguredRoots } from "./config.js";
import { createDefaultSecretStore } from "./secrets.js";
import type { IpcRuntimeLike, RemoteMachine, RemoteMachineInput, RemoteMachineTestResult, TestRemoteMachineInput } from "../shared/types.js";
import type { SecretStore } from "./secrets.js";

const execFileAsync = promisify(execFile);
const sshConnectionTimeoutMs = 8000;

export type SshCommandRunnerOptions = {
  password?: string;
};

export type SshCommandRunner = (args: string[], timeoutMs: number, options?: SshCommandRunnerOptions) => Promise<{ stdout: string; stderr: string }>;

export async function testRemoteMachineConnection(
  runtime: IpcRuntimeLike,
  input: TestRemoteMachineInput,
  runner: SshCommandRunner = runSshCommand,
  secretStore: SecretStore = createDefaultSecretStore(),
): Promise<RemoteMachineTestResult> {
  const machine = await resolveRemoteMachine(runtime, input);
  const password = await resolvePassword(machine, input, secretStore);
  const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
  if (!sshArgs.length) {
    return { ok: false, message: "SSH connection details are required." };
  }
  if (machine.authMode === "password" && !password) {
    return { ok: false, message: "Password is required for this remote machine." };
  }

  try {
    const result = await runner([
      "-o", password ? "BatchMode=no" : "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      ...sshArgs,
      "--",
      "printf",
      "sharkbay-ok",
    ], sshConnectionTimeoutMs, password ? { password } : undefined);
    return result.stdout.trim() === "sharkbay-ok"
      ? { ok: true, message: "Connected." }
      : { ok: false, message: result.stderr.trim() || "Connection test did not return the expected response." };
  } catch (error) {
    return { ok: false, message: formatSshError(error, Boolean(password)) };
  }
}

function formatSshError(error: unknown, usedPassword: boolean): string {
  const stderr = ((error as { stderr?: unknown }).stderr ?? "").toString().trim();
  const stdout = ((error as { stdout?: unknown }).stdout ?? "").toString().trim();
  const detail = stderr || stdout || (error instanceof Error ? error.message : String(error));
  const lower = detail.toLowerCase();
  if (usedPassword && (lower.includes("permission denied") || lower.includes("authentication failed"))) {
    return `${detail}\n\nHint: macOS disables password SSH by default. On the target machine open System Settings → General → Sharing → Remote Login, enable it, and set "Allow remote users to connect using" to include password. Also check that your account is in the allowed users list.`;
  }
  if (lower.includes("connection refused")) {
    return `${detail}\n\nHint: sshd is not running or the port is wrong. On macOS enable Remote Login in System Settings → General → Sharing.`;
  }
  if (lower.includes("operation timed out") || lower.includes("connection timed out")) {
    return `${detail}\n\nHint: host unreachable. Check the IP/port and that both machines are on the same network.`;
  }
  if (lower.includes("host key verification failed")) {
    return `${detail}\n\nHint: run \`ssh-keygen -R <host>\` in Terminal, or connect once via Terminal to accept the host key.`;
  }
  return detail;
}

async function resolveRemoteMachine(runtime: IpcRuntimeLike, input: TestRemoteMachineInput): Promise<RemoteMachine> {
  if ("id" in input) {
    const id = input.id.trim();
    const config = await getConfiguredRoots(runtime);
    const machine = config.configuredRemoteMachines.find((item) => item.id === id);
    if (!machine) {
      throw new Error("Remote machine not found.");
    }
    return machine;
  }

  const label = input.label.trim();
  const authMode = input.password && input.authMode === "ssh-agent" ? "password" : input.authMode ?? "system-ssh-config";
  const sshConfigHost = input.sshConfigHost?.trim() ?? "";
  const host = input.host?.trim() || sshConfigHost;
  return {
    id: sshConfigHost || host,
    label,
    host,
    port: input.port && input.port > 0 ? input.port : 22,
    username: input.username?.trim() || undefined,
    sshConfigHost: sshConfigHost || undefined,
    authMode,
    keyPath: input.keyPath?.trim() || undefined,
    passwordSecretId: authMode === "password" ? `remote-machine:${sshConfigHost || host}:password` : undefined,
    hasPassword: authMode === "password" ? Boolean(input.password) : undefined,
    defaultProjectPath: input.defaultProjectPath?.trim() || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function sshArgsForRemoteMachine(machine: RemoteMachine, usePassword = false): string[] {
  if (machine.authMode === "system-ssh-config") {
    return machine.sshConfigHost ? [machine.sshConfigHost] : [];
  }

  const args: string[] = [];
  if (machine.authMode === "key-file" && machine.keyPath) {
    args.push("-i", machine.keyPath);
  }
  if (usePassword) {
    args.push(
      "-o", "PreferredAuthentications=password,keyboard-interactive",
      "-o", "PubkeyAuthentication=no",
      "-o", "NumberOfPasswordPrompts=1",
    );
  }
  if (machine.port && machine.port !== 22) {
    args.push("-p", String(machine.port));
  }
  const host = machine.host.trim();
  if (!host) return [];
  args.push(machine.username ? `${machine.username}@${host}` : host);
  return args;
}

async function resolvePassword(machine: RemoteMachine, input: TestRemoteMachineInput, secretStore: SecretStore): Promise<string | undefined> {
  if (machine.authMode !== "password") return undefined;
  if (!("id" in input) && input.password) return input.password;
  if (!machine.passwordSecretId) return undefined;
  return (await secretStore.get(machine.passwordSecretId)) ?? undefined;
}

export async function runSshCommand(args: string[], timeoutMs: number, options: SshCommandRunnerOptions = {}): Promise<{ stdout: string; stderr: string }> {
  if (options.password) {
    return runSshCommandViaPty(args, options.password, timeoutMs);
  }
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (result: { stdout: string; stderr: string } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      settle(Object.assign(new Error("ssh command timed out"), { stdout, stderr, code: -1 }));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => settle(Object.assign(error, { stdout, stderr })));
    child.on("exit", (code, signal) => {
      if (code === 0) {
        settle({ stdout, stderr });
        return;
      }
      const message = stderr.trim() || stdout.trim() || `ssh exited with code ${code ?? "null"}${signal ? ` (signal ${signal})` : ""}`;
      settle(Object.assign(new Error(message), { code: code ?? -1, signal, stdout, stderr }));
    });
  });
}

async function runSshCommandViaPty(args: string[], password: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = pty.spawn("ssh", args, {
      cols: 200,
      rows: 24,
      name: "xterm-256color",
      env: { ...process.env, TERM: "xterm-256color" },
    });

    let authBuffer = "";
    let commandOutput = "";
    let phase: "auth" | "command" = "auth";
    let acceptedHostKey = false;
    let sentPassword = false;
    let settled = false;

    const settle = (result: { stdout: string; stderr: string } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch { /* ignore */ }
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      settle(Object.assign(new Error(`ssh password connect timed out after ${timeoutMs}ms`), { code: -1, stdout: commandOutput, stderr: stripAnsi(authBuffer) }));
    }, timeoutMs);

    child.onData((data) => {
      if (phase === "auth") {
        authBuffer += data;
        if (!acceptedHostKey && /are you sure you want to continue connecting/i.test(authBuffer)) {
          acceptedHostKey = true;
          child.write("yes\r");
          return;
        }
        if (!sentPassword && /password:\s*$/i.test(stripAnsi(authBuffer).trimEnd())) {
          sentPassword = true;
          child.write(`${password}\r`);
          phase = "command";
          return;
        }
        return;
      }
      commandOutput += data;
    });

    child.onExit(({ exitCode, signal }) => {
      const cleaned = stripAnsi(commandOutput).replace(/^[\r\n]+/, "").replace(/\r\n/g, "\n");
      const authText = stripAnsi(authBuffer);
      if (exitCode === 0) {
        settle({ stdout: cleaned, stderr: "" });
        return;
      }
      const combined = `${authText}\n${cleaned}`.toLowerCase();
      const summary = combined.includes("permission denied") ? "Permission denied (password rejected)"
        : combined.includes("connection refused") ? "Connection refused"
        : combined.includes("connection timed out") ? "Connection timed out"
        : combined.includes("host key verification failed") ? "Host key verification failed"
        : (cleaned.trim() || authText.trim().split("\n").slice(-3).join("\n") || `ssh exited with code ${exitCode ?? "null"}${signal ? ` (signal ${signal})` : ""}`);
      settle(Object.assign(new Error(summary), { code: exitCode ?? -1, signal, stdout: cleaned, stderr: authText }));
    });
  });
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\r(?!\n)/g, "");
}

export function quoteForRemoteShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function remoteShellCommand(script: string): string {
  return `sh -c ${quoteForRemoteShell(script)}`;
}

export async function createAskPassScript(): Promise<{ dir: string; scriptPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-askpass-"));
  const scriptPath = path.join(dir, "askpass.sh");
  await fs.writeFile(scriptPath, "#!/bin/sh\nprintf '%s' \"$SHARKBAY_SSH_PASSWORD\"\n", { mode: 0o700 });
  await fs.chmod(scriptPath, 0o700);
  return { dir, scriptPath };
}
