/**
 * AgentHookStateManager — aggregates hook events into per-project three-state status.
 *
 * States: working (green) / idle (yellow) / attention (red)
 * Emits state changes via EventEmitter for IPC relay to renderer.
 */

import { EventEmitter } from "node:events";

import type { AgentConnector, AgentHookState, AgentHookStatus, HookBridgeMessage, UnifiedHookEvent } from "./types.js";

export type HookStateEvent = {
  projectPath: string;
  state: AgentHookState;
  action: string;
  agent: string;
  timestamp: string;
};

export type StateManagerEvents = {
  stateChange: [HookStateEvent];
};

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ACTION_DEBOUNCE_MS = 200;

export class AgentHookStateManager extends EventEmitter<StateManagerEvents> {
  private states = new Map<string, AgentHookStatus & { agent: string; pendingAction: string | null; debounceTimer: ReturnType<typeof setTimeout> | null }>();
  private connectors = new Map<string, AgentConnector>();
  private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();

  registerConnector(connector: AgentConnector): void {
    this.connectors.set(connector.id, connector);
  }

  handleMessage(msg: HookBridgeMessage): void {
    const connector = this.connectors.get(msg.source);
    if (!connector) return;

    const event = connector.normalize(msg.payload);
    if (!event || !event.cwd) return;

    this.applyEvent(event);
  }

  getStatus(projectPath: string): HookStateEvent | null {
    const entry = this.states.get(projectPath);
    if (!entry) return null;
    return { projectPath, state: entry.state, action: entry.action, agent: entry.agent, timestamp: new Date(entry.lastUpdate).toISOString() };
  }

  dispose(): void {
    this.timeoutTimers.forEach((timer) => clearTimeout(timer));
    this.states.forEach((entry) => {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    });
    this.timeoutTimers.clear();
    this.states.clear();
  }

  private applyEvent(event: UnifiedHookEvent): void {
    const projectPath = event.cwd!;
    const now = Date.now();
    const newState = this.eventToState(event.event);
    const newAction = this.eventToAction(event);

    const existing = this.states.get(projectPath);
    const stateChanged = !existing || existing.state !== newState;

    if (!existing) {
      this.states.set(projectPath, { state: newState, action: newAction, lastUpdate: now, agent: event.agent, pendingAction: null, debounceTimer: null });
    } else {
      existing.state = newState;
      existing.lastUpdate = now;
      existing.agent = event.agent;
      if (stateChanged) {
        existing.action = newAction;
      } else {
        // Same state, debounce action text updates
        existing.pendingAction = newAction;
        if (!existing.debounceTimer) {
          existing.debounceTimer = setTimeout(() => {
            existing.debounceTimer = null;
            if (existing.pendingAction !== null) {
              existing.action = existing.pendingAction;
              existing.pendingAction = null;
              this.emitState(projectPath);
            }
          }, ACTION_DEBOUNCE_MS);
          existing.debounceTimer.unref?.();
        }
        this.resetTimeout(projectPath);
        return;
      }
    }

    this.emitState(projectPath);
    this.resetTimeout(projectPath);
  }

  private eventToState(event: UnifiedHookEvent["event"]): AgentHookState {
    switch (event) {
      case "session_start":
        return "idle";
      case "prompt":
      case "tool_start":
      case "tool_end":
        return "working";
      case "turn_end":
      case "session_end":
        return "idle";
      case "attention":
        return "attention";
    }
  }

  private eventToAction(event: UnifiedHookEvent): string {
    switch (event.event) {
      case "tool_start":
        return event.tool ? `${capitalize(event.agent)}: ${event.tool.name}` : "";
      case "tool_end":
        return event.tool ? `${capitalize(event.agent)}: ${event.tool.name} done` : "";
      case "attention":
        return event.prompt ? `${capitalize(event.agent)}: ${oneLine(event.prompt)}` : "Awaiting attention";
      case "prompt":
        return `${capitalize(event.agent)}: processing`;
      case "turn_end":
      case "session_end":
      case "session_start":
        return "";
    }
  }

  private emitState(projectPath: string): void {
    const entry = this.states.get(projectPath);
    if (!entry) return;
    this.emit("stateChange", { projectPath, state: entry.state, action: entry.action, agent: entry.agent, timestamp: new Date(entry.lastUpdate).toISOString() });
  }

  private resetTimeout(projectPath: string): void {
    const existing = this.timeoutTimers.get(projectPath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const entry = this.states.get(projectPath);
      if (entry && entry.state !== "idle") {
        entry.state = "idle";
        entry.action = "";
        entry.lastUpdate = Date.now();
        this.emitState(projectPath);
      }
    }, TIMEOUT_MS);
    timer.unref?.();
    this.timeoutTimers.set(projectPath, timer);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 180);
}
