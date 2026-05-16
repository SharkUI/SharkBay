import { EventEmitter } from "node:events";
import path from "node:path";
import { getConfiguredRoots } from "../main/config.js";
import { resolveProjectIconSources } from "../main/project-icons.js";
import { resolveProjectUri } from "../main/path-safety.js";
import type {
  IpcRuntimeLike,
  AgentCli,
  InstallToolInput,
  InstallToolResult,
  InstallRecipe,
  ListInstallRecipesInput,
  MachineProfile,
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
  TerminalInput,
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
import { PluginHost } from "../plugins/plugin-host.js";
import { createCoreMachineDetector, createCoreProjectDetector } from "../plugins/bundled/core-detectors.js";
import { createNodeProjectDetector } from "../plugins/bundled/node-detector.js";
import { createPythonProjectDetector } from "../plugins/bundled/python-detector.js";
import { createGoProjectDetector } from "../plugins/bundled/go-detector.js";
import { createRustProjectDetector } from "../plugins/bundled/rust-detector.js";
import { createJavaProjectDetector } from "../plugins/bundled/java-detector.js";
import { createAgentMachineDetector } from "../plugins/bundled/agent-detector.js";
import { createAgentInstallRecipes } from "../plugins/bundled/agent-detector.js";
import { ProfileOrchestrator } from "../profiles/profile-orchestrator.js";
import { JobScheduler } from "./job-scheduler.js";
import { ProfileCache } from "../storage/profile-cache.js";
import { InstallRecipeRegistry } from "../plugins/install-recipes.js";

export type SharkBayCoreServiceEvents = {
  terminalData: [TerminalDataEvent];
  terminalUpdate: [TerminalUpdateEvent];
  terminalExit: [TerminalExitEvent];
};

export class SharkBayCoreService extends EventEmitter<SharkBayCoreServiceEvents> {
  readonly providers: ExecutionProviderRegistry;
  readonly pluginHost: PluginHost;
  readonly scheduler: JobScheduler;
  readonly profileCache: ProfileCache;
  readonly profiles: ProfileOrchestrator;
  readonly installRecipes: InstallRecipeRegistry;
  private readonly terminalProviders = new Map<string, ExecutionProvider>();

  constructor(providers: ExecutionProvider[] = [], pluginHost = createDefaultPluginHost()) {
    super();
    this.providers = new ExecutionProviderRegistry(providers);
    this.pluginHost = pluginHost;
    this.scheduler = new JobScheduler();
    this.profileCache = new ProfileCache();
    this.profiles = new ProfileOrchestrator(this.providers, this.pluginHost, this.scheduler, this.profileCache);
    this.installRecipes = new InstallRecipeRegistry(createAgentInstallRecipes());
    for (const provider of providers) {
      if (provider instanceof EventEmitter) {
        provider.on("terminalData", (event) => this.emit("terminalData", event));
        provider.on("terminalUpdate", (event) => this.emit("terminalUpdate", event));
        provider.on("terminalExit", (event) => {
          this.terminalProviders.delete(event.sessionId);
          this.emit("terminalExit", event);
        });
      }
    }
  }

  scanProjects(runtime: IpcRuntimeLike, input?: ProjectScanInput): Promise<ScanProjectsResult> {
    return this.providers.providerForKind("local").scanProjects(runtime, input);
  }

  async listAgentClis(runtime: IpcRuntimeLike, input?: { cwdUri?: string }): Promise<AgentCli[]> {
    const targetId = input?.cwdUri ? parseProjectUri(input.cwdUri).targetId : "local";
    const profile = await this.readMachineProfile(runtime, targetId);
    return profile.agents
      .filter((agent) => agent.available)
      .map((agent) => ({
        id: agent.id,
        label: agentLabel(agent.id),
        command: agent.command,
        executablePath: agent.path ?? agent.command,
        shortLabel: agentShortLabel(agent.id),
      }));
  }

  async installTool(runtime: IpcRuntimeLike, input: InstallToolInput): Promise<InstallToolResult> {
    const recipe = this.installRecipes.get(input.recipeId);
    const logs: string[] = [];
    if (!recipe) {
      return { ok: false, recipeId: input.recipeId, targetId: input.targetId, logs, verified: false, error: "Install recipe not found" };
    }
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
            logs.push(`${step.kind}: ${step.kind === "openUrl" ? step.url : step.markdown}`);
            continue;
          }
          logs.push(`$ ${step.command}`);
          const commandResult = await provider.runCommand(runtime, input.targetId, step.command, { timeoutMs: 120000 });
          if (commandResult.stdout.trim()) logs.push(commandResult.stdout.trim());
          if (commandResult.stderr.trim()) logs.push(commandResult.stderr.trim());
          if (commandResult.exitCode !== 0) {
            return { ok: false, recipeId: recipe.id, targetId: input.targetId, logs, verified: false, error: `Install step failed with exit code ${commandResult.exitCode}` };
          }
        }
        const verifyCommand = [recipe.verification.command, ...(recipe.verification.args ?? [])].map(shellQuote).join(" ");
        logs.push(`$ ${verifyCommand}`);
        const verification = await provider.runCommand(runtime, input.targetId, verifyCommand, { timeoutMs: 10000 });
        if (verification.stdout.trim()) logs.push(verification.stdout.trim());
        if (verification.stderr.trim()) logs.push(verification.stderr.trim());
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
    return this.installRecipes.list()
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

    if (parsed.kind === "ssh") {
      return {
        id: input.projectUri,
        uri: input.projectUri,
        name: path.posix.basename(parsed.path) || parsed.machineId,
        providerId: parsed.machineId,
        providerKind: "ssh",
        displayPath: `${parsed.machineId}:${parsed.path}`,
        iconSources: [],
        repoUrl: gitMeta.remoteOrigin,
        currentBranch: gitMeta.currentBranch,
        dirtyWorktree: gitMeta.dirtyWorktree,
        gitHistory,
        gitDirtyFiles,
      };
    }

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

  readProjectFile(runtime: IpcRuntimeLike, input: ReadFileInput): Promise<ReadFileResult> {
    return this.providers.providerForUri(input.projectUri).readProjectFile(runtime, input);
  }

  writeProjectFile(runtime: IpcRuntimeLike, input: WriteFileInput): Promise<WriteFileResult> {
    return this.providers.providerForUri(input.projectUri).writeProjectFile(runtime, input);
  }

  readMachineProfile(runtime: IpcRuntimeLike, targetId: string, options?: ProfileReadOptions): Promise<MachineProfile> {
    return this.profiles.readMachineProfile(runtime, targetId, options);
  }

  readProjectProfile(runtime: IpcRuntimeLike, projectUri: string, options?: ProfileReadOptions): Promise<ProjectProfile> {
    return this.profiles.readProjectProfile(runtime, projectUri, options);
  }

  async createTerminal(runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession> {
    const provider = this.providers.providerForUri(input.cwdUri);
    const session = await provider.createTerminal(runtime, input);
    this.terminalProviders.set(session.id, provider);
    return session;
  }

  inputTerminal(input: TerminalInput): TerminalSession {
    return this.requireTerminalProvider(input.sessionId).inputTerminal(input);
  }

  resizeTerminal(input: TerminalResizeInput): TerminalSession {
    return this.requireTerminalProvider(input.sessionId).resizeTerminal(input);
  }

  closeTerminal(input: TerminalCloseInput): TerminalSession {
    return this.requireTerminalProvider(input.sessionId).closeTerminal(input);
  }

  closeAllTerminalSessions(): void {
    for (const provider of this.providers.list()) {
      provider.closeAllTerminalSessions();
    }
  }

  private requireTerminalProvider(_sessionId: string): ExecutionProvider {
    const provider = this.terminalProviders.get(_sessionId);
    if (!provider) throw new Error("Unknown terminal session");
    return provider;
  }
}

function agentLabel(agentId: string): string {
  if (agentId === "codex") return "Codex CLI";
  if (agentId === "claude") return "Claude Code";
  if (agentId === "gemini") return "Gemini CLI";
  if (agentId === "kiro") return "Kiro CLI";
  if (agentId === "deepseek") return "DeepSeek TUI";
  if (agentId === "qwen") return "Qwen Code";
  if (agentId === "opencode") return "OpenCode";
  return agentId;
}

function agentShortLabel(agentId: string): string {
  if (agentId === "codex") return "Cx";
  if (agentId === "claude") return "Cl";
  if (agentId === "gemini") return "G";
  if (agentId === "kiro") return "K";
  if (agentId === "deepseek") return "D";
  if (agentId === "qwen") return "Q";
  if (agentId === "opencode") return "O";
  return agentId.slice(0, 2).toUpperCase();
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
  host.registerMachineDetector(createCoreMachineDetector());
  host.registerMachineDetector(createAgentMachineDetector());
  host.registerProjectDetector(createCoreProjectDetector());
  host.registerProjectDetector(createNodeProjectDetector());
  host.registerProjectDetector(createPythonProjectDetector());
  host.registerProjectDetector(createGoProjectDetector());
  host.registerProjectDetector(createRustProjectDetector());
  host.registerProjectDetector(createJavaProjectDetector());
  return host;
}
