import { getConfiguredRoots } from "./config.js";
import { parseProjectUri } from "../core/project-uri.js";
import { isEditableProjectFile } from "./project-files.js";
import { remoteShellCommand, runSshCommand, sshArgsForRemoteMachine, type SshCommandRunner } from "./remote-machines.js";
import { createDefaultSecretStore, type SecretStore } from "./secrets.js";
import type {
  IpcRuntimeLike,
  ProjectFileTreeItem,
  ProjectFilesInput,
  ProjectFilesResult,
  ReadFileInput,
  ReadFileResult,
  RemoteMachine,
  WriteFileInput,
  WriteFileResult,
} from "../shared/types.js";

const listTimeoutMs = 8000;
const fileIoTimeoutMs = 15000;
const remoteMaxFileSizeBytes = 5 * 1024 * 1024;

export async function listRemoteProjectFiles(
  runtime: IpcRuntimeLike,
  input: ProjectFilesInput,
  options: { secretStore?: SecretStore; runner?: SshCommandRunner } = {},
): Promise<ProjectFilesResult> {
  try {
    const parsed = parseProjectUri(input.projectUri);
    if (parsed.kind !== "ssh") {
      return { ok: false, reason: "io-error", message: "Project URI is not an SSH project" };
    }
    const config = await getConfiguredRoots(runtime);
    const machine = config.configuredRemoteMachines.find((item) => item.id === parsed.machineId);
    if (!machine) {
      return { ok: false, reason: "io-error", message: `Remote machine "${parsed.machineId}" is not configured` };
    }
    const directoryPath = resolveDirectoryPath(parsed.path, input.directoryPath);
    const items = await listRemoteDirectory(machine, directoryPath, {
      secretStore: options.secretStore ?? createDefaultSecretStore(),
      runner: options.runner ?? runSshCommand,
    });
    const relativeBase = directoryPath === parsed.path ? "" : trimLeading(directoryPath.slice(parsed.path.length), "/");
    const files = items.map((entry) => buildFileTreeItem(entry, relativeBase));
    return { ok: true, projectUri: input.projectUri, files: sortFiles(files) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = message.includes("unsafe") || message.includes("outside")
      ? "unsafe-path"
      : "io-error";
    return { ok: false, reason, message };
  }
}

type RemoteEntry = { name: string; kind: "directory" | "file" };

async function listRemoteDirectory(
  machine: RemoteMachine,
  directoryPath: string,
  options: { secretStore: SecretStore; runner: SshCommandRunner },
): Promise<RemoteEntry[]> {
  const password = machine.authMode === "password" && machine.passwordSecretId
    ? (await options.secretStore.get(machine.passwordSecretId)) ?? null
    : null;
  const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
  if (!sshArgs.length) {
    throw new Error("Remote machine SSH connection details are incomplete");
  }
  const script = `cd ${shellQuote(directoryPath)} && ls -A1 | while IFS= read -r entry; do if [ -d "$entry" ]; then printf 'd\\t%s\\n' "$entry"; else printf 'f\\t%s\\n' "$entry"; fi; done`;
  const args = [
    "-o", password ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    ...sshArgs,
    "--",
    remoteShellCommand(script),
  ];
  const result = await options.runner(args, listTimeoutMs, password ? { password } : undefined);
  const entries: RemoteEntry[] = [];
  for (const line of result.stdout.split(/\r?\n/u)) {
    if (!line) continue;
    const sep = line.indexOf("\t");
    if (sep < 0) continue;
    const kind = line.slice(0, sep);
    const name = line.slice(sep + 1);
    if (!name || name === "." || name === "..") continue;
    entries.push({ name, kind: kind === "d" ? "directory" : "file" });
  }
  return entries;
}

function resolveDirectoryPath(projectPath: string, requestedPath: string | undefined): string {
  const trimmed = requestedPath?.trim();
  if (!trimmed || trimmed === ".") return projectPath;
  if (trimmed.startsWith("/") || /[\0\r\n]/.test(trimmed)) {
    throw new Error("Directory path is unsafe");
  }
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (parts.includes("..")) {
    throw new Error("Directory path is unsafe");
  }
  const normalized = parts.join("/");
  const base = projectPath.endsWith("/") ? projectPath : `${projectPath}/`;
  return normalized ? `${base}${normalized}` : projectPath;
}

function buildFileTreeItem(entry: RemoteEntry, relativeBase: string): ProjectFileTreeItem {
  const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
  if (entry.kind === "directory") {
    return { name: entry.name, path: relativePath, kind: "directory", editable: false, children: undefined };
  }
  return { name: entry.name, path: relativePath, kind: "file", editable: isEditableProjectFile(relativePath) };
}

function sortFiles(items: ProjectFileTreeItem[]): ProjectFileTreeItem[] {
  return items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function readRemoteProjectFile(
  runtime: IpcRuntimeLike,
  input: ReadFileInput,
  options: { secretStore?: SecretStore; runner?: SshCommandRunner } = {},
): Promise<ReadFileResult> {
  try {
    const { machine, absolutePath } = await resolveRemoteFile(runtime, input.projectUri, input.relativePath);
    const secretStore = options.secretStore ?? createDefaultSecretStore();
    const runner = options.runner ?? runSshCommand;
    const password = await loadPassword(machine, secretStore);
    const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
    if (!sshArgs.length) {
      return { ok: false, reason: "io-error", message: "Remote machine SSH connection details are incomplete" };
    }

    const probeScript = `path=${shellQuote(absolutePath)}; if [ ! -e "$path" ]; then echo MISSING; exit 0; fi; if [ ! -f "$path" ]; then echo NOTFILE; exit 0; fi; wc -c < "$path" | tr -d ' '`;
    const probeArgs = buildSshArgs(sshArgs, password, probeScript);
    const probe = await runner(probeArgs, fileIoTimeoutMs, password ? { password } : undefined);
    const probeOutput = probe.stdout.trim();
    if (probeOutput === "MISSING") {
      return { ok: false, reason: "not-found", message: "Remote file not found" };
    }
    if (probeOutput === "NOTFILE") {
      return { ok: false, reason: "io-error", message: "Path is not a regular file" };
    }
    const size = Number.parseInt(probeOutput, 10);
    if (!Number.isInteger(size) || size < 0) {
      return { ok: false, reason: "io-error", message: `Unexpected stat output: ${probeOutput}` };
    }
    if (size > remoteMaxFileSizeBytes) {
      return { ok: false, reason: "too-large", message: `File exceeds ${formatBytes(remoteMaxFileSizeBytes)} limit (${formatBytes(size)})` };
    }

    const catArgs = buildSshArgs(sshArgs, password, `cat -- ${shellQuote(absolutePath)}`);
    const catResult = await runner(catArgs, fileIoTimeoutMs, password ? { password } : undefined);
    if (catResult.stdout.includes(String.fromCharCode(0))) {
      return { ok: false, reason: "binary", message: "File appears to be binary" };
    }
    return { ok: true, content: catResult.stdout, size, relativePath: input.relativePath };
  } catch (error) {
    return classifyRemoteFileError(error);
  }
}

export async function writeRemoteProjectFile(
  runtime: IpcRuntimeLike,
  input: WriteFileInput,
  options: { secretStore?: SecretStore; runner?: SshCommandRunner } = {},
): Promise<WriteFileResult> {
  try {
    if (typeof input.content !== "string") {
      return { ok: false, reason: "io-error", message: "Content must be a string" };
    }
    const byteSize = Buffer.byteLength(input.content, "utf8");
    if (byteSize > remoteMaxFileSizeBytes) {
      return { ok: false, reason: "too-large", message: `Content exceeds ${formatBytes(remoteMaxFileSizeBytes)} limit` };
    }
    const { machine, absolutePath } = await resolveRemoteFile(runtime, input.projectUri, input.relativePath);
    const secretStore = options.secretStore ?? createDefaultSecretStore();
    const runner = options.runner ?? runSshCommand;
    const password = await loadPassword(machine, secretStore);
    const sshArgs = sshArgsForRemoteMachine(machine, Boolean(password));
    if (!sshArgs.length) {
      return { ok: false, reason: "io-error", message: "Remote machine SSH connection details are incomplete" };
    }

    const base64 = Buffer.from(input.content, "utf8").toString("base64");
    const script = `path=${shellQuote(absolutePath)}; data=${shellQuote(base64)}; printf '%s' "$data" | base64 -d > "$path.sharkbay-tmp" && mv "$path.sharkbay-tmp" "$path"`;
    const writeArgs = buildSshArgs(sshArgs, password, script);
    await runner(writeArgs, fileIoTimeoutMs, password ? { password } : undefined);
    return { ok: true, size: byteSize, relativePath: input.relativePath };
  } catch (error) {
    return classifyRemoteFileError(error);
  }
}

async function resolveRemoteFile(runtime: IpcRuntimeLike, projectUri: string, relativePath: string): Promise<{ machine: RemoteMachine; absolutePath: string }> {
  const parsed = parseProjectUri(projectUri);
  if (parsed.kind !== "ssh") throw new Error("Project URI is not an SSH project");
  const config = await getConfiguredRoots(runtime);
  const machine = config.configuredRemoteMachines.find((item) => item.id === parsed.machineId);
  if (!machine) throw new Error(`Remote machine "${parsed.machineId}" is not configured`);
  const trimmed = relativePath?.trim();
  if (!trimmed || trimmed === ".") throw new Error("File path is required");
  if (trimmed.startsWith("/") || /[\0\r\n]/.test(trimmed)) throw new Error("File path is unsafe");
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (parts.includes("..")) throw new Error("File path is unsafe");
  const base = parsed.path.endsWith("/") ? parsed.path : `${parsed.path}/`;
  return { machine, absolutePath: `${base}${parts.join("/")}` };
}

async function loadPassword(machine: RemoteMachine, secretStore: SecretStore): Promise<string | null> {
  if (machine.authMode !== "password" || !machine.passwordSecretId) return null;
  return (await secretStore.get(machine.passwordSecretId)) ?? null;
}

function buildSshArgs(sshArgs: string[], password: string | null, script: string): string[] {
  return [
    "-o", password ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    ...sshArgs,
    "--",
    remoteShellCommand(script),
  ];
}

function classifyRemoteFileError(error: unknown): { ok: false; reason: "not-found" | "permission" | "unsafe-path" | "io-error"; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  let reason: "not-found" | "permission" | "unsafe-path" | "io-error";
  if (lower.includes("no such file") || lower.includes("not found")) reason = "not-found";
  else if (lower.includes("permission denied")) reason = "permission";
  else if (lower.includes("unsafe") || lower.includes("outside")) reason = "unsafe-path";
  else reason = "io-error";
  return { ok: false, reason, message };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function trimLeading(value: string, char: string): string {
  let index = 0;
  while (index < value.length && value[index] === char) index += 1;
  return value.slice(index);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
