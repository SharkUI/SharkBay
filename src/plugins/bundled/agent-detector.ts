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
      // Use login shell (-l) so that ~/.nvm, ~/.bashrc, ~/.zshrc PATH entries are loaded
      const commands = agentDefinitions.map((agent) => agent.command);
      const batchScript = commands
        .map((cmd) => `printf '%s\\t%s\\n' '${cmd}' "$(command -v '${cmd}' 2>/dev/null || true)"`)
        .join("; ");
      // Use the user's default login shell so PATH from ~/.zshrc, ~/.bashrc, nvm, etc. is loaded
      const wrappedScript = `$SHELL -l -c ${shellQuote(batchScript)} 2>/dev/null || bash -l -c ${shellQuote(batchScript)} 2>/dev/null || sh -l -c ${shellQuote(batchScript)}`;
      const batchResult = await ctx.run(wrappedScript, { timeoutMs: 10000 }).catch((err) => {
        console.error("[agent-detector] batch which failed:", err instanceof Error ? err.message : err);
        return null;
      });

      console.log("[agent-detector] batch stdout:", JSON.stringify(batchResult?.stdout?.slice(0, 500) ?? null));
      console.log("[agent-detector] batch stderr:", JSON.stringify(batchResult?.stderr?.slice(0, 300) ?? null));

      const foundPaths = new Map<string, string>();
      if (batchResult?.stdout) {
        for (const line of batchResult.stdout.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const [command, ...rest] = line.split("\t");
          const remotePath = rest.join("\t").trim();
          if (command && remotePath) foundPaths.set(command, remotePath);
        }
      }

      console.log("[agent-detector] found:", [...foundPaths.entries()].map(([k, v]) => `${k}=${v}`).join(", ") || "(none)");

      // Batch version detection for found agents in a single command
      const foundAgents = agentDefinitions.filter((agent) => foundPaths.has(agent.command));
      const versions = new Map<string, string>();
      if (foundAgents.length) {
        const versionScript = foundAgents
          .map((agent) => {
            const p = foundPaths.get(agent.command)!;
            return `printf '%s\\t%s\\n' '${agent.command}' "$(${shellQuote(p)} --version 2>/dev/null | head -1 || true)"`;
          })
          .join("; ");
        const wrappedVersionScript = `$SHELL -l -c ${shellQuote(versionScript)} 2>/dev/null || bash -l -c ${shellQuote(versionScript)} 2>/dev/null || sh -l -c ${shellQuote(versionScript)}`;
        const versionResult = await ctx.run(wrappedVersionScript, { timeoutMs: 10000 }).catch(() => null);
        if (versionResult?.stdout) {
          for (const line of versionResult.stdout.split(/\r?\n/)) {
            if (!line.trim()) continue;
            const [command, ...rest] = line.split("\t");
            const ver = rest.join("\t").trim();
            if (command && ver) versions.set(command, ver);
          }
        }
      }

      const agents: ToolProfile[] = agentDefinitions.map((agent) => {
        const executablePath = foundPaths.get(agent.command) || null;
        return {
          id: agent.id,
          command: agent.command,
          available: Boolean(executablePath),
          path: executablePath,
          version: versions.get(agent.command) || null,
          sourcePluginId: pluginId,
        };
      });
      return { agents };
    },
  };
}

export function createAgentInstallRecipes(): InstallRecipe[] {
  return [
    npmGlobalRecipe("codex", "Install Codex CLI with npm", "npm install -g @openai/codex"),
    npmGlobalRecipe("claude", "Install Claude Code with npm", "npm install -g @anthropic-ai/claude-code"),
    npmGlobalRecipe("gemini", "Install Gemini CLI with npm", "npm install -g @google/gemini-cli"),
    {
      id: "kiro.official.script",
      toolId: "kiro",
      label: "Install Kiro CLI with official script",
      targetKinds: ["local", "ssh"],
      platforms: ["darwin", "linux"],
      preconditions: [{ tool: "curl", available: true }],
      steps: [{
        kind: "command",
        command: "curl -fsSL https://cli.kiro.dev/install | bash",
        description: "Install Kiro CLI with official script",
      }],
      verification: { command: "kiro-cli", args: ["--version"] },
    },
    npmGlobalRecipe("deepseek", "Install DeepSeek TUI with npm", "npm install -g deepseek-tui"),
    npmGlobalRecipe("qwen", "Install Qwen Code with npm", "npm install -g @qwen-code/qwen-code"),
    npmGlobalRecipe("opencode", "Install OpenCode with npm", "npm install -g opencode-ai"),
  ];
}

async function readVersion(ctx: Parameters<MachineDetector["run"]>[0], executablePath: string): Promise<string | null> {
  const result = await ctx.run(`${shellQuote(executablePath)} --version 2>/dev/null || true`, { timeoutMs: 3000 }).catch(() => null);
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
