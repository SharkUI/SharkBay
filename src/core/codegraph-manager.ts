import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { CODEGRAPH_PLUGIN_ID } from "../plugins/bundled/codegraph-detector.js";
import type { CodeGraphProjectStatus } from "../shared/types.js";
import { resolveCommandPath } from "../main/command-path.js";
import { parseProjectUri } from "./project-uri.js";

const execFileAsync = promisify(execFile);

type CommandRunner = (command: string, args: string[], options: { cwd: string; timeout: number }) => Promise<{ stdout: string; stderr: string }>;
type CommandResolver = (command: string) => Promise<string | null>;

type CodeGraphStatusJson = {
  initialized?: boolean;
  fileCount?: number;
  nodeCount?: number;
  edgeCount?: number;
  dbSizeBytes?: number;
  backend?: string;
  journalMode?: string;
  pendingChanges?: {
    added?: number;
    modified?: number;
    removed?: number;
  };
};

const defaultRunner: CommandRunner = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeout,
    maxBuffer: 1024 * 1024,
    env: buildCodeGraphCommandEnv(command),
  });
  return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
};

export function buildCodeGraphCommandEnv(command: string, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (!path.isAbsolute(command)) return baseEnv;
  const commandDirectory = path.dirname(command);
  const currentPath = baseEnv.PATH ?? "";
  const pathParts = currentPath.split(":").filter(Boolean);
  const nextPath = pathParts.includes(commandDirectory)
    ? currentPath
    : [commandDirectory, ...pathParts].join(":");
  return { ...baseEnv, PATH: nextPath };
}

export class CodeGraphManager {
  private readonly activeStatusJobs = new Map<string, Promise<CodeGraphProjectStatus>>();

  constructor(
    private readonly resolveCommand: CommandResolver = resolveCommandPath,
    private readonly runCommand: CommandRunner = defaultRunner,
  ) {}

  readProjectStatus(projectUri: string, enabled: boolean): Promise<CodeGraphProjectStatus> {
    return this.runStatusJob("read", projectUri, enabled);
  }

  ensureProjectStatus(projectUri: string, enabled: boolean): Promise<CodeGraphProjectStatus> {
    return this.runStatusJob("ensure", projectUri, enabled);
  }

  private runStatusJob(mode: "read" | "ensure", projectUri: string, enabled: boolean): Promise<CodeGraphProjectStatus> {
    const jobKey = `${mode}:${enabled ? "enabled" : "disabled"}:${projectUri}`;
    const existing = this.activeStatusJobs.get(jobKey);
    if (existing) return existing;
    const job = this.readProjectStatusOnce(projectUri, enabled, mode).finally(() => {
      this.activeStatusJobs.delete(jobKey);
    });
    this.activeStatusJobs.set(jobKey, job);
    return job;
  }

  async removeProjectIndexes(projectUris: string[]): Promise<void> {
    const codegraphPath = await this.resolveCommand("codegraph");
    await Promise.all(projectUris.map((projectUri) => this.removeProjectIndex(projectUri, codegraphPath)));
  }

  private async readProjectStatusOnce(projectUri: string, enabled: boolean, mode: "read" | "ensure"): Promise<CodeGraphProjectStatus> {
    if (!enabled) return status(projectUri, "disabled", "CodeGraph disabled");

    const parsed = parseProjectUri(projectUri);
    if (parsed.kind !== "local") {
      return status(projectUri, "unsupported", "CodeGraph is available for local projects only");
    }

    const codegraphPath = await this.resolveCommand("codegraph");
    if (!codegraphPath) return status(projectUri, "not-installed", "CodeGraph CLI not installed");

    try {
      let current = await this.readStatusJson(codegraphPath, parsed.path);
      if (!current.initialized) {
        if (mode === "read") {
          return status(projectUri, "uninitialized", "CodeGraph not initialized");
        }
        await this.runCommand(codegraphPath, ["init", "-i", parsed.path], { cwd: parsed.path, timeout: 120_000 });
        await ensureGitExcludeEntry(parsed.path, ".codegraph").catch(() => {});
        current = await this.readStatusJson(codegraphPath, parsed.path);
      }
      if (current.initialized && pendingChangeCount(current) > 0) {
        if (mode === "read") {
          return indexedStatus(projectUri, current);
        }
        await this.runCommand(codegraphPath, ["sync", "-q", parsed.path], { cwd: parsed.path, timeout: 120_000 });
        current = await this.readStatusJson(codegraphPath, parsed.path);
      }

      if (!current.initialized) {
        return status(projectUri, "error", "CodeGraph index was not initialized");
      }

      return indexedStatus(projectUri, current);
    } catch (error) {
      return status(projectUri, "error", `CodeGraph error: ${commandErrorMessage(error)}`);
    }
  }

  private async readStatusJson(codegraphPath: string, projectPath: string): Promise<CodeGraphStatusJson> {
    const result = await this.runCommand(codegraphPath, ["status", "--json", projectPath], { cwd: projectPath, timeout: 20_000 });
    const parsed = JSON.parse(result.stdout) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as CodeGraphStatusJson : {};
  }

  private async removeProjectIndex(projectUri: string, codegraphPath: string | null): Promise<void> {
    const parsed = parseProjectUri(projectUri);
    if (parsed.kind !== "local") return;
    if (codegraphPath) {
      try {
        await this.runCommand(codegraphPath, ["uninit", "-f", parsed.path], { cwd: parsed.path, timeout: 60_000 });
      } catch {
        // Fall through to direct cleanup so disabling the extension still removes local state.
        await fs.rm(path.join(parsed.path, ".codegraph"), { recursive: true, force: true });
      }
    } else {
      await fs.rm(path.join(parsed.path, ".codegraph"), { recursive: true, force: true });
    }
    await removeGitExcludeEntry(parsed.path, ".codegraph").catch(() => {});
  }
}

function commandErrorMessage(error: unknown): string {
  const maybeWithStreams = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const stderr = typeof maybeWithStreams.stderr === "string" ? maybeWithStreams.stderr.trim() : "";
  if (stderr) return stderr;
  const stdout = typeof maybeWithStreams.stdout === "string" ? maybeWithStreams.stdout.trim() : "";
  if (stdout) return stdout;
  return error instanceof Error ? error.message : String(error);
}

export function isCodeGraphPlugin(pluginId: string): boolean {
  return pluginId === CODEGRAPH_PLUGIN_ID;
}

function pendingChangeCount(statusJson: CodeGraphStatusJson): number {
  const pending = statusJson.pendingChanges;
  return (pending?.added ?? 0) + (pending?.modified ?? 0) + (pending?.removed ?? 0);
}

function indexedSummary(statusJson: CodeGraphStatusJson): string {
  const fileCount = statusJson.fileCount ?? 0;
  const nodeCount = statusJson.nodeCount ?? 0;
  const edgeCount = statusJson.edgeCount ?? 0;
  const pendingChanges = pendingChangeCount(statusJson);
  const pendingText = pendingChanges > 0 ? `; ${pendingChanges.toLocaleString()} pending ${pendingChanges === 1 ? "change" : "changes"}` : "";
  return `Indexed ${fileCount.toLocaleString()} files, ${nodeCount.toLocaleString()} nodes, ${edgeCount.toLocaleString()} edges${pendingText}`;
}

function indexedStatus(projectUri: string, statusJson: CodeGraphStatusJson): CodeGraphProjectStatus {
  const pendingChanges = pendingChangeCount(statusJson);
  return status(projectUri, pendingChanges > 0 ? "stale" : "indexed", indexedSummary(statusJson), {
    files: statusJson.fileCount ?? 0,
    nodes: statusJson.nodeCount ?? 0,
    edges: statusJson.edgeCount ?? 0,
    pendingChanges,
    dbSizeBytes: statusJson.dbSizeBytes,
    backend: statusJson.backend,
    journalMode: statusJson.journalMode,
  });
}

function status(
  projectUri: string,
  state: CodeGraphProjectStatus["state"],
  summary: string,
  stats?: CodeGraphProjectStatus["stats"],
): CodeGraphProjectStatus {
  return {
    projectUri,
    state,
    summary,
    updatedAt: new Date().toISOString(),
    ...(stats ? { stats } : {}),
  };
}

export async function ensureGitExcludeEntry(projectPath: string, entry: string): Promise<void> {
  const excludePath = path.join(projectPath, ".git", "info", "exclude");
  try {
    const content = await fs.readFile(excludePath, "utf-8");
    const lines = content.split("\n");
    if (lines.some((line) => line.trim() === entry || line.trim() === `${entry}/`)) return;
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    await fs.writeFile(excludePath, `${content}${separator}${entry}\n`, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.mkdir(path.join(projectPath, ".git", "info"), { recursive: true });
      await fs.writeFile(excludePath, `${entry}\n`, "utf-8");
      return;
    }
    throw error;
  }
}

export async function removeGitExcludeEntry(projectPath: string, entry: string): Promise<void> {
  const excludePath = path.join(projectPath, ".git", "info", "exclude");
  try {
    const content = await fs.readFile(excludePath, "utf-8");
    const lines = content.split("\n");
    const filtered = lines.filter((line) => line.trim() !== entry && line.trim() !== `${entry}/`);
    if (filtered.length === lines.length) return;
    await fs.writeFile(excludePath, filtered.join("\n"), "utf-8");
  } catch {
    // exclude file doesn't exist — nothing to remove
  }
}
