import type * as T from "./types.js";

export class ApplicationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

type Command<I, R> = { input: I; result: R };

export type RuntimeTerminal = { session: T.TerminalSession; projectUri: string; projectName: string; displayPath: string; ownerId: string | null };
export type TerminalFrame = T.TerminalDataEvent & { sequence: number; reset?: boolean; cols?: number; rows?: number };
export type RuntimeCapabilities = { host: "web"; projectsManagedOnHost: true; artifacts: true; reviews: true; usage: true };

export type ApplicationMethodMap = {
  "config.get": Command<void, T.AppConfig>;
  "config.renameProject": Command<T.RenameProjectInput, T.AppConfig>;
  "config.removeProject": Command<T.RemoveProjectInput, T.AppConfig>;
  "config.createWorktree": Command<T.CreateWorktreeInput, T.CreateWorktreeResult>;
  "config.setAppearanceTheme": Command<T.AppearanceThemeInput, T.AppConfig>;
  "config.setTerminalAppearance": Command<T.TerminalAppearanceInput, T.AppConfig>;
  "config.setStatusChangeNotifications": Command<T.StatusChangeNotificationsInput, T.AppConfig>;
  "projects.scan": Command<void, T.ScanProjectsResult>;
  "projects.getSetupStatus": Command<{ repoPath: string }, T.ProjectSetupStatus>;
  "projects.getDetail": Command<{ projectUri: string }, T.ProjectDetail>;
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
