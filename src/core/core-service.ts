import { EventEmitter } from "node:events";
import path from "node:path";
import { getConfiguredRoots } from "../main/config.js";
import { resolveProjectIconSources } from "../main/project-icons.js";
import { resolveProjectUri } from "../main/path-safety.js";
import type {
  IpcRuntimeLike,
  AgentCli,
  CodeGraphProjectStatus,
  DeleteFileInput,
  DeleteFileResult,
  DiagnosticsSnapshot,
  GitHubInfo,
  InstallLogEvent,
  InstallLogStream,
  InstallToolInput,
  InstallToolResult,
  InstallRecipe,
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
  ToolProfile,
  ReadFileInput,
  ReadFileResult,
  RenameFileInput,
  RenameFileResult,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalControlState,
  TerminalCreateInput,
  TerminalInput,
  TerminalNotificationInput,
  TerminalNotificationResult,
  TerminalResizeInput,
  TerminalSession,
  WriteFileInput,
  WriteFileResult,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalUpdateEvent,
} from "../shared/types.js";
import type { ExecutionProvider } from "./execution-provider.js";
import { parseProjectUri } from "./project-uri.js";
import { ExecutionProviderRegistry } from "./provider-registry.js";
import { PluginHost, type MachineProfilePatch, type PluginRecord, type PluginSummary } from "../plugins/plugin-host.js";
import { bundledPlugins } from "../plugins/bundled-plugins.js";
import { AGENT_PLUGIN_ID, detectAgentTools } from "../plugins/bundled/agent-detector.js";
import { ProfileOrchestrator } from "../profiles/profile-orchestrator.js";
import { JobScheduler } from "./job-scheduler.js";
import { ProfileCache } from "../storage/profile-cache.js";
import { DiagnosticsCollector } from "./diagnostics.js";
import { CodeGraphManager, isCodeGraphPlugin } from "./codegraph-manager.js";

export type SharkBayCoreServiceEvents = {
  terminalData: [TerminalDataEvent];
  terminalUpdate: [TerminalUpdateEvent];
  terminalExit: [TerminalExitEvent];
  installLog: [InstallLogEvent];
};

export class SharkBayCoreService extends EventEmitter<SharkBayCoreServiceEvents> {
  readonly providers: ExecutionProviderRegistry;
  readonly pluginHost: PluginHost;
  readonly scheduler: JobScheduler;
  readonly profileCache: ProfileCache;
  readonly profiles: ProfileOrchestrator;
  readonly diagnostics: DiagnosticsCollector;
  readonly codeGraph: CodeGraphManager;
  private readonly terminalProviders = new Map<string, ExecutionProvider>();

  constructor(providers: ExecutionProvider[] = [], pluginHost = createDefaultPluginHost()) {
    super();
    this.providers = new ExecutionProviderRegistry(providers);
    this.pluginHost = pluginHost;
    this.scheduler = new JobScheduler();
    this.profileCache = new ProfileCache();
    this.diagnostics = new DiagnosticsCollector();
    this.codeGraph = new CodeGraphManager();
    this.profiles = new ProfileOrchestrator(this.providers, this.pluginHost, this.scheduler, this.profileCache, this.diagnostics);
    this.scheduler.on("update", (job) => this.diagnostics.recordJobUpdate(job));
    for (const provider of providers) {
      if (provider instanceof EventEmitter) {
        const maybeWithDiagnostics = provider as unknown as { setDiagnosticsCollector?: (collector: DiagnosticsCollector) => void };
        if (typeof maybeWithDiagnostics.setDiagnosticsCollector === "function") {
          maybeWithDiagnostics.setDiagnosticsCollector(this.diagnostics);
        }
        provider.on("terminalData", (event) => {
          this.diagnostics.recordTerminalData();
          this.emit("terminalData", event);
        });
        provider.on("terminalUpdate", (event) => this.emit("terminalUpdate", event));
        provider.on("terminalExit", (event) => {
          this.terminalProviders.delete(event.sessionId);
          this.emit("terminalExit", event);
        });
      }
    }
  }

  readDiagnostics(): DiagnosticsSnapshot {
    return this.diagnostics.snapshot();
  }

  scanProjects(runtime: IpcRuntimeLike, input?: ProjectScanInput): Promise<ScanProjectsResult> {
    return this.providers.providerForKind("local").scanProjects(runtime, input);
  }

  async listAgentClis(runtime: IpcRuntimeLike, input?: { cwdUri?: string }): Promise<AgentCli[]> {
    const targetId = input?.cwdUri ? parseProjectUri(input.cwdUri).targetId : "local";
    const agentRecords = this.pluginHost.listPluginRecords().filter(isEnabledAgentDetectionPlugin);
    if (!agentRecords.length) return [];

    const provider = this.providers.providerForTargetId(targetId);
    const ctx = await provider.createMachineProbeContext(runtime, targetId);
    if (agentRecords.length === 1 && agentRecords[0]?.manifest.id === AGENT_PLUGIN_ID) {
      return agentToolsToClis(await detectAgentTools(ctx, { includeVersions: false }));
    }

    const patches = await Promise.all(agentRecords.flatMap((record) =>
      record.machineDetectors.map((detector) =>
        this.scheduler.schedule<MachineProfilePatch>({
          kind: "machine-profile",
          targetId,
          priority: "interactive",
          timeoutMs: 5000,
          dedupeKey: `agent-list:${targetId}:${detector.pluginId}:${detector.id}`,
          run: async () => {
            try {
              return await detector.run(ctx);
            } catch {
              return {};
            }
          },
        })
      )
    ));
    return agentToolsToClis(patches.flatMap((patch) => patch.agents ?? []));
  }

  async installTool(runtime: IpcRuntimeLike, input: InstallToolInput): Promise<InstallToolResult> {
    const recipe = this.pluginHost.listInstallRecipes().find((entry) => entry.id === input.recipeId);
    const logs: string[] = [];
    if (!recipe) {
      return { ok: false, recipeId: input.recipeId, targetId: input.targetId, logs, verified: false, error: "Install recipe not found" };
    }
    const installId = `install-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const pushLog = (stream: InstallLogStream, line: string) => {
      if (!line) return;
      logs.push(line);
      this.emit("installLog", { installId, recipeId: recipe.id, targetId: input.targetId, toolId: recipe.toolId, stream, line });
    };
    const provider = this.providers.providerForTargetId(input.targetId);
    const machineProfile = await this.readMachineProfile(runtime, input.targetId);
    if (!recipe.targetKinds.includes(machineProfile.targetKind)) {
      return { ok: false, recipeId: recipe.id, targetId: input.targetId, logs, verified: false, error: `Recipe does not support ${machineProfile.targetKind} targets` };
    }
    if (!recipeSupportsPlatform(recipe, machineProfile.os.platform)) {
      return { ok: false, recipeId: recipe.id, targetId: input.targetId, logs, verified: false, error: `Recipe does not support ${machineProfile.os.platform}` };
    }
    for (const precondition of recipe.preconditions) {
      const tool = [...machineProfile.tools, ...machineProfile.languages, ...machineProfile.packageManagers, ...machineProfile.agents]
        .find((item) => item.command === precondition.tool || item.id === precondition.tool);
      if (Boolean(tool?.available) !== precondition.available) {
        return {
          ok: false,
          recipeId: recipe.id,
          targetId: input.targetId,
          logs,
          verified: false,
          error: `Precondition failed: ${precondition.tool} availability must be ${precondition.available}`,
        };
      }
    }
    const result = await this.scheduler.schedule<InstallToolResult>({
      kind: "install",
      targetId: input.targetId,
      priority: "interactive",
      timeoutMs: 120000,
      run: async () => {
        for (const step of recipe.steps) {
          if (step.kind !== "command") {
            pushLog("info", `${step.kind}: ${step.kind === "openUrl" ? step.url : step.markdown}`);
            continue;
          }
          pushLog("command", `$ ${step.command}`);
          const commandResult = await provider.runCommand(runtime, input.targetId, step.command, { timeoutMs: 120000 });
          pushLog("stdout", commandResult.stdout.trim());
          pushLog("stderr", commandResult.stderr.trim());
          if (commandResult.exitCode !== 0) {
            return { ok: false, recipeId: recipe.id, targetId: input.targetId, logs, verified: false, error: `Install step failed with exit code ${commandResult.exitCode}` };
          }
        }
        const verifyCommand = [recipe.verification.command, ...(recipe.verification.args ?? [])].map(shellQuote).join(" ");
        pushLog("command", `$ ${verifyCommand}`);
        const verification = await provider.runCommand(runtime, input.targetId, verifyCommand, { timeoutMs: 10000 });
        pushLog("stdout", verification.stdout.trim());
        pushLog("stderr", verification.stderr.trim());
        const verified = verification.exitCode === 0;
        if (verified) {
          await this.readMachineProfile(runtime, input.targetId, { refresh: true });
        }
        return { ok: verified, recipeId: recipe.id, targetId: input.targetId, logs, verified, ...(verified ? {} : { error: "Verification failed" }) };
      },
    });
    return result;
  }

  async listInstallRecipes(runtime: IpcRuntimeLike, input: ListInstallRecipesInput): Promise<InstallRecipe[]> {
    const profile = await this.readMachineProfile(runtime, input.targetId);
    return this.pluginHost.listInstallRecipes()
      .filter((recipe) => !input.toolId || recipe.toolId === input.toolId)
      .filter((recipe) => recipe.targetKinds.includes(profile.targetKind))
      .filter((recipe) => recipeSupportsPlatform(recipe, profile.os.platform))
      .filter((recipe) => recipe.preconditions.every((precondition) => {
        const tool = [...profile.tools, ...profile.languages, ...profile.packageManagers, ...profile.agents]
          .find((item) => item.command === precondition.tool || item.id === precondition.tool);
        return Boolean(tool?.available) === precondition.available;
      }));
  }

  async getProjectDetail(runtime: IpcRuntimeLike, input: { projectUri: string }): Promise<ProjectDetail> {
    const provider = this.providers.providerForUri(input.projectUri);
    const parsed = parseProjectUri(input.projectUri);
    const [gitMeta, gitHistory, gitDirtyFiles] = await Promise.all([
      provider.readGitMetadata(runtime, input.projectUri),
      provider.readGitHistory(runtime, input.projectUri),
      provider.readGitDirtyFiles(runtime, input.projectUri),
    ]);

    if (parsed.kind !== "local") {
      throw new Error(`Project detail is not implemented for ${parsed.kind}`);
    }

    const config = await getConfiguredRoots(runtime);
    const safeRepo = await resolveProjectUri(input.projectUri, config.configuredRoots, config.configuredProjects);
    const iconSources = await resolveProjectIconSources(safeRepo.repoPath, config.configuredRoots);
    return {
      id: safeRepo.projectUri,
      uri: safeRepo.projectUri,
      name: path.basename(safeRepo.repoPath),
      providerId: "local",
      providerKind: "local",
      displayPath: safeRepo.repoPath,
      iconSources,
      repoUrl: gitMeta.remoteOrigin,
      currentBranch: gitMeta.currentBranch,
      dirtyWorktree: gitMeta.dirtyWorktree,
      gitHistory,
      gitDirtyFiles,
    };
  }

  listProjectFiles(runtime: IpcRuntimeLike, input: ProjectFilesInput): Promise<ProjectFilesResult> {
    return this.providers.providerForUri(input.projectUri).listProjectFiles(runtime, input);
  }

  readProjectGitHub(runtime: IpcRuntimeLike, input: { projectUri: string }): Promise<GitHubInfo> {
    return this.providers.providerForUri(input.projectUri).readGitHubInfo(runtime, input.projectUri);
  }

  readProjectFile(runtime: IpcRuntimeLike, input: ReadFileInput): Promise<ReadFileResult> {
    return this.providers.providerForUri(input.projectUri).readProjectFile(runtime, input);
  }

  writeProjectFile(runtime: IpcRuntimeLike, input: WriteFileInput): Promise<WriteFileResult> {
    return this.providers.providerForUri(input.projectUri).writeProjectFile(runtime, input);
  }

  deleteProjectFile(runtime: IpcRuntimeLike, input: DeleteFileInput): Promise<DeleteFileResult> {
    return this.providers.providerForUri(input.projectUri).deleteProjectFile(runtime, input);
  }

  renameProjectFile(runtime: IpcRuntimeLike, input: RenameFileInput): Promise<RenameFileResult> {
    return this.providers.providerForUri(input.projectUri).renameProjectFile(runtime, input);
  }

  async readCodeGraphStatus(runtime: IpcRuntimeLike, input: { projectUri: string }): Promise<CodeGraphProjectStatus> {
    return this.readCodeGraphProjectStatus(runtime, input, "read");
  }

  async ensureCodeGraphStatus(runtime: IpcRuntimeLike, input: { projectUri: string }): Promise<CodeGraphProjectStatus> {
    return this.readCodeGraphProjectStatus(runtime, input, "ensure");
  }

  private isCodeGraphPluginEnabled(): boolean {
    return this.pluginHost.listPlugins().find((plugin) => isCodeGraphPlugin(plugin.id))?.enabled ?? false;
  }

  private async readCodeGraphProjectStatus(runtime: IpcRuntimeLike, input: { projectUri: string }, mode: "read" | "ensure"): Promise<CodeGraphProjectStatus> {
    const enabled = this.isCodeGraphPluginEnabled();
    const parsed = parseProjectUri(input.projectUri);
    if (parsed.kind !== "local") {
      return this.codeGraph.readProjectStatus(input.projectUri, enabled);
    }
    const config = await getConfiguredRoots(runtime);
    const safeRepo = await resolveProjectUri(input.projectUri, config.configuredRoots, config.configuredProjects);
    return mode === "ensure"
      ? this.codeGraph.ensureProjectStatus(safeRepo.projectUri, enabled)
      : this.codeGraph.readProjectStatus(safeRepo.projectUri, enabled);
  }

  removeCodeGraphIndexes(runtime: IpcRuntimeLike, input: { projectUris: string[] }): Promise<void> {
    void runtime;
    return this.codeGraph.removeProjectIndexes(input.projectUris);
  }

  cancelAllCodeGraphJobs(): void {
    this.codeGraph.cancelAll();
  }

  readMachineProfile(runtime: IpcRuntimeLike, targetId: string, options?: ProfileReadOptions): Promise<MachineProfile> {
    return this.profiles.readMachineProfile(runtime, targetId, options);
  }

  readProjectProfile(runtime: IpcRuntimeLike, projectUri: string, options?: ProfileReadOptions): Promise<ProjectProfile> {
    return this.profiles.readProjectProfile(runtime, projectUri, options);
  }

  pathExistsOnTarget(runtime: IpcRuntimeLike, input: PathExistsInput): Promise<PathExistsResult> {
    return this.providers.providerForTargetId(input.targetId).pathExistsOnTarget(runtime, input);
  }

  applyDisabledPlugins(disabledIds: string[]): void {
    this.pluginHost.applyEnabledState(disabledIds);
  }

  listPlugins(): PluginSummary[] {
    return this.pluginHost.listPlugins();
  }

  setPluginEnabled(pluginId: string, enabled: boolean): PluginSummary[] {
    this.pluginHost.setEnabled(pluginId, enabled);
    return this.pluginHost.listPlugins();
  }

  async createTerminal(runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession> {
    const provider = this.providers.providerForUri(input.cwdUri);
    const session = await provider.createTerminal(runtime, {
      ...input,
      protocolBootstrap: {
        ...input.protocolBootstrap,
        codeGraphEnabled: this.isCodeGraphPluginEnabled(),
      },
    });
    this.terminalProviders.set(session.id, provider);
    return session;
  }

  inputTerminal(input: TerminalInput): TerminalSession | null {
    return this.terminalProviders.get(input.sessionId)?.inputTerminal(input) ?? null;
  }

  inspectTerminal(sessionId: string): TerminalControlState | null {
    return this.terminalProviders.get(sessionId)?.inspectTerminal(sessionId) ?? null;
  }

  notifyTerminal(input: TerminalNotificationInput): TerminalNotificationResult | null {
    return this.terminalProviders.get(input.sessionId)?.notifyTerminal(input) ?? null;
  }

  resizeTerminal(input: TerminalResizeInput): TerminalSession | null {
    return this.terminalProviders.get(input.sessionId)?.resizeTerminal(input) ?? null;
  }

  closeTerminal(input: TerminalCloseInput): TerminalSession | null {
    return this.terminalProviders.get(input.sessionId)?.closeTerminal(input) ?? null;
  }

  closeAllTerminalSessions(): void {
    for (const provider of this.providers.list()) {
      provider.closeAllTerminalSessions();
    }
  }
}

function agentLabel(agentId: string): string {
  if (agentId === "codex") return "Codex CLI";
  if (agentId === "claude") return "Claude Code";
  if (agentId === "gemini") return "Gemini CLI";
  if (agentId === "kiro") return "Kiro CLI";
  if (agentId === "codewhale") return "CodeWhale";
  if (agentId === "qwen") return "Qwen Code";
  if (agentId === "opencode") return "OpenCode";
  if (agentId === "cursor") return "Cursor CLI";
  return agentId;
}

function agentShortLabel(agentId: string): string {
  if (agentId === "codex") return "Cx";
  if (agentId === "claude") return "Cl";
  if (agentId === "gemini") return "G";
  if (agentId === "kiro") return "K";
  if (agentId === "codewhale") return "D";
  if (agentId === "qwen") return "Q";
  if (agentId === "opencode") return "O";
  if (agentId === "cursor") return "Cu";
  return agentId.slice(0, 2).toUpperCase();
}

function isEnabledAgentDetectionPlugin(record: PluginRecord): boolean {
  return record.enabled && Boolean(record.manifest.capabilities?.some((capability) => capability.kind === "agent:detect"));
}

function agentToolsToClis(agents: ToolProfile[]): AgentCli[] {
  return agents
    .filter((agent) => agent.available)
    .map((agent) => ({
      id: agent.id,
      label: agentLabel(agent.id),
      command: agent.command,
      executablePath: agent.path ?? agent.command,
      shortLabel: agentShortLabel(agent.id),
    }));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function recipeSupportsPlatform(recipe: InstallRecipe, platform: MachineProfile["os"]["platform"]): boolean {
  if (platform === "unknown") return recipe.platforms.includes("unknown");
  return recipe.platforms.includes(platform);
}

function createDefaultPluginHost(): PluginHost {
  const host = new PluginHost();
  for (const plugin of bundledPlugins()) host.registerPlugin(plugin, { source: "bundled" });
  return host;
}
