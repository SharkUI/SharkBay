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
  tool?: { name: string; input?: unknown; response?: unknown };
  prompt?: string;
  cwd?: string;
  pid?: number;
};

// ---------------------------------------------------------------------------
// Agent hook state (three-state model)
// ---------------------------------------------------------------------------

export type AgentHookState = "working" | "stopped" | "approval";

export type AgentHookStatus = {
  state: AgentHookState;
  action: string;
  lastUpdate: number;
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
  status(): Promise<ConnectorStatus>;
  normalize(raw: unknown): UnifiedHookEvent | null;
}

// ---------------------------------------------------------------------------
// Bridge message (wire format between hook CLI and HookBridge)
// ---------------------------------------------------------------------------

export type HookBridgeMessage = {
  source: string;
  payload: unknown;
  pid?: number;
};
