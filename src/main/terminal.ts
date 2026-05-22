import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import * as pty from "node-pty";
import { getConfiguredRoots } from "./config.js";
import { parseProjectUri } from "../core/project-uri.js";
import { resolveProjectUri } from "./path-safety.js";
import { createAskPassScript, sshArgsForRemoteMachine } from "./remote-machines.js";
import { createDefaultSecretStore, type SecretStore } from "./secrets.js";
import { prepareTeamworkAgentLaunch, TEAMWORK_BOOTSTRAP_PROMPT } from "./teamwork-harness.js";
import type {
  IpcRuntimeLike,
  RemoteMachine,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent,
} from "../shared/types.js";

const execFileAsync = promisify(execFile);
const defaultTerminalInspectIntervalMs = 1000;
const initialCommandQuietDelayMs = 150;
const initialCommandMaxDelayMs = 900;
const staleSubmittedCommandMs = 2000;
const delayedBootstrapWriteMs = 2000;
const interactiveForegroundProcesses = new Set(["btop", "claude", "codex", "deepseek", "htop", "top"]);

type CwdInspector = (pid: number) => Promise<string | null>;

type TerminalRecord = TerminalSession & {
  pty: pty.IPty;
  cwd: string;
  projectRoot: string;
  currentCwd: string;
  foregroundProcess: string | null;
  activeCommandLine: string | null;
  activeCommandTitle: string | null;
  pendingInputLine: string;
  commandSubmittedAt: number | null;
  foregroundCommandObserved: boolean;
  inspectTimer: ReturnType<typeof setInterval> | null;
  inspecting: boolean;
  isRemote: boolean;
  cleanup: (() => Promise<void>) | null;
};

export type TerminalManagerOptions = {
  inspectIntervalMs?: number;
  inspectProcessCwd?: CwdInspector;
  now?: () => number;
  secretStore?: SecretStore;
};

export type TerminalTitleInput = {
  projectRoot: string;
  currentCwd: string;
  shell: string;
  foregroundProcess?: string | null;
  activeCommandLine?: string | null;
  activeCommandTitle?: string | null;
  serviceLabel?: string | null;
};

export const terminalShellEnvironment = {
  SHELL_SESSIONS_DISABLE: "1",
  TERM_PROGRAM: "SharkBay",
} as const;

export type TerminalManagerEvents = {
  data: [TerminalDataEvent];
  update: [TerminalUpdateEvent];
  exit: [TerminalExitEvent];
};

export class TerminalManager extends EventEmitter<TerminalManagerEvents> {
  private sessions = new Map<string, TerminalRecord>();
  private sequence = 0;
  private inspectIntervalMs: number;
  private inspectProcessCwd: CwdInspector;
  private now: () => number;
  private secretStore: SecretStore;

  constructor(options: TerminalManagerOptions = {}) {
    super();
    this.inspectIntervalMs = options.inspectIntervalMs ?? defaultTerminalInspectIntervalMs;
    this.inspectProcessCwd = options.inspectProcessCwd ?? resolveProcessCwd;
    this.now = options.now ?? Date.now;
    this.secretStore = options.secretStore ?? createDefaultSecretStore();
  }

  async create(runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession> {
    const spec = await this.resolveLaunchSpec(runtime, input.cwdUri);
    let initialCommand = normalizeTerminalCommandLine(input.initialCommand);
    const initialCommandTitle = initialCommand ? normalizeTerminalCommandLine(input.initialCommandTitle) : null;
    let delayedBootstrapPrompt: string | null = null;
    if (!spec.isRemote && input.agentId && initialCommand && !input.service) {
      const launch = await prepareTeamworkAgentLaunch(spec.projectRoot, input.agentId, initialCommand);
      if (launch.injected && input.agentId === "deepseek" && launch.initialCommand === initialCommand) {
        delayedBootstrapPrompt = TEAMWORK_BOOTSTRAP_PROMPT;
      }
      initialCommand = launch.initialCommand;
    }
    const shellInitialCommand = !spec.isRemote && !input.service ? initialCommand : null;
    const command = !spec.isRemote && input.service && initialCommand
      ? serviceTerminalCommand(spec.shell, initialCommand)
      : shellInitialCommand
        ? initialCommandTerminalCommand(spec.shell, shellInitialCommand)
      : spec.command;
    const id = `term-${Date.now().toString(36)}-${++this.sequence}`;
    const ptyProcess = pty.spawn(command.file, command.args, {
      cwd: spec.cwd,
      cols: input.cols ?? 80,
      rows: input.rows ?? 24,
      name: "xterm-256color",
      env: spec.env,
    });
    const foregroundProcess = safeForegroundProcess(ptyProcess);
    const initialTitle = spec.isRemote
      ? remoteTerminalDisplayTitle(spec.projectRoot, input.service?.label, initialCommandTitle)
      : terminalDisplayTitle({
          projectRoot: spec.projectRoot,
          currentCwd: spec.projectRoot,
          shell: spec.shell,
          foregroundProcess,
          activeCommandLine: initialCommand,
          activeCommandTitle: initialCommandTitle,
          serviceLabel: input.service?.label,
        });
    const session: TerminalRecord = {
      id,
      cwdUri: spec.cwdUri,
      title: initialTitle,
      shell: spec.shell,
      pid: ptyProcess.pid ?? null,
      status: "running",
      createdAt: new Date().toISOString(),
      service: input.service,
      pty: ptyProcess,
      cwd: spec.cwd,
      projectRoot: spec.projectRoot,
      currentCwd: spec.projectRoot,
      foregroundProcess,
      activeCommandLine: initialCommand,
      activeCommandTitle: initialCommandTitle,
      pendingInputLine: "",
      commandSubmittedAt: initialCommand ? this.now() : null,
      foregroundCommandObserved: false,
      inspectTimer: null,
      inspecting: false,
      isRemote: spec.isRemote,
      cleanup: spec.cleanup ?? null,
    };

    this.sessions.set(id, session);
    const initialCommandLine = initialCommand && !shellInitialCommand && (!input.service || spec.isRemote)
      ? input.service ? serviceCommandLine(initialCommand) : initialCommand
      : null;
    let pendingInitialCommand = initialCommandLine;
    let pendingInitialCommandQuietTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingInitialCommandDeadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPendingInitialCommandTimers = () => {
      if (pendingInitialCommandQuietTimer) {
        clearTimeout(pendingInitialCommandQuietTimer);
        pendingInitialCommandQuietTimer = null;
      }
      if (pendingInitialCommandDeadlineTimer) {
        clearTimeout(pendingInitialCommandDeadlineTimer);
        pendingInitialCommandDeadlineTimer = null;
      }
    };
    const writePendingInitialCommand = () => {
      const commandLine = pendingInitialCommand;
      pendingInitialCommand = null;
      clearPendingInitialCommandTimers();
      if (!commandLine || session.status !== "running") {
        return;
      }
      ptyProcess.write(`${commandLine}\r`);
    };
    const schedulePendingInitialCommand = () => {
      if (!pendingInitialCommand) {
        return;
      }
      if (pendingInitialCommandQuietTimer) {
        clearTimeout(pendingInitialCommandQuietTimer);
      }
      pendingInitialCommandQuietTimer = setTimeout(writePendingInitialCommand, initialCommandQuietDelayMs);
      pendingInitialCommandQuietTimer.unref?.();
    };

    ptyProcess.onData((data) => {
      this.emit("data", { sessionId: id, data, stream: "stdout" });
      schedulePendingInitialCommand();
    });
    ptyProcess.onExit(({ exitCode, signal }) => {
      pendingInitialCommand = null;
      clearPendingInitialCommandTimers();
      session.status = "exited";
      this.stopTitleInspection(session);
      void this.runCleanup(session);
      this.emit("exit", { sessionId: id, exitCode, signal: signal === undefined ? null : String(signal) });
    });
    if (!spec.isRemote) {
      this.startTitleInspection(session);
    }
    if (pendingInitialCommand) {
      session.foregroundCommandObserved = false;
      schedulePendingInitialCommand();
      pendingInitialCommandDeadlineTimer = setTimeout(writePendingInitialCommand, initialCommandMaxDelayMs);
      pendingInitialCommandDeadlineTimer.unref?.();
    }
    if (delayedBootstrapPrompt) {
      const prompt = delayedBootstrapPrompt;
      const timer = setTimeout(() => {
        if (session.status === "running") {
          ptyProcess.write(`${"\b".repeat(100)}${prompt}`);
        }
      }, delayedBootstrapWriteMs);
      timer.unref?.();
    }

    return publicSession(session);
  }

  private async resolveLaunchSpec(runtime: IpcRuntimeLike, cwdUri: string): Promise<TerminalLaunchSpec> {
    if (!cwdUri?.trim()) {
      throw new Error("Terminal cwd URI is required");
    }
    if (cwdUri.startsWith("ssh://")) {
      return resolveSshLaunchSpec(runtime, cwdUri, this.secretStore);
    }
    const resolved = await resolveTerminalCwd(runtime, cwdUri);
    const shell = preferredShell();
    return {
      cwd: resolved.cwd,
      cwdUri: resolved.cwdUri,
      command: terminalCommand(shell),
      env: {
        ...process.env,
        TERM: process.env.TERM || "xterm-256color",
        COLORTERM: process.env.COLORTERM || "truecolor",
        ...terminalShellEnvironment,
      },
      shell,
      projectRoot: resolved.cwd,
      isRemote: false,
    };
  }

  private async runCleanup(session: TerminalRecord): Promise<void> {
    if (!session.cleanup) return;
    const fn = session.cleanup;
    session.cleanup = null;
    try { await fn(); } catch { /* ignore cleanup failure */ }
  }

  input(input: TerminalInput): TerminalSession {
    const session = this.requireSession(input.sessionId);
    if (session.status !== "running") {
      throw new Error("Terminal session has exited");
    }
    this.recordInput(session, input.data);
    session.pty.write(input.data);
    return publicSession(session);
  }

  resize(input: TerminalResizeInput): TerminalSession {
    const session = this.requireSession(input.sessionId);
    const cols = positiveTerminalDimension(input.cols);
    const rows = positiveTerminalDimension(input.rows);
    if (cols === null || rows === null) {
      return publicSession(session);
    }
    if (session.status === "running") {
      session.pty.resize(cols, rows);
    }
    return publicSession(session);
  }

  close(input: TerminalCloseInput): TerminalSession {
    const session = this.requireSession(input.sessionId);
    this.stopTitleInspection(session);
    if (session.status === "running") {
      session.status = "exited";
      session.pty.kill();
    }
    this.sessions.delete(input.sessionId);
    return publicSession(session);
  }

  list(): TerminalSession[] {
    return [...this.sessions.values()].map(publicSession);
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.close({ sessionId: id });
    }
  }

  private requireSession(sessionId: string): TerminalRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Unknown terminal session");
    }
    return session;
  }

  private startTitleInspection(session: TerminalRecord): void {
    if (this.inspectIntervalMs <= 0) {
      return;
    }
    session.inspectTimer = setInterval(() => {
      void this.refreshTitle(session.id);
    }, this.inspectIntervalMs);
    session.inspectTimer.unref?.();
    void this.refreshTitle(session.id);
  }

  private stopTitleInspection(session: TerminalRecord): void {
    if (!session.inspectTimer) {
      return;
    }
    clearInterval(session.inspectTimer);
    session.inspectTimer = null;
  }

  private recordInput(session: TerminalRecord, data: string): void {
    const next = applyTerminalInputData(session.pendingInputLine, data);
    session.pendingInputLine = next.pendingInputLine;
    if (!next.submittedCommand) {
      return;
    }
    const foregroundProcess = safeForegroundProcess(session.pty);
    if (foregroundProcess) {
      session.foregroundProcess = foregroundProcess;
    }
    if (!isShellForeground(session.foregroundProcess, session.shell)) {
      return;
    }
    session.activeCommandLine = next.submittedCommand;
    session.activeCommandTitle = null;
    session.commandSubmittedAt = this.now();
    session.foregroundCommandObserved = false;
  }

  private async refreshTitle(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "running" || session.inspecting || session.isRemote) {
      return;
    }

    session.inspecting = true;
    try {
      if (session.pid !== null) {
        const currentCwd = await this.inspectProcessCwd(session.pid);
        if (this.sessions.get(sessionId) !== session || session.status !== "running") {
          return;
        }
        if (currentCwd) {
          session.currentCwd = currentCwd;
        }
      }

      const foregroundProcess = safeForegroundProcess(session.pty);
      if (foregroundProcess) {
        session.foregroundProcess = foregroundProcess;
      }

      const shellForeground = isShellForeground(session.foregroundProcess, session.shell);
      if (!shellForeground) {
        session.foregroundCommandObserved = true;
      } else if (session.foregroundCommandObserved) {
        session.activeCommandLine = null;
        session.activeCommandTitle = null;
        session.commandSubmittedAt = null;
        session.foregroundCommandObserved = false;
      } else if (
        session.commandSubmittedAt !== null &&
        this.now() - session.commandSubmittedAt > staleSubmittedCommandMs
      ) {
        session.activeCommandLine = null;
        session.activeCommandTitle = null;
        session.commandSubmittedAt = null;
      }

      const nextTitle = terminalDisplayTitle({
        projectRoot: session.projectRoot,
        currentCwd: session.currentCwd,
        shell: session.shell,
        foregroundProcess: session.foregroundProcess,
        activeCommandLine: session.activeCommandLine,
        activeCommandTitle: session.activeCommandTitle,
        serviceLabel: session.service?.label,
      });
      if (nextTitle !== session.title) {
        session.title = nextTitle;
        this.emit("update", { session: publicSession(session) });
      }
    } finally {
      session.inspecting = false;
    }
  }
}

export async function resolveTerminalCwd(runtime: IpcRuntimeLike, cwdUri: string): Promise<{ cwd: string; cwdUri: string }> {
  if (!cwdUri?.trim()) {
    throw new Error("Terminal cwd URI is required");
  }
  const config = await getConfiguredRoots(runtime);
  const safeRepo = await resolveProjectUri(cwdUri, config.configuredRoots, config.configuredProjects);
  return { cwd: safeRepo.repoPath, cwdUri: safeRepo.projectUri };
}

type TerminalLaunchSpec = {
  cwd: string;
  cwdUri: string;
  command: { file: string; args: string[] };
  env: NodeJS.ProcessEnv;
  shell: string;
  projectRoot: string;
  isRemote: boolean;
  cleanup?: () => Promise<void>;
};

async function resolveSshLaunchSpec(
  runtime: IpcRuntimeLike,
  cwdUri: string,
  secretStore: SecretStore,
): Promise<TerminalLaunchSpec> {
  const parsed = parseProjectUri(cwdUri);
  if (parsed.kind !== "ssh") {
    throw new Error("Terminal cwd URI is not an SSH project URI");
  }
  const config = await getConfiguredRoots(runtime);
  const machine: RemoteMachine | undefined = config.configuredRemoteMachines.find(
    (item) => item.id === parsed.machineId,
  );
  if (!machine) {
    throw new Error(`Remote machine "${parsed.machineId}" is not configured`);
  }

  const password = machine.authMode === "password" && machine.passwordSecretId
    ? (await secretStore.get(machine.passwordSecretId)) ?? null
    : null;
  const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
  if (!sshArgs.length) {
    throw new Error("Remote machine SSH connection details are incomplete");
  }
  const remoteCommand = remoteInteractiveShellCommand(parsed.path);
  const args = buildInteractiveSshArgs(sshArgs, remoteCommand, Boolean(password));

  let env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: process.env.TERM || "xterm-256color",
    COLORTERM: process.env.COLORTERM || "truecolor",
    ...terminalShellEnvironment,
  };
  let cleanup: (() => Promise<void>) | undefined;
  if (password) {
    const askPass = await createAskPassScript();
    env = {
      ...env,
      DISPLAY: process.env.DISPLAY || "sharkbay",
      SSH_ASKPASS: askPass.scriptPath,
      SSH_ASKPASS_REQUIRE: "force",
      SHARKBAY_SSH_PASSWORD: password,
    };
    cleanup = () => fs.rm(askPass.dir, { recursive: true, force: true });
  }

  return {
    cwd: os.homedir(),
    cwdUri,
    command: { file: "ssh", args },
    env,
    shell: "ssh",
    projectRoot: parsed.path,
    isRemote: true,
    cleanup,
  };
}

function remoteTerminalDisplayTitle(remotePath: string, serviceLabel?: string | null, initialCommandTitle?: string | null): string {
  const label = serviceLabel?.trim();
  if (label) return label;
  const commandTitle = normalizeTerminalCommandLine(initialCommandTitle);
  if (commandTitle) return commandTitle;
  return remotePath || "remote";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function remoteInteractiveShellCommand(remotePath: string): string {
  return `cd ${shellQuote(remotePath)} && exec \${SHELL:-/bin/sh} -l`;
}

export function buildInteractiveSshArgs(sshArgs: string[], remoteCommand: string, usePassword = false): string[] {
  return [
    "-tt",
    "-o", usePassword ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    ...sshArgs,
    remoteCommand,
  ];
}

export function terminalCommand(shell: string): { file: string; args: string[] } {
  return { file: shell, args: ["-l"] };
}

function serviceTerminalCommand(shell: string, command: string): { file: string; args: string[] } {
  return { file: shell, args: ["-lc", serviceCommandLine(command)] };
}

function initialCommandTerminalCommand(shell: string, command: string): { file: string; args: string[] } {
  return { file: shell, args: ["-lic", `${command}\nexec ${shellQuote(shell)} -l`] };
}

function positiveTerminalDimension(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const dimension = Math.floor(value);
  return dimension > 0 ? dimension : null;
}

export function terminalDisplayTitle(input: TerminalTitleInput): string {
  const serviceLabel = input.serviceLabel?.trim();
  if (serviceLabel) {
    return serviceLabel;
  }

  const activeCommandTitle = normalizeTerminalCommandLine(input.activeCommandTitle);
  if (activeCommandTitle && normalizeTerminalCommandLine(input.activeCommandLine)) {
    return activeCommandTitle;
  }

  const foregroundProcess = normalizeForegroundProcess(input.foregroundProcess);
  if (foregroundProcess && !isShellForeground(foregroundProcess, input.shell)) {
    if (isInteractiveForegroundProcess(foregroundProcess)) {
      return foregroundProcess;
    }
    return normalizeTerminalCommandLine(input.activeCommandLine) ?? foregroundProcess;
  }
  return relativeTerminalCwd(input.projectRoot, input.currentCwd);
}

export function applyTerminalInputData(
  pendingInputLine: string,
  data: string,
): { pendingInputLine: string; submittedCommand: string | null } {
  let line = pendingInputLine;
  let submittedCommand: string | null = null;

  for (let index = 0; index < data.length;) {
    const char = data[index] ?? "";
    if (char === "\u001b") {
      index = skipEscapeSequence(data, index);
      continue;
    }
    if (char === "\r" || char === "\n") {
      submittedCommand = normalizeTerminalCommandLine(line) ?? submittedCommand;
      line = "";
      index += 1;
      continue;
    }
    if (char === "\u007f" || char === "\b") {
      line = Array.from(line).slice(0, -1).join("");
      index += 1;
      continue;
    }
    if (char === "\u0015") {
      line = "";
      index += 1;
      continue;
    }
    if (char >= " " && char !== "\u007f") {
      line += char;
    }
    index += 1;
  }

  return { pendingInputLine: line, submittedCommand };
}

export async function resolveProcessCwd(pid: number): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  try {
    if (process.platform === "linux") {
      return await fs.realpath(`/proc/${pid}/cwd`);
    }
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { timeout: 1000 });
      const pathLine = stdout.split(/\r?\n/).find((line) => line.startsWith("n"));
      return pathLine ? await fs.realpath(pathLine.slice(1)) : null;
    }
  } catch {
    return null;
  }

  return null;
}

function preferredShell(): string {
  const shell = process.env.SHELL;
  if (shell && path.isAbsolute(shell)) {
    return shell;
  }
  return os.userInfo().shell || "/bin/zsh";
}

function relativeTerminalCwd(projectRoot: string, currentCwd: string): string {
  const root = path.resolve(projectRoot);
  const cwd = path.resolve(currentCwd);
  const relative = path.relative(root, cwd);
  if (!relative) {
    return ".";
  }
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative;
  }

  const home = os.homedir();
  const homeRelative = path.relative(home, cwd);
  if (!homeRelative) {
    return "~";
  }
  if (!homeRelative.startsWith("..") && !path.isAbsolute(homeRelative)) {
    return `~/${homeRelative}`;
  }

  return cwd;
}

function normalizeTerminalCommandLine(command: string | null | undefined): string | null {
  const normalized = command
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function serviceCommandLine(command: string): string {
  return `(${command}); exit $?`;
}

function normalizeForegroundProcess(foregroundProcess: string | null | undefined): string | null {
  const normalized = foregroundProcess?.trim();
  if (!normalized || normalized === "kernel_task") {
    return null;
  }
  return path.basename(normalized).replace(/^-/, "") || normalized;
}

function isShellForeground(foregroundProcess: string | null | undefined, shell: string): boolean {
  const processName = normalizeForegroundProcess(foregroundProcess);
  if (!processName) {
    return true;
  }
  const shellName = path.basename(shell).replace(/^-/, "").toLowerCase();
  return processName.toLowerCase() === shellName || processName.toLowerCase() === "login";
}

function isInteractiveForegroundProcess(foregroundProcess: string): boolean {
  return interactiveForegroundProcesses.has(foregroundProcess.toLowerCase());
}

function safeForegroundProcess(ptyProcess: pty.IPty): string | null {
  try {
    return ptyProcess.process || null;
  } catch {
    return null;
  }
}

function skipEscapeSequence(value: string, startIndex: number): number {
  let index = startIndex + 1;
  if (value[index] === "[") {
    index += 1;
    while (index < value.length) {
      const code = value.charCodeAt(index);
      index += 1;
      if (code >= 0x40 && code <= 0x7e) {
        break;
      }
    }
    return index;
  }
  if (value[index] === "]") {
    index += 1;
    while (index < value.length) {
      if (value[index] === "\u0007") {
        return index + 1;
      }
      if (value[index] === "\u001b" && value[index + 1] === "\\") {
        return index + 2;
      }
      index += 1;
    }
    return value.length;
  }
  return Math.min(value.length, index + 1);
}

function publicSession(session: TerminalRecord | TerminalSession): TerminalSession {
  return {
    id: session.id,
    cwdUri: session.cwdUri,
    title: session.title,
    shell: session.shell,
    pid: session.pid,
    status: session.status,
    createdAt: session.createdAt,
    service: session.service,
  };
}
