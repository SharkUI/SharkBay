import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getConfiguredRoots } from "./config.js";
import { parseProjectUri } from "../core/project-uri.js";
import { quoteForRemoteShell, runSshCommand, sshArgsForRemoteMachine, type SshCommandRunner } from "./remote-machines.js";
import { createDefaultSecretStore, type SecretStore } from "./secrets.js";
import type { AgentCli, AgentProjectStatusEvent, IpcRuntimeLike, RemoteMachine } from "../shared/types.js";

const execFileAsync = promisify(execFile);

export type AgentSessionState = {
  agentId: string;
  buffer: string;
  cwd: string | null;
  ignored: boolean;
  offset: number;
  sessionId: string | null;
};

type AgentCliDefinition = {
  id: string;
  label: string;
  commands: string[];
  shortLabel: string;
};

type CodexSessionMeta = {
  id?: unknown;
  cwd?: unknown;
  originator?: unknown;
};

type AgentLogFile = {
  agentId: string;
  filePath: string;
};

type AgentSessionWatcherEvents = {
  status: [AgentProjectStatusEvent];
};

const defaultPollIntervalMs = 1000;
const discoveredFileGraceMs = 5000;
const maxStatusLength = 180;

const agentCliDefinitions: AgentCliDefinition[] = [
  { id: "codex", label: "Codex CLI", commands: ["codex"], shortLabel: "Cx" },
  { id: "claude", label: "Claude Code", commands: ["claude"], shortLabel: "Cl" },
  { id: "gemini", label: "Gemini CLI", commands: ["gemini"], shortLabel: "G" },
  { id: "kiro", label: "Kiro CLI", commands: ["kiro-cli"], shortLabel: "K" },
  { id: "deepseek", label: "DeepSeek TUI", commands: ["deepseek"], shortLabel: "D" },
  { id: "qwen", label: "Qwen Code", commands: ["qwen", "qwen-code", "qianwen"], shortLabel: "Q" },
  { id: "opencode", label: "OpenCode", commands: ["opencode"], shortLabel: "O" },
];

const fallbackCommandDirectories = [
  ".local/bin",
  ".bun/bin",
  ".nvm/current/bin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

export async function listAvailableAgentClis(): Promise<AgentCli[]> {
  const results = await Promise.all(agentCliDefinitions.map((definition) => resolveAgentCli(definition)));
  return results.filter((result): result is AgentCli => Boolean(result));
}

export async function listAgentClisForUri(
  runtime: IpcRuntimeLike,
  cwdUri: string | undefined,
  options: {
    secretStore?: SecretStore;
    runner?: SshCommandRunner;
  } = {},
): Promise<AgentCli[]> {
  if (!cwdUri || !cwdUri.startsWith("ssh://")) {
    return listAvailableAgentClis();
  }
  try {
    const parsed = parseProjectUri(cwdUri);
    if (parsed.kind !== "ssh") return listAvailableAgentClis();
    const config = await getConfiguredRoots(runtime);
    const machine = config.configuredRemoteMachines.find((item) => item.id === parsed.machineId);
    if (!machine) return [];
    return await detectRemoteAgentClis(machine, {
      secretStore: options.secretStore ?? createDefaultSecretStore(),
      runner: options.runner ?? runSshCommand,
    });
  } catch {
    return [];
  }
}

export async function detectRemoteAgentClis(
  machine: RemoteMachine,
  options: {
    secretStore: SecretStore;
    runner: SshCommandRunner;
    timeoutMs?: number;
  },
): Promise<AgentCli[]> {
  const password = machine.authMode === "password" && machine.passwordSecretId
    ? (await options.secretStore.get(machine.passwordSecretId)) ?? null
    : null;
  const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
  if (!sshArgs.length) return [];

  const commands = agentCliDefinitions.flatMap((definition) => definition.commands);
  if (!commands.length) return [];
  const probeScript = commands
    .map((command) => `printf '%s\\t%s\\n' ${shellQuote(command)} "$(command -v ${shellQuote(command)} 2>/dev/null || true)"`)
    .join("; ");

  const runnerArgs = [
    "-o", password ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    ...sshArgs,
    "--",
    `sh -l -c ${quoteForRemoteShell(probeScript)}`,
  ];

  let result: { stdout: string; stderr: string };
  try {
    result = await options.runner(runnerArgs, options.timeoutMs ?? 8000, password ? { password } : undefined);
  } catch {
    return [];
  }

  const foundPaths = new Map<string, string>();
  for (const line of result.stdout.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const [command, ...rest] = line.split("\t");
    const remotePath = rest.join("\t").trim();
    if (command && remotePath) foundPaths.set(command, remotePath);
  }

  const detected: AgentCli[] = [];
  for (const definition of agentCliDefinitions) {
    for (const command of definition.commands) {
      const remotePath = foundPaths.get(command);
      if (remotePath) {
        detected.push({
          id: definition.id,
          label: definition.label,
          command,
          executablePath: remotePath,
          shortLabel: definition.shortLabel,
        });
        break;
      }
    }
  }
  return detected;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export class AgentSessionWatcher extends EventEmitter<AgentSessionWatcherEvents> {
  private readonly codexSessionsRoot: string;
  private readonly claudeProjectsRoot: string;
  private readonly pollIntervalMs: number;
  private readonly startedAt: number;
  private readonly files = new Map<string, AgentSessionState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;

  constructor(options: {
    codexSessionsRoot?: string;
    claudeProjectsRoot?: string;
    pollIntervalMs?: number;
    startedAt?: number;
  } = {}) {
    super();
    this.codexSessionsRoot = options.codexSessionsRoot ?? path.join(os.homedir(), ".codex", "sessions");
    this.claudeProjectsRoot = options.claudeProjectsRoot ?? path.join(os.homedir(), ".claude", "projects");
    this.pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;
    this.startedAt = options.startedAt ?? Date.now();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.scan(), this.pollIntervalMs);
    this.timer.unref?.();
    void this.scan();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const [codexFiles, claudeFiles] = await Promise.all([
        recentCodexSessionFiles(this.codexSessionsRoot, new Date()),
        claudeTranscriptFiles(this.claudeProjectsRoot),
      ]);
      await Promise.all([...codexFiles, ...claudeFiles].map((file) => this.readNewContent(file)));
    } finally {
      this.scanning = false;
    }
  }

  private async readNewContent(file: AgentLogFile): Promise<void> {
    let stat;
    try {
      stat = await fs.stat(file.filePath);
    } catch {
      return;
    }
    if (!stat.isFile()) return;

    const key = `${file.agentId}:${file.filePath}`;
    let state = this.files.get(key);
    if (!state) {
      const existingBeforeWatcher = stat.mtimeMs < this.startedAt - discoveredFileGraceMs;
      state = {
        agentId: file.agentId,
        buffer: "",
        cwd: null,
        ignored: false,
        offset: existingBeforeWatcher ? stat.size : 0,
        sessionId: null,
      };
      this.files.set(key, state);
      if (existingBeforeWatcher) return;
    }

    if (stat.size < state.offset) {
      state.offset = 0;
      state.buffer = "";
      state.cwd = null;
      state.ignored = false;
      state.sessionId = null;
    }
    if (stat.size === state.offset || state.ignored) return;

    const handle = await fs.open(file.filePath, "r");
    try {
      const length = stat.size - state.offset;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, state.offset);
      state.offset = stat.size;
      this.processChunk(state, buffer.toString("utf8"));
    } finally {
      await handle.close();
    }
  }

  private processChunk(state: AgentSessionState, chunk: string): void {
    const text = `${state.buffer}${chunk}`;
    const lines = text.split(/\r?\n/);
    state.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const status = statusFromJsonLine(line, state);
      if (status && state.cwd) {
        this.emit("status", {
          agentId: state.agentId,
          projectPath: state.cwd,
          sessionId: state.sessionId,
          text: status,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}

export function codexStatusFromJsonLine(line: string, state: AgentSessionState): string | null {
  const record = parseJsonObject(line);
  if (!record) return null;

  const type = readString(record, "type");
  const payload = readObject(record, "payload");

  if (type === "session_meta") {
    const meta = payload as CodexSessionMeta | null;
    if (meta?.originator !== "codex-tui" || typeof meta.cwd !== "string") {
      state.ignored = true;
      return null;
    }
    state.cwd = meta.cwd;
    state.sessionId = typeof meta.id === "string" ? meta.id : null;
    return null;
  }

  if (!state.cwd || state.ignored) return null;

  if (type === "event_msg" && payload) {
    const payloadType = readString(payload, "type");
    if (payloadType === "agent_message") {
      return oneLineStatus(readString(payload, "message"));
    }
    if (payloadType === "task_complete") {
      return oneLineStatus(readString(payload, "last_agent_message"));
    }
  }

  if (type === "response_item" && payload) {
    const payloadType = readString(payload, "type");
    if (payloadType === "message" && readString(payload, "role") === "assistant") {
      return oneLineStatus(outputTextFromContent(readUnknown(payload, "content")));
    }
    if (payloadType === "function_call") {
      const name = readString(payload, "name");
      return name ? `Codex: ${name}` : null;
    }
  }

  return null;
}

export function claudeStatusFromJsonLine(line: string, state: AgentSessionState): string | null {
  const record = parseJsonObject(line);
  if (!record) return null;

  const cwd = readString(record, "cwd");
  if (cwd && readString(record, "entrypoint") === "cli") {
    state.cwd = cwd;
    state.sessionId = readString(record, "sessionId");
  }

  if (!state.cwd || state.ignored || readString(record, "type") !== "assistant") return null;

  const message = readObject(record, "message");
  const content = readUnknown(message ?? record, "content");
  const toolName = toolUseNameFromContent(content);
  if (toolName) return `Claude: ${toolName}`;
  return oneLineStatus(outputTextFromContent(content));
}

function statusFromJsonLine(line: string, state: AgentSessionState): string | null {
  if (state.agentId === "codex") return codexStatusFromJsonLine(line, state);
  if (state.agentId === "claude") return claudeStatusFromJsonLine(line, state);
  return null;
}

async function resolveAgentCli(definition: AgentCliDefinition): Promise<AgentCli | null> {
  for (const command of definition.commands) {
    const executablePath = await resolveCommandPath(command);
    if (executablePath) {
      return {
        id: definition.id,
        label: definition.label,
        command,
        executablePath,
        shortLabel: definition.shortLabel,
      };
    }
  }
  return null;
}

export async function resolveCommandPath(
  command: string,
  fallbackDirectories = fallbackCommandDirectories,
  homeDirectory = os.homedir()
): Promise<string | null> {
  if (!/^[\w.-]+$/u.test(command)) return null;
  try {
    const result = await execFileAsync("/bin/zsh", ["-lc", `command -v ${command}`], { timeout: 3000 });
    const firstPath = result.stdout.trim().split(/\r?\n/u)[0] ?? null;
    if (firstPath) return firstPath;
  } catch {
    // Finder-launched macOS apps often start with a sparse PATH. Fall through to
    // common install locations used by local developer CLIs.
  }

  for (const directory of fallbackDirectories) {
    const executablePath = directory.startsWith("/")
      ? path.join(directory, command)
      : path.join(homeDirectory, directory, command);
    if (await isExecutableFile(executablePath)) {
      return executablePath;
    }
  }
  return null;
}

async function isExecutableFile(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function recentCodexSessionFiles(root: string, now: Date): Promise<AgentLogFile[]> {
  const days = [now, new Date(now.getTime() - 24 * 60 * 60 * 1000)];
  const directories = days.map((date) =>
    path.join(root, String(date.getFullYear()), twoDigit(date.getMonth() + 1), twoDigit(date.getDate()))
  );
  const files = await Promise.all(directories.map((directory) => rolloutFiles(directory)));
  return files.flat().map((filePath) => ({ agentId: "codex", filePath }));
}

async function rolloutFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /^rollout-.+\.jsonl$/u.test(entry.name))
    .map((entry) => path.join(directory, entry.name));
}

async function claudeTranscriptFiles(root: string): Promise<AgentLogFile[]> {
  let directories;
  try {
    directories = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = await Promise.all(
    directories
      .filter((entry) => entry.isDirectory())
      .map((entry) => jsonlFiles(path.join(root, entry.name)))
  );
  return files.flat().map((filePath) => ({ agentId: "claude", filePath }));
}

async function jsonlFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => path.join(directory, entry.name));
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let record: unknown;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return null;
  }
  return record && typeof record === "object" && !Array.isArray(record) ? record as Record<string, unknown> : null;
}

function outputTextFromContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return readString(item, "text");
    })
    .filter((text): text is string => Boolean(text));
  return parts.join(" ");
}

function toolUseNameFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (readString(item, "type") === "tool_use") return readString(item, "name");
  }
  return null;
}

function oneLineStatus(value: string | null, maxLength = maxStatusLength): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function readObject(value: object | null, key: string): Record<string, unknown> | null {
  if (!value) return null;
  const next = (value as Record<string, unknown>)[key];
  return next && typeof next === "object" && !Array.isArray(next) ? next as Record<string, unknown> : null;
}

function readString(value: object | null, key: string): string | null {
  if (!value) return null;
  const next = (value as Record<string, unknown>)[key];
  return typeof next === "string" ? next : null;
}

function readUnknown(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

function twoDigit(value: number): string {
  return String(value).padStart(2, "0");
}
