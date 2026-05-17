import type { ToolProfile } from "../../shared/types.js";
import type { InstallRecipe } from "../../shared/types.js";
import type { BundledPlugin, MachineDetector } from "../plugin-host.js";

const pluginId = "com.sharkbay.agents";

export function agentBundledPlugin(): BundledPlugin {
  return {
    manifest: {
      id: pluginId,
      name: "Agent CLI Detection",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      capabilities: [
        { kind: "agent:detect" },
        { kind: "profile:machine" },
        { kind: "install:software", requiresConfirmation: true },
      ],
      contributes: {
        machineDetectors: [{ id: "agents.machine", label: "Agent CLI Detector" }],
        installers: [{ id: "agents.npm", label: "Install agents via npm" }],
      },
    },
    register(api) {
      api.registerMachineDetector(createAgentMachineDetector());
      for (const recipe of createAgentInstallRecipes()) api.registerInstallRecipe(recipe);
    },
  };
}

const agentDefinitions = [
  { id: "codex", command: "codex" },
  { id: "claude", command: "claude" },
  { id: "gemini", command: "gemini" },
  { id: "kiro", command: "kiro-cli" },
  { id: "deepseek", command: "deepseek" },
  { id: "qwen", command: "qwen" },
  { id: "opencode", command: "opencode" },
];

export function createAgentMachineDetector(): MachineDetector {
  return {
    id: "agents.machine",
    pluginId,
    label: "Agent CLI Detector",
    runOn: ["standard", "deep"],
    async run(ctx) {
      const agents = await Promise.all(agentDefinitions.map(async (agent): Promise<ToolProfile> => {
        const executablePath = await ctx.which(agent.command);
        const version = executablePath ? await readVersion(ctx, agent.command) : null;
        return {
          id: agent.id,
          command: agent.command,
          available: Boolean(executablePath),
          path: executablePath,
          version,
          sourcePluginId: pluginId,
        };
      }));
      return { agents };
    },
  };
}

export function createAgentInstallRecipes(): InstallRecipe[] {
  return [
    npmGlobalRecipe("codex", "Install Codex CLI with npm", "npm install -g @openai/codex"),
    npmGlobalRecipe("claude", "Install Claude Code with npm", "npm install -g @anthropic-ai/claude-code"),
    npmGlobalRecipe("gemini", "Install Gemini CLI with npm", "npm install -g @google/gemini-cli"),
    npmGlobalRecipe("opencode", "Install OpenCode with npm", "npm install -g opencode-ai"),
  ];
}

async function readVersion(ctx: Parameters<MachineDetector["run"]>[0], command: string): Promise<string | null> {
  const result = await ctx.run(`${shellQuote(command)} --version 2>/dev/null || true`, { timeoutMs: 3000 }).catch(() => null);
  const firstLine = result?.stdout.trim().split(/\r?\n/u)[0]?.trim();
  return firstLine || null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function npmGlobalRecipe(toolId: string, label: string, command: string): InstallRecipe {
  return {
    id: `${toolId}.npm.global`,
    toolId,
    label,
    targetKinds: ["local", "ssh"],
    platforms: ["darwin", "linux", "unknown"],
    preconditions: [{ tool: "npm", available: true }],
    steps: [{ kind: "command", command, description: label }],
    verification: { command: toolId, args: ["--version"] },
  };
}
