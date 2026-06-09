import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveCommandPath } from "./command-path.js";
import type { AgentCli, AgentProjectStatusEvent, IpcRuntimeLike } from "../shared/types.js";
import type { TokenUsageCollector } from "./token-usage-collector.js";

export { prependPathDirectories, resolveCommandPath, resolveCommandSearchPaths } from "./command-path.js";

export type AgentSessionState = {
  agentId: string;
  buffer: string;
  cwd: string | null;
  ignored: boolean;
  offset: number;
  lineByteOffset: number;
  sessionId: string | null;
  filePath: string;
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
const defaultDiscoveryIntervalMs = 5000;
const discoveredFileGraceMs = 5000;
const maxStatusLength = 180;

const agentCliDefinitions: AgentCliDefinition[] = [
  { id: "codex", label: "Codex CLI", commands: ["codex"], shortLabel: "Cx" },
  { id: "claude", label: "Claude Code", commands: ["claude"], shortLabel: "Cl" },
  { id: "gemini", label: "Gemini CLI", commands: ["gemini"], shortLabel: "G" },
  { id: "kiro", label: "Kiro CLI", commands: ["kiro-cli"], shortLabel: "K" },
  { id: "codewhale", label: "CodeWhale", commands: ["codewhale"], shortLabel: "D" },
  { id: "qwen", label: "Qwen Code", commands: ["qwen", "qwen-code", "qianwen"], shortLabel: "Q" },
  { id: "opencode", label: "OpenCode", commands: ["opencode"], shortLabel: "O" },
];

export async function listAvailableAgentClis(): Promise<AgentCli[]> {
  const results = await Promise.all(agentCliDefinitions.map((definition) => resolveAgentCli(definition)));
  return results.filter((result): result is AgentCli => Boolean(result));
}

export async function listAgentClisForUri(
  _runtime: IpcRuntimeLike,
  _cwdUri: string | undefined,
): Promise<AgentCli[]> {
  return listAvailableAgentClis();
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export class AgentSessionWatcher extends EventEmitter<AgentSessionWatcherEvents> {
  private readonly codexSessionsRoot: string;
  private readonly claudeProjectsRoot: string;
  private readonly pollIntervalMs: number;
  private readonly discoveryIntervalMs: number;
  private readonly startedAt: number;
  private readonly files = new Map<string, AgentSessionState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;
  private usageCollector: TokenUsageCollector | null = null;
  private discoveredFiles: AgentLogFile[] = [];
  private lastDiscoveryAt = 0;

  constructor(options: {
    codexSessionsRoot?: string;
    claudeProjectsRoot?: string;
    pollIntervalMs?: number;
    discoveryIntervalMs?: number;
    startedAt?: number;
  } = {}) {
    super();
    this.codexSessionsRoot = options.codexSessionsRoot ?? path.join(os.homedir(), ".codex", "sessions");
    this.claudeProjectsRoot = options.claudeProjectsRoot ?? path.join(os.homedir(), ".claude", "projects");
    this.pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;
    this.discoveryIntervalMs = options.discoveryIntervalMs ?? defaultDiscoveryIntervalMs;
    this.startedAt = options.startedAt ?? Date.now();
  }

  setUsageCollector(collector: TokenUsageCollector): void {
    this.usageCollector = collector;
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
      const files = await this.discoverFiles();
      await Promise.all(files.map((file) => this.readNewContent(file)));
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Enumerate transcript files, but cache the result and refresh only every
   * discoveryIntervalMs. This avoids re-reading every Claude project directory
   * on each 1s poll while still polling known files' content every tick
   * (issue #15). New session files are picked up within one discovery interval.
   */
  private async discoverFiles(now = Date.now()): Promise<AgentLogFile[]> {
    if (!shouldRefreshDiscovery(this.lastDiscoveryAt, now, this.discoveryIntervalMs, this.discoveredFiles.length > 0)) {
      return this.discoveredFiles;
    }
    const [codexFiles, claudeFiles] = await Promise.all([
      recentCodexSessionFiles(this.codexSessionsRoot, new Date(now)),
      claudeTranscriptFiles(this.claudeProjectsRoot),
    ]);
    this.discoveredFiles = [...codexFiles, ...claudeFiles];
    this.lastDiscoveryAt = now;
    return this.discoveredFiles;
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
        lineByteOffset: existingBeforeWatcher ? stat.size : 0,
        sessionId: null,
        filePath: file.filePath,
      };
      this.files.set(key, state);
      if (existingBeforeWatcher) return;
    }

    if (stat.size < state.offset) {
      state.offset = 0;
      state.lineByteOffset = 0;
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
      const lineOffset = state.lineByteOffset;
      state.lineByteOffset += Buffer.byteLength(line, "utf8") + 1;

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

      if (this.usageCollector) {
        this.usageCollector.processLine(line, state.filePath, lineOffset, {
          agentId: state.agentId,
          sessionId: state.sessionId,
          projectPath: state.cwd,
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

/**
 * Decide whether the watcher should re-enumerate transcript directories. Cached
 * results are reused until the discovery interval elapses, so the 1s content
 * poll does not re-readdir every Claude project directory each tick (issue #15).
 * Pure for unit testing.
 */
export function shouldRefreshDiscovery(
  lastDiscoveryAt: number,
  now: number,
  intervalMs: number,
  hasCached: boolean,
): boolean {
  if (!hasCached) return true;
  return now - lastDiscoveryAt >= intervalMs;
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
