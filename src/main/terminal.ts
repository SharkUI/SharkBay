import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import * as pty from "node-pty";
import { getConfiguredRoots } from "./config.js";
import { resolveRepoPath } from "./path-safety.js";
import type {
  IpcRuntimeLike,
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
const staleSubmittedCommandMs = 2000;
const interactiveForegroundProcesses = new Set(["btop", "claude", "codex", "htop", "top"]);

type CwdInspector = (pid: number) => Promise<string | null>;

type TerminalRecord = TerminalSession & {
  pty: pty.IPty;
  projectRoot: string;
  currentCwd: string;
  foregroundProcess: string | null;
  activeCommandLine: string | null;
  pendingInputLine: string;
  commandSubmittedAt: number | null;
  foregroundCommandObserved: boolean;
  inspectTimer: ReturnType<typeof setInterval> | null;
  inspecting: boolean;
};

export type TerminalManagerOptions = {
  inspectIntervalMs?: number;
  inspectProcessCwd?: CwdInspector;
  now?: () => number;
};

export type TerminalTitleInput = {
  projectRoot: string;
  currentCwd: string;
  shell: string;
  foregroundProcess?: string | null;
  activeCommandLine?: string | null;
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

  constructor(options: TerminalManagerOptions = {}) {
    super();
    this.inspectIntervalMs = options.inspectIntervalMs ?? defaultTerminalInspectIntervalMs;
    this.inspectProcessCwd = options.inspectProcessCwd ?? resolveProcessCwd;
    this.now = options.now ?? Date.now;
  }

  async create(runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession> {
    const cwd = await resolveTerminalCwd(runtime, input.cwd);
    const shell = preferredShell();
    const id = `term-${Date.now().toString(36)}-${++this.sequence}`;
    const command = terminalCommand(shell);
    const ptyProcess = pty.spawn(command.file, command.args, {
      cwd,
      cols: input.cols ?? 80,
      rows: input.rows ?? 24,
      name: "xterm-256color",
      env: {
        ...process.env,
        TERM: process.env.TERM || "xterm-256color",
        COLORTERM: process.env.COLORTERM || "truecolor",
        ...terminalShellEnvironment,
      },
    });
    const foregroundProcess = safeForegroundProcess(ptyProcess);
    const session: TerminalRecord = {
      id,
      cwd,
      title: terminalDisplayTitle({
        projectRoot: cwd,
        currentCwd: cwd,
        shell,
        foregroundProcess,
        activeCommandLine: null,
        serviceLabel: input.service?.label,
      }),
      shell,
      pid: ptyProcess.pid ?? null,
      status: "running",
      createdAt: new Date().toISOString(),
      service: input.service,
      pty: ptyProcess,
      projectRoot: cwd,
      currentCwd: cwd,
      foregroundProcess,
      activeCommandLine: null,
      pendingInputLine: "",
      commandSubmittedAt: null,
      foregroundCommandObserved: false,
      inspectTimer: null,
      inspecting: false,
    };

    this.sessions.set(id, session);
    ptyProcess.onData((data) => {
      this.emit("data", { sessionId: id, data, stream: "stdout" });
    });
    ptyProcess.onExit(({ exitCode, signal }) => {
      session.status = "exited";
      this.stopTitleInspection(session);
      this.emit("exit", { sessionId: id, exitCode, signal: signal === undefined ? null : String(signal) });
    });
    this.startTitleInspection(session);
    const initialCommand = normalizeTerminalCommandLine(input.initialCommand);
    if (initialCommand) {
      session.activeCommandLine = initialCommand;
      session.commandSubmittedAt = this.now();
      session.foregroundCommandObserved = false;
      ptyProcess.write(`${input.service ? serviceCommandLine(initialCommand) : initialCommand}\r`);
    }

    return publicSession(session);
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
    session.commandSubmittedAt = this.now();
    session.foregroundCommandObserved = false;
  }

  private async refreshTitle(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "running" || session.inspecting) {
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
        session.commandSubmittedAt = null;
        session.foregroundCommandObserved = false;
      } else if (
        session.commandSubmittedAt !== null &&
        this.now() - session.commandSubmittedAt > staleSubmittedCommandMs
      ) {
        session.activeCommandLine = null;
        session.commandSubmittedAt = null;
      }

      const nextTitle = terminalDisplayTitle({
        projectRoot: session.projectRoot,
        currentCwd: session.currentCwd,
        shell: session.shell,
        foregroundProcess: session.foregroundProcess,
        activeCommandLine: session.activeCommandLine,
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

export async function resolveTerminalCwd(runtime: IpcRuntimeLike, cwd: string): Promise<string> {
  if (!cwd?.trim()) {
    throw new Error("Terminal cwd is required");
  }
  const config = await getConfiguredRoots(runtime);
  const safeRepo = await resolveRepoPath(cwd, config.configuredRoots);
  return safeRepo.repoPath;
}

export function terminalCommand(shell: string): { file: string; args: string[] } {
  return { file: shell, args: ["-l"] };
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
    cwd: session.cwd,
    title: session.title,
    shell: session.shell,
    pid: session.pid,
    status: session.status,
    createdAt: session.createdAt,
    service: session.service,
  };
}
