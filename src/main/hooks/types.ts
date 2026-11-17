import type { AgentDisplayState, AgentOutcome, AgentStatusEvidence } from "../../shared/agent-status.js";
/**
 * Hook-based agent status system — core type definitions.
 *
 * See .sharkbay/specs/hook-based-agent-status/design.md for architecture details.
 */

// ---------------------------------------------------------------------------
// Unified hook event (normalized from all agent protocols)
// ---------------------------------------------------------------------------

export type HookEventKind =
  | "session_start"
  | "prompt"
  | "tool_start"
  | "tool_end"
  | "turn_end"
  | "session_end"
  | "attention";

export type UnifiedHookEvent = {
  agent: string;
  sessionId: string;
  event: HookEventKind;
  timestamp: string;
  toolUseId?: string;
  turnId?: string;
  transcriptPath?: string;
  backgroundAgents?: boolean;
  backgroundCommands?: boolean;
  activeCrons?: boolean;
  childId?: string;
  childEvent?: "start" | "stop";
  elicitation?: { phase: "request" | "result"; id?: string; server?: string };
  outcome?: AgentOutcome;
  sessionBoundary?: boolean;
  tool?: { name: string; input?: unknown; response?: unknown };
  prompt?: string;
  cwd?: string;
  pid?: number;
  terminalSessionId?: string;
  launchToken?: string;
};

// ---------------------------------------------------------------------------
// Agent hook state (three-state model)
// ---------------------------------------------------------------------------

export type AgentHookState = AgentDisplayState;

export type AgentHookStatus = {
  state: AgentHookState;
  action: string;
  lastUpdate: number;
  evidence?: AgentStatusEvidence;
};

// ---------------------------------------------------------------------------
// Connector interface
// ---------------------------------------------------------------------------

export type ConnectorStatus = "installed" | "not_installed" | "outdated" | "agent_missing";

export interface AgentConnector {
  readonly id: string;
  readonly displayName: string;
  readonly supportedEvents: readonly HookEventKind[];

  detect(): Promise<boolean>;
  install(hookCliPath: string, socketPath: string): Promise<void>;
  uninstall(): Promise<void>;
  status(expectedHookCliPath?: string): Promise<ConnectorStatus>;
  normalize(raw: unknown): UnifiedHookEvent | null;
}

// ---------------------------------------------------------------------------
// Bridge message (wire format between hook CLI and HookBridge)
// ---------------------------------------------------------------------------

export type HookBridgeMessage = {
  source: string;
  payload: unknown;
  terminalSessionId?: string;
  launchToken?: string;
  pid?: number;
};
