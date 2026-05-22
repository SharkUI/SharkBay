import type { AgentCli } from "./types.js";

export type AgentSessionRestoreAgentId = "codex" | "claude" | "gemini" | "kiro" | "deepseek" | "qwen" | "opencode";

export type AgentSessionRestoreCommand = {
  agentId: AgentSessionRestoreAgentId;
  label: string;
  shortLabel: string;
  command: string;
  title: string;
};

type AgentSessionRestoreDefinition = {
  id: AgentSessionRestoreAgentId;
  label: string;
  shortLabel: string;
  defaultCommand: string;
  match: RegExp;
};

const restoreDefinitions: AgentSessionRestoreDefinition[] = [
  { id: "codex", label: "Codex CLI", shortLabel: "Cx", defaultCommand: "codex", match: /\bcodex\b/u },
  { id: "kiro", label: "Kiro CLI", shortLabel: "K", defaultCommand: "kiro-cli", match: /\bkiro\b/u },
  { id: "claude", label: "Claude Code", shortLabel: "Cl", defaultCommand: "claude", match: /\bclaude\b/u },
  { id: "gemini", label: "Gemini CLI", shortLabel: "G", defaultCommand: "gemini", match: /\bgemini\b/u },
  { id: "deepseek", label: "DeepSeek TUI", shortLabel: "D", defaultCommand: "deepseek", match: /\bdeep\s*seek\b|\bdeepseek\b/u },
  { id: "qwen", label: "Qwen Code", shortLabel: "Q", defaultCommand: "qwen", match: /\bqwen\b|\bqianwen\b/u },
  { id: "opencode", label: "OpenCode", shortLabel: "O", defaultCommand: "opencode", match: /\bopen\s*code\b|\bopencode\b/u },
];

export function inferAgentSessionRestoreAgent(agentName: string | null | undefined): AgentSessionRestoreAgentId | null {
  const normalized = agentName?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  return restoreDefinitions.find((definition) => definition.match.test(normalized))?.id ?? null;
}

export function buildAgentSessionRestoreCommand(input: {
  agentName: string | null | undefined;
  sessionId: string | null | undefined;
  availableAgents?: AgentCli[];
}): AgentSessionRestoreCommand | null {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) return null;

  const agentId = inferAgentSessionRestoreAgent(input.agentName);
  const definition = agentId ? restoreDefinitions.find((item) => item.id === agentId) ?? null : null;
  if (!definition) return null;

  const detectedAgent = input.availableAgents?.find((agent) => agent.id === definition.id);
  const executable = detectedAgent?.executablePath || detectedAgent?.command || definition.defaultCommand;
  return {
    agentId: definition.id,
    label: detectedAgent?.label || definition.label,
    shortLabel: detectedAgent?.shortLabel || definition.shortLabel,
    command: restoreCommand(definition.id, executable, sessionId),
    title: `Restore ${detectedAgent?.label || definition.label}`,
  };
}

function restoreCommand(agentId: AgentSessionRestoreAgentId, executable: string, sessionId: string): string {
  const command = shellQuote(executable);
  const id = shellQuote(sessionId);
  if (agentId === "codex") return `${command} resume ${id}`;
  if (agentId === "claude") return `${command} --resume ${id}`;
  if (agentId === "gemini" || agentId === "qwen") return `${command} --resume ${id}`;
  if (agentId === "kiro") return `${command} chat --resume-id ${id}`;
  if (agentId === "deepseek") return `${command} resume ${id}`;
  return `${command} --session ${id}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
