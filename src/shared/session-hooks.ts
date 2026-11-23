const sessionHookAgents = new Set(["codex", "claude", "cursor", "gemini", "kiro", "opencode", "qwen", "reasonix"]);

export function hasSessionHooks(agentId: string): boolean {
  return sessionHookAgents.has(agentId);
}
