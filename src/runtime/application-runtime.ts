import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCoreRuntime } from "../core/core-runtime.js";
import { toLocalProjectUri } from "../core/project-uri.js";
import { CODEGRAPH_PLUGIN_ID } from "../plugins/bundled/codegraph-detector.js";
import { addConfiguredProject, setIslandEnabled, setCaffeinateMode, loadRuntimeConfig, renameProject, removeConfiguredProject, setAppearanceTheme, setTerminalAppearance, setStatusChangeNotificationsEnabled, setPluginEnabledConfig, setProtocolAutoInstallDisabled, setSessionHooksEnabled } from "../main/config.js";
import { createWorktree, deleteLocalBranch, fetchGitBranches, readGitWorkspace, removeGitWorktree } from "../main/worktree.js";
import { readProjectSetupStatus } from "../main/project-setup.js";
import { reserveArtifactPath, resolveGitHubIdentity } from "../main/harness.js";
import { prepareSessionHookLaunch } from "../main/hooks/session-launch.js";
import { hasSessionHooks } from "../shared/session-hooks.js";
import { parseHookSessions } from "../main/hooks/sessions.js";
import { TokenUsageDb } from "../main/token-usage-db.js";
import { TokenUsageCollector } from "../main/token-usage-collector.js";
import { isPathInside } from "../main/path-safety.js";
import { createAgentRuntime } from "./agent-runtime.js";
import { createTaskRuntime, resolveRuntimeRepoPath } from "./task-runtime.js";
import { acquireProfileLock } from "./profile-lock.js";
import { TerminalState } from "./terminal-state.js";
import { cloneProject } from "../main/project-clone.js";
import { createRuntimeTelegram } from "./telegram-runtime.js";
import { ApplicationError, type ApplicationMethod, type ApplicationMethodMap, type RuntimeTerminal } from "../shared/application-api.js";
import { validateApplicationInput } from "./application-input.js";
import { createStartupTimer } from "../main/startup-timing.js";
import { listHostDirectories, resolveHostDirectory } from "./host-directories.js";

type Handlers = { [M in ApplicationMethod]: (input: ApplicationMethodMap[M]["input"], clientId: string) => ApplicationMethodMap[M]["result"] | Promise<ApplicationMethodMap[M]["result"]> };
import type { RuntimePaths } from "../shared/types.js";

export class ApplicationRuntime extends EventEmitter<{ event: [string, unknown] }> {
  private readonly tasks = createTaskRuntime((name, payload) => this.emit("event", name, payload));
  readonly core = createCoreRuntime({
    prepareAgentHooks: async (agentId, launch) => {
      if (!hasSessionHooks(agentId)) return {};
      try {
        const config = await loadRuntimeConfig(this.paths);
        if (config.disabledSessionHooks?.includes(agentId)) return { disabled: true };
        const hookCli = path.join(this.paths.userDataPath, "bin", "sharkbay-hook");
        if (agentId !== "kiro" && agentId !== "reasonix"
            && await this.agents.hookConnectors.get(agentId)?.status(hookCli) === "installed") return {};
        return await prepareSessionHookLaunch(agentId, hookCli, launch);
      } catch {
        console.warn(`Unable to prepare SharkBay status hooks for ${agentId}`);
        return {};
      }
    },
    prepareHarness: async (repoPath) => {
      if (await this.isHarnessAutoInstallDisabled(repoPath)) return;
      try { await this.tasks.prepareForAgentLaunch(repoPath); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApplicationError("HARNESS_SETUP_FAILED", `Could not prepare Task Protocol: ${message}`);
      }
    },
  });
  readonly terminals = new TerminalState(this.core, (name, payload) => this.emit("event", name, payload));
  private agents!: ReturnType<typeof createAgentRuntime>;
  private usage!: TokenUsageDb;
  private collector!: TokenUsageCollector;
  private releaseLock?: () => Promise<void>;
  private backfillTimer?: ReturnType<typeof setTimeout>;
  private backfill?: Promise<unknown>;
  private readonly backfillCancellation = new AbortController();
  private telegram?: ReturnType<typeof createRuntimeTelegram>;
  private started = false;
  private disposal?: Promise<void>;
  private readonly handlers: Handlers;
  private readonly pending = new Set<Promise<unknown>>();
  private configQueue: Promise<unknown> = Promise.resolve();

  constructor(readonly paths: Required<RuntimePaths>) {
    super();
    this.paths = Object.freeze({ userDataPath: path.resolve(paths.userDataPath), configPath: path.resolve(paths.configPath) });
    const resolveRepo = (repoPath: string) => resolveRuntimeRepoPath(this.paths, fileURLToLocalPath(repoPath));
    this.handlers = {
      "config.get": () => loadRuntimeConfig(this.paths),
      "config.addProject": async (input) => {
        const value = input.path ?? input.uri;
        if (!value?.trim()) throw new ApplicationError("INVALID_INPUT", "Project path required");
        return addConfiguredProject(this.paths, { path: await resolveHostDirectory(fileURLToLocalPath(value)) });
      },
      "config.cloneProject": async (input) => {
        if (!input.url.trim() || input.url.trim().startsWith("-")) throw new ApplicationError("INVALID_INPUT", "Remote repository URL is required");
        return cloneProject(this.paths, { ...input, parentPath: await resolveHostDirectory(input.parentPath) });
      },
      "config.renameProject": async (input) => { await resolveRepo(fileURLToLocalPath(input.uri)); return renameProject(this.paths, input); },
      "config.removeProject": async (input) => {
        const repoPath = await resolveRepo(fileURLToLocalPath(input.uri ?? input.path ?? ""));
        const config = await removeConfiguredProject(this.paths, input);
        await this.tasks.stopProject(repoPath);
        return config;
      },
      "config.createWorktree": async (input) => createWorktree(this.paths, { ...input, sourceProjectPath: await resolveRepo(input.sourceProjectPath) }),
      "config.openWorktree": async (input) => {
        const workspace = await readGitWorkspace(await resolveRepo(input.repoPath));
        if (!workspace.worktrees.some((worktree) => worktree.path === input.worktreePath && !worktree.prunable)
          || await realpath(input.worktreePath) !== input.worktreePath) {
          throw new ApplicationError("INVALID_INPUT", "The directory is not an available worktree");
        }
        return addConfiguredProject(this.paths, { path: input.worktreePath });
      },
      "config.removeWorktree": async (input) => {
        const repoPath = await resolveRepo(input.repoPath);
        const target = await resolveRepo(input.worktreePath);
        if (target === repoPath || target !== input.worktreePath) throw new ApplicationError("INVALID_INPUT", "Select another worktree before removing this one");
        if ((await this.core.listTerminalSessions()).some((session) => session.status === "running"
          && [session.cwdUri, session.currentCwdUri].some((uri) => uri && isPathInside(target, fileURLToLocalPath(uri))))) {
          throw new ApplicationError("INVALID_INPUT", "Close terminals in this worktree before removing it");
        }
        await removeGitWorktree(repoPath, target);
        return removeConfiguredProject(this.paths, { path: target });
      },
      "config.deleteLocalBranch": async (input) => {
        await deleteLocalBranch(await resolveRepo(input.repoPath), input.branch);
        return loadRuntimeConfig(this.paths);
      },
      "config.setAppearanceTheme": (input) => setAppearanceTheme(this.paths, input),
      "config.setTerminalAppearance": (input) => setTerminalAppearance(this.paths, input),
      "config.setStatusChangeNotifications": (input) => setStatusChangeNotificationsEnabled(this.paths, input),
      "projects.scan": () => this.core.scanProjects(this.paths),
      "projects.listHostDirectories": (input) => listHostDirectories(input.path),
      "projects.getSetupStatus": async (input) => {
        const repoPath = await resolveRepo(input.repoPath);
        const config = await loadRuntimeConfig(this.paths);
        return readProjectSetupStatus(repoPath, this.agents.hookConnectors, path.join(this.paths.userDataPath, "bin", "sharkbay-hook"), config.disabledSessionHooks);
      },
      "projects.getDetail": async (input) => {
        const detail = await this.core.getProjectDetail(this.paths, input);
        void this.tasks.trackProject(detail.displayPath);
        return detail;
      },
      "projects.getGitWorkspace": async (input) => readGitWorkspace(await resolveRepo(input.repoPath)),
      "projects.fetchGitBranches": async (input) => fetchGitBranches(await resolveRepo(input.repoPath)),
      "projects.getGitHub": (input) => this.core.readProjectGitHub(this.paths, input),
      "projects.listFiles": (input) => this.core.listProjectFiles(this.paths, input),
      "projects.readFile": (input) => this.core.readProjectFile(this.paths, input),
      "projects.writeFile": (input) => this.core.writeProjectFile(this.paths, input),
      "projects.deleteFile": (input) => this.core.deleteProjectFile(this.paths, input),
      "projects.renameFile": (input) => this.core.renameProjectFile(this.paths, input),
      "codeGraph.getStatus": (input) => this.core.readCodeGraphStatus(this.paths, input),
      "codeGraph.ensureStatus": (input) => this.core.ensureCodeGraphStatus(this.paths, input),
      "terminal.list": () => this.listTerminals(),
      "terminal.create": async (input, clientId) => {
        const session = await this.core.createTerminal(this.paths, input);
        this.agents.registerCreatedTerminal(session);
        this.terminals.claim(session.id, clientId);
        return session;
      },
      "terminal.claim": async (input, clientId) => { await this.requireTerminal(input.sessionId); return this.terminals.claim(input.sessionId, clientId); },
      "terminal.input": async (input, clientId) => { this.terminals.assertControl(input.sessionId, clientId); const result = this.requireResult(await this.core.inputTerminal(input)); this.agents.hookStateManager.noteTerminalInput(input.sessionId, input.data); return result; },
      "terminal.resize": async (input, clientId) => { await this.terminals.resize(input.sessionId, clientId, input.cols, input.rows); return this.requireTerminal(input.sessionId); },
      "terminal.close": async (input, clientId) => { this.terminals.assertControl(input.sessionId, clientId); const result = this.requireResult(await this.core.closeTerminal(input)); return result; },
      "terminal.recordPrompt": (input, clientId) => { this.terminals.assertControl(input.terminalSessionId, clientId); this.agents.recordPrompt(input); },
      "terminal.recordPromptHistoryEntry": (input) => this.agents.promptStore.record(input.key, input.text),
      "terminal.loadPromptHistory": (input) => this.agents.loadPromptHistory(input.sessionId),
      "artifacts.start": async (input, clientId) => {
        const repoPath = await resolveRepo(input.repoPath);
        const task = (await this.tasks.getTasks(repoPath)).find((task) => task.taskId === input.taskId);
        if (!task) throw new ApplicationError("TASK_NOT_FOUND", "Task no longer exists", 404);
        const cwdUri = toLocalProjectUri(repoPath);
        const agent = (await this.core.listAgentClis(this.paths, { cwdUri })).find((agent) => agent.id === input.agentId);
        if (!agent) throw new ApplicationError("AGENT_NOT_FOUND", "Agent is not installed", 404);
        const artifactPath = await reserveArtifactPath(repoPath, task.taskId);
        try {
          const session = await this.core.createTerminal(this.paths, {
            cwdUri, agentId: agent.id, initialCommand: "'" + (agent.executablePath || agent.command).replaceAll("'", "'\\''") + "'",
            initialCommandTitle: `Artifact ${task.taskId}`,
            artifact: { taskId: task.taskId, status: task.status, sourcePath: path.relative(repoPath, task.sourcePath), agentLabel: task.agent, artifactPath },
          });
          this.agents.registerCreatedTerminal(session); this.terminals.claim(session.id, clientId);
          return session;
        } catch (error) { await rm(path.join(repoPath, artifactPath), { force: true }); throw error; }
      },
      "reviews.start": async (input) => this.agents.reviewRuns().start({ ...input, repoPath: await resolveRepo(input.repoPath), origin: "ui" }),
      "reviews.cancel": (input) => this.agents.reviewRuns().cancel(input.runId),
      "agents.listClis": (input) => this.core.listAgentClis(this.paths, input),
      "agents.listInstallRecipes": (input) => this.core.listInstallRecipes(this.paths, input),
      "agents.installTool": (input) => this.core.installTool(this.paths, input),
      "agents.setHooksEnabled": async (input) => {
        if (!hasSessionHooks(input.agentId)) throw new ApplicationError("UNKNOWN_AGENT", "Unknown agent connector");
        await this.queueConfig(() => setSessionHooksEnabled(this.paths, input.agentId, input.enabled));
      },
      "targets.pathExists": async (input) => { await resolveRepo(input.path); return this.core.pathExistsOnTarget(this.paths, input); },
      "plugins.list": () => this.core.listPlugins(),
      "plugins.setEnabled": async (input) => {
        const config = await setPluginEnabledConfig(this.paths, input.pluginId, input.enabled);
        const plugins = await this.core.setPluginEnabled(input.pluginId, input.enabled);
        if (input.pluginId === CODEGRAPH_PLUGIN_ID && !input.enabled) await this.core.removeCodeGraphIndexes(this.paths, { projectUris: config.configuredProjects.map(toLocalProjectUri) });
        return plugins;
      },
      "diagnostics.read": () => this.core.readDiagnostics(),
      "protocol.getTasks": async (input) => this.tasks.getTasks(await resolveRepo(input.repoPath)),
      "protocol.getStatus": async (input) => {
        const repoPath = await resolveRepo(input.repoPath);
        const status = await this.tasks.getStatus(repoPath);
        return status.installed ? status : { ...status, autoInstallDisabled: await this.isHarnessAutoInstallDisabled(repoPath) };
      },
      "protocol.install": async (input) => this.installProtocol(await resolveRepo(input.repoPath)),
      "protocol.enable": async (input) => this.installProtocol(await resolveRepo(input.repoPath)),
      "protocol.uninstall": async (input) => {
        const repoPath = await resolveRepo(input.repoPath);
        return this.tasks.uninstall(repoPath, input.cleanTeamContext,
          () => this.queueConfig(() => setProtocolAutoInstallDisabled(this.paths, repoPath, true)));
      },
      "protocol.resolveIdentity": () => resolveGitHubIdentity(),
      "protocol.syncNow": async (input) => this.tasks.syncNow(await resolveRepo(input.repoPath)),
      "protocol.updateHarness": async (input) => this.tasks.updateHarness(await resolveRepo(input.repoPath)),
      "hooks.getSessions": async (input) => parseHookSessions(await resolveRepo(input.repoPath)),
      "usage.getSummary": async (input) => this.usage.getSummary(input?.periodDays ?? 1, (await loadRuntimeConfig(this.paths)).configuredProjects),
      "usage.getReport": async (input) => this.usage.getReport(input ?? {}, (await loadRuntimeConfig(this.paths)).configuredProjects),
    };
  }

  async start(prepare?: () => Promise<void>): Promise<void> {
    const startup = createStartupTimer("runtime");
    if (this.started || this.disposal) throw new Error("Runtime can only be started once");
    this.releaseLock = await acquireProfileLock(this.paths);
    startup("profile-lock-acquired");
    try {
      await prepare?.();
      const config = await loadRuntimeConfig(this.paths);
      startup("config-loaded");
      await this.core.applyDisabledPlugins(config.disabledPluginIds);
      const socketDir = path.join("/tmp", `sharkbay-${createHash("sha256").update(this.paths.userDataPath).digest("hex").slice(0, 12)}`);
      await mkdir(socketDir, { recursive: true, mode: 0o700 });
      this.usage = new TokenUsageDb(this.paths.userDataPath);
      startup("usage-db-ready");
      this.collector = new TokenUsageCollector(this.usage);
      this.agents = createAgentRuntime(this.paths, this.core, {
        socketDir,
        resolveRepoPath: (value) => resolveRuntimeRepoPath(this.paths, value),
        emit: (name, payload) => { if (name !== "terminal:data") this.emit("event", name, payload); },
      });
      this.telegram = createRuntimeTelegram(this.paths, this.core, this.agents, (name, payload) => this.emit("event", name, payload));
      this.agents.agentSessionWatcher.setUsageCollector(this.collector);
      await this.agents.start();
      startup("agents-ready");
      this.backfillTimer = setTimeout(() => { this.backfill = this.collector.backfill(this.backfillCancellation.signal).catch((error) => console.error("Usage backfill:", error)); }, 5000);
      this.backfillTimer.unref();
      this.started = true;
      startup("core-ready");
      if (config.telegram?.enabled) {
        startup("telegram-init-started");
        void this.telegram.init().then(() => startup("telegram-init-finished"), () => {
          startup("telegram-init-failed");
          console.error("Telegram initialization failed");
        });
      }
    } catch (error) { await this.dispose(); throw error; }
  }

  async execute(method: string, value: unknown, clientId: string): Promise<unknown> {
    if (!this.started || this.disposal) throw new ApplicationError("RUNTIME_UNAVAILABLE", "Runtime is not ready", 503);
    const input = validateApplicationInput(method, value);
    const handler = this.handlers[method as ApplicationMethod] as (input: unknown, clientId: string) => unknown;
    const action = () => Promise.resolve(handler(input, clientId));
    const operation = (method.startsWith("config.") || method === "plugins.setEnabled" ? this.queueConfig(action) : Promise.resolve().then(action)).then(async (result) => {
      if (method.startsWith("config.") && method !== "config.get") this.emit("event", "runtime:config", method === "config.cloneProject" ? await loadRuntimeConfig(this.paths) : result);
      return result;
    });
    this.pending.add(operation);
    try { return await operation; } finally { this.pending.delete(operation); }
  }

  private queueConfig<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.configQueue.then(action);
    this.configQueue = operation.catch(() => {});
    return operation;
  }

  private async isHarnessAutoInstallDisabled(repoPath: string): Promise<boolean> {
    return (await loadRuntimeConfig(this.paths)).protocolAutoInstallDisabled?.includes(repoPath) ?? false;
  }

  private async installProtocol(repoPath: string) {
    const status = await this.tasks.install(repoPath);
    await this.queueConfig(() => setProtocolAutoInstallDisabled(this.paths, repoPath, false));
    return status;
  }

  async executeLocal(method: string, input: any, clientId: string): Promise<unknown> {
    if (!this.started || this.disposal) throw new ApplicationError("RUNTIME_UNAVAILABLE", "Runtime is not ready", 503);
    const operation = this.executeLocalCommand(method, input, clientId);
    this.pending.add(operation);
    try { return await operation; } finally { this.pending.delete(operation); }
  }

  private async executeLocalCommand(method: string, input: any, clientId: string): Promise<unknown> {
    if (!this.started || this.disposal) throw new ApplicationError("RUNTIME_UNAVAILABLE", "Runtime is not ready", 503);
    // Host-only administration stays on the owner-only local control socket.
    if (method === "config.setIslandEnabled") {
      if (typeof input?.enabled !== "boolean") throw new Error("Enabled required");
      const config = await this.queueConfig(() => setIslandEnabled(this.paths, input));
      this.emit("event", "runtime:config", config);
      return config;
    }
    if (method === "config.setCaffeinateMode") {
      if (!["off", "on", "auto"].includes(input?.mode)) throw new Error("Invalid power mode");
      return this.queueConfig(() => setCaffeinateMode(this.paths, input));
    }
    if (method === "desktop.tabs") { if (!Array.isArray(input)) throw new Error("Tabs required"); this.telegram?.setTabs(input); return; }
    if (method === "desktop.sessions") return this.agents.getStatuses();
    const telegram = this.telegram?.service;
    if (method.startsWith("telegram.")) {
      if (!telegram) throw new Error("Telegram is not ready");
      await this.telegram!.init();
      switch (method) {
        case "telegram.getConfig": return telegram.getConfigView();
        case "telegram.setToken": if (typeof input?.token !== "string") throw new Error("Token required"); return telegram.setToken(input.token);
        case "telegram.setEnabled": if (typeof input?.enabled !== "boolean") throw new Error("Enabled required"); await telegram.setEnabled(input.enabled); return telegram.getConfigView();
        case "telegram.generatePairCode": return telegram.generatePairCode();
        case "telegram.revokeUser": if (!Number.isSafeInteger(input?.telegramUserId)) throw new Error("User id required"); await telegram.revokeUser(input.telegramUserId); return telegram.getConfigView();
      }
    }
    if (method === "terminal.create") {
      if (input?.artifact) return this.execute("artifacts.start", { repoPath: fileURLToLocalPath(input.cwdUri), taskId: input.artifact.taskId, agentId: input.agentId }, clientId);
      const { protocolBootstrap: _bootstrap, review: _review, artifact: _artifact, ...command } = input ?? {};
      return this.execute(method, command, clientId);
    }
    if (method === "reviews.start") return this.execute(method, { repoPath: input.repoPath, taskId: input.taskId, agentId: input.agentId }, clientId);
    return this.execute(method, input, clientId);
  }

  async requireTerminal(sessionId: string) {
    return this.requireResult((await this.core.listTerminalSessions()).find((session) => session.id === sessionId));
  }
  private requireResult<T>(value: T | null | undefined): T {
    if (value == null) throw new ApplicationError("UNKNOWN_TERMINAL", "Terminal session no longer exists", 404);
    return value;
  }
  private async listTerminals(): Promise<RuntimeTerminal[]> {
    const config = await loadRuntimeConfig(this.paths);
    return (await this.core.listTerminalSessions()).map((session) => {
      const cwd = fileURLToLocalPath(session.cwdUri);
      const project = [...config.configuredProjects].sort((a, b) => b.length - a.length).find((root) => cwd === root || isPathInside(root, cwd)) ?? cwd;
      const projectUri = toLocalProjectUri(project);
      return { session, projectUri, projectName: config.projectAliases[projectUri] ?? path.basename(project), displayPath: project, ownerId: this.terminals.owner(session.id) };
    });
  }

  async readPreview(url: string): Promise<{ content: string; name: string }> {
    if (!url.startsWith("file:")) throw new ApplicationError("INVALID_ARTIFACT", "Only host project HTML files can be previewed");
    const file = await realpath(fileURLToPath(url));
    await resolveRuntimeRepoPath(this.paths, path.dirname(file));
    if (path.extname(file).toLowerCase() !== ".html") throw new ApplicationError("INVALID_ARTIFACT", "Only HTML previews are supported");
    if ((await stat(file)).size > 4 * 1024 * 1024) throw new ApplicationError("ARTIFACT_TOO_LARGE", "HTML preview is too large", 413);
    return { content: await readFile(file, "utf8"), name: path.basename(file) };
  }

  dispose(): Promise<void> {
    return this.disposal ??= (async () => {
      clearTimeout(this.backfillTimer);
      this.backfillCancellation.abort();
      const errors: unknown[] = [];
      for (const cleanup of [
        () => this.core.stopJobs(), () => this.core.cancelAllCodeGraphJobs(), () => Promise.allSettled([...this.pending]),
        () => this.tasks.stop(), () => this.telegram?.dispose(), () => this.agents?.stop(), () => this.backfill,
        () => this.collector?.dispose(), () => this.core.dispose(), () => this.terminals.dispose(),
        () => this.usage?.close(), () => this.releaseLock?.(),
      ]) { try { await cleanup(); } catch (error) { errors.push(error); } }
      if (errors.length) throw new AggregateError(errors, "Runtime cleanup failed");
    })();
  }
}

function fileURLToLocalPath(value: string): string {
  return value.startsWith("local:") ? decodeURI(value.slice(6)) : value.startsWith("file:") ? fileURLToPath(value) : value;
}
