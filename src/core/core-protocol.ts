import type {
  AgentCli,
  DiagnosticsSnapshot,
  InstallLogEvent,
  InstallRecipe,
  InstallToolInput,
  InstallToolResult,
  IpcRuntimeLike,
  ListInstallRecipesInput,
  MachineProfile,
  PathExistsInput,
  PathExistsResult,
  ProfileReadOptions,
  ProjectDetail,
  ProjectFilesInput,
  ProjectFilesResult,
  ProjectProfile,
  ProjectScanInput,
  ReadFileInput,
  ReadFileResult,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
  TerminalUpdateEvent,
  WriteFileInput,
  WriteFileResult,
} from "../shared/types.js";
import type { PluginSummary } from "../plugins/plugin-host.js";

export type CoreMethodMap = {
  scanProjects: { args: [IpcRuntimeLike, ProjectScanInput | undefined]; result: ScanProjectsResult };
  listAgentClis: { args: [IpcRuntimeLike, { cwdUri?: string } | undefined]; result: AgentCli[] };
  listInstallRecipes: { args: [IpcRuntimeLike, ListInstallRecipesInput]; result: InstallRecipe[] };
  installTool: { args: [IpcRuntimeLike, InstallToolInput]; result: InstallToolResult };
  getProjectDetail: { args: [IpcRuntimeLike, { projectUri: string }]; result: ProjectDetail };
  listProjectFiles: { args: [IpcRuntimeLike, ProjectFilesInput]; result: ProjectFilesResult };
  readProjectFile: { args: [IpcRuntimeLike, ReadFileInput]; result: ReadFileResult };
  writeProjectFile: { args: [IpcRuntimeLike, WriteFileInput]; result: WriteFileResult };
  readMachineProfile: { args: [IpcRuntimeLike, string, ProfileReadOptions | undefined]; result: MachineProfile };
  readProjectProfile: { args: [IpcRuntimeLike, string, ProfileReadOptions | undefined]; result: ProjectProfile };
  pathExistsOnTarget: { args: [IpcRuntimeLike, PathExistsInput]; result: PathExistsResult };
  listPlugins: { args: []; result: PluginSummary[] };
  setPluginEnabled: { args: [string, boolean]; result: PluginSummary[] };
  applyDisabledPlugins: { args: [string[]]; result: void };
  readDiagnostics: { args: []; result: DiagnosticsSnapshot };
  createTerminal: { args: [IpcRuntimeLike, TerminalCreateInput]; result: TerminalSession };
  inputTerminal: { args: [TerminalInput]; result: TerminalSession | null };
  resizeTerminal: { args: [TerminalResizeInput]; result: TerminalSession | null };
  closeTerminal: { args: [TerminalCloseInput]; result: TerminalSession | null };
  closeAllTerminalSessions: { args: []; result: void };
};

export type CoreMethodName = keyof CoreMethodMap;

export type CoreEventMap = {
  terminalData: TerminalDataEvent;
  terminalUpdate: TerminalUpdateEvent;
  terminalExit: TerminalExitEvent;
  installLog: InstallLogEvent;
};

export type CoreEventName = keyof CoreEventMap;

export type CoreRequestMessage = {
  kind: "request";
  id: number;
  method: CoreMethodName;
  args: unknown[];
};

export type CoreResponseMessage =
  | { kind: "response"; id: number; ok: true; result: unknown }
  | { kind: "response"; id: number; ok: false; error: { name: string; message: string; stack?: string } };

export type CoreEventMessage = {
  kind: "event";
  name: CoreEventName;
  payload: unknown;
};

export type CoreReadyMessage = { kind: "ready" };

export type CoreMessage = CoreRequestMessage | CoreResponseMessage | CoreEventMessage | CoreReadyMessage;

export function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "Error", message: String(error) };
}

export function deserializeError(payload: { name: string; message: string; stack?: string }): Error {
  const error = new Error(payload.message);
  error.name = payload.name;
  if (payload.stack) error.stack = payload.stack;
  return error;
}
