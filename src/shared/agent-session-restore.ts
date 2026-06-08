import type { AgentCli } from "./types.js";

export type AgentSessionRestoreAgentId = "codex" | "claude" | "gemini" | "kiro" | "codewhale" | "qwen" | "opencode" | "cursor";

export type AgentSessionRestoreCommand = {
  agentId: AgentSessionRestoreAgentId;
  hookSessionId: string;
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
  { id: "codewhale", label: "CodeWhale", shortLabel: "D", defaultCommand: "codewhale", match: /\bcodewhale\b|\bcode\s*whale\b|\bdeepseek\b/u },
  { id: "qwen", label: "Qwen Code", shortLabel: "Q", defaultCommand: "qwen", match: /\bqwen\b|\bqianwen\b/u },
  { id: "opencode", label: "OpenCode", shortLabel: "O", defaultCommand: "opencode", match: /\bopen\s*code\b|\bopencode\b/u },
  { id: "cursor", label: "Cursor CLI", shortLabel: "Cu", defaultCommand: "cursor-agent", match: /\bcursor\b/u },
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
  launchFlags?: string[];
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
    hookSessionId: sessionId,
    label: detectedAgent?.label || definition.label,
    shortLabel: detectedAgent?.shortLabel || definition.shortLabel,
    command: restoreCommand(definition.id, executable, sessionId, input.launchFlags),
    title: `Restore ${detectedAgent?.label || definition.label}`,
  };
}

function restoreCommand(agentId: AgentSessionRestoreAgentId, executable: string, sessionId: string, launchFlags: string[] = []): string {
  const command = shellQuote(executable);
  const id = shellQuote(sessionId);
  const restoredSessionEnv = `SHARKBAY_RESTORED_SESSION_ID=${id}`;
  const flags = launchFlags.filter((flag) => flag.trim()).join(" ");
  const commandWithFlags = flags ? `${command} ${flags}` : command;
  if (agentId === "codex") return `${restoredSessionEnv} ${commandWithFlags} resume ${id}`;
  if (agentId === "claude") return `${restoredSessionEnv} ${commandWithFlags} --resume ${id}`;
  if (agentId === "gemini" || agentId === "qwen") return `${restoredSessionEnv} ${commandWithFlags} --resume ${id}`;
  if (agentId === "kiro") return `${restoredSessionEnv} ${command} chat ${flags ? `${flags} ` : ""}--resume-id ${id}`;
  if (agentId === "codewhale") return `${restoredSessionEnv} ${commandWithFlags} resume ${id}`;
  if (agentId === "cursor") return `${restoredSessionEnv} ${commandWithFlags} --resume ${id}`;
  return `${restoredSessionEnv} ${commandWithFlags} --session ${id}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
