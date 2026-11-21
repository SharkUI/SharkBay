import type * as T from "./types.js";

export const promptImageTypes = ["image/png", "image/jpeg"];
export const maxPromptImageBytes = 8 * 1024 * 1024;
export const maxPromptAttachmentTotalBytes = 64 * 1024 * 1024;
export const maxPromptAttachments = 4;

export function promptAttachmentImageType(name: string, type: string): "image/png" | "image/jpeg" | undefined {
  const filename = name.toLowerCase();
  if (type === "image/png" || filename.endsWith(".png")) return "image/png";
  if (type === "image/jpeg" || filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  return undefined;
}

export function promptAttachmentSizeError(files: readonly { name: string; type: string; size: number }[]): string | undefined {
  if (files.some(({ name, type, size }) => size > maxPromptImageBytes && promptAttachmentImageType(name, type))) {
    return "Each PNG or JPEG image must be 8 MiB or smaller.";
  }
  if (files.reduce((total, file) => total + file.size, 0) > maxPromptAttachmentTotalBytes) {
    return "Attachments must be 64 MiB or smaller in total.";
  }
  return undefined;
}

export type AttachmentPromptInput = {
  sessionId: string;
  text: string;
  requestId: string;
  files: { name: string; type: string; data: ArrayBuffer }[];
};

export function attachmentPromptForm(input: AttachmentPromptInput): FormData {
  if (typeof input?.text !== "string" || !Array.isArray(input.files) || !input.files.length || input.files.length > maxPromptAttachments) {
    throw new Error(`Attach up to ${maxPromptAttachments} files per prompt.`);
  }
  if (input.files.some((file) => typeof file?.name !== "string" || typeof file.type !== "string" || !(file.data instanceof ArrayBuffer))) {
    throw new Error("Invalid attachment file.");
  }
  const sizeError = promptAttachmentSizeError(input.files.map(({ name, type, data }) => ({ name, type, size: data.byteLength })));
  if (sizeError) throw new Error(sizeError);
  const form = new FormData();
  form.set("prompt", input.text);
  for (const file of input.files) {
    form.append("file", new Blob([file.data], { type: file.type }), file.name);
  }
  return form;
}

export class ApplicationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

type Command<I, R> = { input: I; result: R };

export type RuntimeTerminal = { session: T.TerminalSession; projectUri: string; projectName: string; displayPath: string; ownerId: string | null };
export type TerminalFrame = T.TerminalDataEvent & { sequence: number; reset?: boolean; cols?: number; rows?: number };
export type RuntimeCapabilities = { host: "web"; projectsManagedOnHost: true; artifacts: true; reviews: true; usage: true };
export type HostDirectoryListing = { path: string; parentPath: string | null; directories: Array<{ name: string; path: string }> };

export type ApplicationMethodMap = {
  "config.get": Command<void, T.AppConfig>;
  "config.addProject": Command<T.ProjectConfigInput, T.AppConfig>;
  "config.cloneProject": Command<Required<T.CloneProjectInput>, T.CloneProjectResult>;
  "config.renameProject": Command<T.RenameProjectInput, T.AppConfig>;
  "config.removeProject": Command<T.RemoveProjectInput, T.AppConfig>;
  "config.createWorktree": Command<T.CreateWorktreeInput, T.CreateWorktreeResult>;
  "config.openWorktree": Command<{ repoPath: string; worktreePath: string }, T.AppConfig>;
  "config.removeWorktree": Command<{ repoPath: string; worktreePath: string }, T.AppConfig>;
  "config.deleteLocalBranch": Command<{ repoPath: string; branch: string }, T.AppConfig>;
  "config.setAppearanceTheme": Command<T.AppearanceThemeInput, T.AppConfig>;
  "config.setTerminalAppearance": Command<T.TerminalAppearanceInput, T.AppConfig>;
  "config.setStatusChangeNotifications": Command<T.StatusChangeNotificationsInput, T.AppConfig>;
  "projects.scan": Command<void, T.ScanProjectsResult>;
  "projects.listHostDirectories": Command<{ path?: string }, HostDirectoryListing>;
  "projects.getSetupStatus": Command<{ repoPath: string }, T.ProjectSetupStatus>;
  "projects.getDetail": Command<{ projectUri: string }, T.ProjectDetail>;
  "projects.getGitWorkspace": Command<{ repoPath: string }, T.GitWorkspace>;
  "projects.fetchGitBranches": Command<{ repoPath: string }, void>;
  "projects.getGitHub": Command<{ projectUri: string }, T.GitHubInfo>;
  "projects.listFiles": Command<Pick<T.ProjectFilesInput, "projectUri" | "directoryPath">, T.ProjectFilesResult>;
  "projects.readFile": Command<T.ReadFileInput, T.ReadFileResult>;
  "projects.writeFile": Command<T.WriteFileInput, T.WriteFileResult>;
  "projects.deleteFile": Command<T.DeleteFileInput, T.DeleteFileResult>;
  "projects.renameFile": Command<T.RenameFileInput, T.RenameFileResult>;
  "codeGraph.getStatus": Command<{ projectUri: string }, T.CodeGraphProjectStatus>;
  "codeGraph.ensureStatus": Command<{ projectUri: string }, T.CodeGraphProjectStatus>;
  "terminal.list": Command<void, RuntimeTerminal[]>;
  "terminal.create": Command<Pick<T.TerminalCreateInput, "cwdUri" | "title" | "initialCommand" | "initialCommandTitle" | "agentId" | "service" | "cols" | "rows">, T.TerminalSession>;
  "terminal.input": Command<T.TerminalInput, T.TerminalSession>;
  "terminal.resize": Command<T.TerminalResizeInput, T.TerminalSession>;
  "terminal.close": Command<T.TerminalCloseInput, T.TerminalSession>;
  "terminal.claim": Command<{ sessionId: string }, { ownerId: string }>;
  "terminal.recordPrompt": Command<{ terminalSessionId: string; text: string }, void>;
  "terminal.recordPromptHistoryEntry": Command<{ key: string; text: string }, void>;
  "terminal.loadPromptHistory": Command<{ sessionId: string }, string[]>;
  "artifacts.start": Command<{ repoPath: string; taskId: string; agentId: string }, T.TerminalSession>;
  "reviews.start": Command<Omit<T.ReviewStartInput, "origin" | "initialCommand" | "initialCommandTitle">, T.ReviewRunStartedEvent>;
  "reviews.cancel": Command<{ runId: string }, T.ReviewRun>;
  "agents.listClis": Command<{ cwdUri?: string } | undefined, T.AgentCli[]>;
  "agents.listInstallRecipes": Command<T.ListInstallRecipesInput, T.InstallRecipe[]>;
  "agents.installTool": Command<T.InstallToolInput, T.InstallToolResult>;
  "agents.setHooksEnabled": Command<{ agentId: string; enabled: boolean }, void>;
  "targets.pathExists": Command<T.PathExistsInput, T.PathExistsResult>;
  "plugins.list": Command<void, T.PluginSummary[]>;
  "plugins.setEnabled": Command<{ pluginId: string; enabled: boolean }, T.PluginSummary[]>;
  "diagnostics.read": Command<void, T.DiagnosticsSnapshot>;
  "protocol.getTasks": Command<{ repoPath: string }, T.TaskViewModel[]>;
  "protocol.getStatus": Command<{ repoPath: string }, T.ProtocolStatus>;
  "protocol.install": Command<{ repoPath: string }, T.ProtocolStatus>;
  "protocol.enable": Command<{ repoPath: string }, T.ProtocolStatus>;
  "protocol.uninstall": Command<T.ProtocolUninstallInput, T.ProtocolUninstallResult>;
  "protocol.resolveIdentity": Command<void, T.GitHubIdentity>;
  "protocol.syncNow": Command<{ repoPath: string }, void>;
  "protocol.updateHarness": Command<{ repoPath: string }, T.ProtocolStatus>;
  "hooks.getSessions": Command<{ repoPath: string }, T.HookSessionViewModel[]>;
  "usage.getSummary": Command<{ periodDays?: number } | undefined, T.UsageSummary>;
  "usage.getReport": Command<T.UsageReportFilter, T.UsageReportResult>;
};

export type ApplicationMethod = keyof ApplicationMethodMap;
export type ApplicationResponse = { ok: true; result?: unknown } | { ok: false; error: { code: string; message: string } };

export const runtimeCapabilities: RuntimeCapabilities = { host: "web", projectsManagedOnHost: true, artifacts: true, reviews: true, usage: true };
