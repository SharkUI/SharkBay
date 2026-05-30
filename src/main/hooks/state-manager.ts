/**
 * AgentHookStateManager — aggregates hook events into per-project three-state status.
 *
 * States: working (green) / idle (yellow) / attention (red)
 * Emits state changes via EventEmitter for IPC relay to renderer.
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";

import type { AgentConnector, AgentHookState, AgentHookStatus, HookBridgeMessage, UnifiedHookEvent } from "./types.js";

export type HookStateEvent = {
  projectPath: string;
  sessionId: string;
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
const MAX_LOG_STRING_LENGTH = 2000;
const MAX_LOG_ARRAY_ITEMS = 25;
const MAX_LOG_OBJECT_KEYS = 50;

export class AgentHookStateManager extends EventEmitter<StateManagerEvents> {
  private states = new Map<string, AgentHookStatus & { agent: string; sessionId: string; projectPath: string; pendingAction: string | null; debounceTimer: ReturnType<typeof setTimeout> | null }>();
  private connectors = new Map<string, AgentConnector>();
  private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();

  registerConnector(connector: AgentConnector): void {
    this.connectors.set(connector.id, connector);
  }

  handleMessage(msg: HookBridgeMessage): void {
    const receivedAt = new Date().toISOString();
    const rawProjectPath = projectPathFromRawPayload(msg.payload);
    const connector = this.connectors.get(msg.source);
    if (!connector) {
      writeHookLog(rawProjectPath, {
        timestamp: receivedAt,
        source: msg.source,
        payload: sanitizeForHookLog(msg.payload),
        dropReason: "unknown_source",
      });
      return;
    }

    const event = connector.normalize(msg.payload);
    if (!event) {
      writeHookLog(rawProjectPath, {
        timestamp: receivedAt,
        source: msg.source,
        payload: sanitizeForHookLog(msg.payload),
        dropReason: "normalize_null",
      });
      return;
    }
    if (!event.cwd) {
      writeHookLog(rawProjectPath, {
        timestamp: receivedAt,
        source: msg.source,
        payload: sanitizeForHookLog(msg.payload),
        normalized: summarizeUnifiedEvent(event),
        dropReason: "missing_cwd",
      });
      return;
    }

    const state = this.eventToState(event.event);
    const action = this.eventToAction(event);
    writeHookLog(event.cwd, {
      timestamp: receivedAt,
      source: msg.source,
      payload: sanitizeForHookLog(msg.payload),
      normalized: summarizeUnifiedEvent(event),
      state,
      action,
    });

    this.applyEvent(event);
  }

  getStatus(projectPath: string): HookStateEvent | null {
    for (const entry of this.states.values()) {
      if (entry.projectPath === projectPath) {
        return { projectPath, sessionId: entry.sessionId, state: entry.state, action: entry.action, agent: entry.agent, timestamp: new Date(entry.lastUpdate).toISOString() };
      }
    }
    return null;
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
    const sessionId = event.sessionId;
    const stateKey = `${projectPath}\0${sessionId}`;
    const now = Date.now();
    const newState = this.eventToState(event.event);
    const newAction = this.eventToAction(event);

    const existing = this.states.get(stateKey);
    const stateChanged = !existing || existing.state !== newState;

    if (!existing) {
      this.states.set(stateKey, { state: newState, action: newAction, lastUpdate: now, agent: event.agent, sessionId, projectPath, pendingAction: null, debounceTimer: null });
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
              this.emitState(stateKey);
            }
          }, ACTION_DEBOUNCE_MS);
          existing.debounceTimer.unref?.();
        }
        this.resetTimeout(stateKey);
        return;
      }
    }

    this.emitState(stateKey);
    this.resetTimeout(stateKey);
  }

  private eventToState(event: UnifiedHookEvent["event"]): AgentHookState {
    switch (event) {
      case "session_start":
        return "idle";
      case "prompt":
      case "tool_start":
        return "working";
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
        return "";
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

  private emitState(stateKey: string): void {
    const entry = this.states.get(stateKey);
    if (!entry) return;
    this.emit("stateChange", { projectPath: entry.projectPath, sessionId: entry.sessionId, state: entry.state, action: entry.action, agent: entry.agent, timestamp: new Date(entry.lastUpdate).toISOString() });
  }

  private resetTimeout(stateKey: string): void {
    const existing = this.timeoutTimers.get(stateKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const entry = this.states.get(stateKey);
      if (entry && entry.state !== "idle") {
        entry.state = "idle";
        entry.action = "";
        entry.lastUpdate = Date.now();
        this.emitState(stateKey);
      }
    }, TIMEOUT_MS);
    timer.unref?.();
    this.timeoutTimers.set(stateKey, timer);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 180);
}

function writeHookLog(projectPath: string | null, entry: Record<string, unknown>): void {
  if (!projectPath || !path.isAbsolute(projectPath)) return;
  const logPath = path.join(projectPath, ".sharkbay", "logs", "hooks.log");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Hook logging is diagnostic-only and must never affect agent execution.
  }
}

function summarizeUnifiedEvent(event: UnifiedHookEvent): Record<string, unknown> {
  return {
    agent: event.agent,
    sessionId: event.sessionId,
    event: event.event,
    timestamp: event.timestamp,
    tool: event.tool ? sanitizeForHookLog(event.tool) : undefined,
    prompt: event.prompt,
    cwd: event.cwd,
  };
}

function projectPathFromRawPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const event = record.event && typeof record.event === "object" && !Array.isArray(record.event)
    ? record.event as Record<string, unknown>
    : null;
  return readPath(record, "cwd")
    ?? readPath(record, "workspace")
    ?? readPath(record, "current_working_directory")
    ?? (event ? readPath(event, "cwd") ?? readPath(event, "workspace") ?? readPath(event, "current_working_directory") : null);
}

function readPath(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function sanitizeForHookLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_LOG_STRING_LENGTH
      ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}...[truncated ${value.length - MAX_LOG_STRING_LENGTH} chars]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);
  if (depth >= 6) return "[max-depth]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_LOG_ARRAY_ITEMS).map((item) => sanitizeForHookLog(item, depth + 1));
    if (value.length > MAX_LOG_ARRAY_ITEMS) items.push(`[truncated ${value.length - MAX_LOG_ARRAY_ITEMS} items]`);
    return items;
  }
  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, item] of entries.slice(0, MAX_LOG_OBJECT_KEYS)) {
    result[key] = sanitizeForHookLog(item, depth + 1);
  }
  if (entries.length > MAX_LOG_OBJECT_KEYS) {
    result.__truncatedKeys = entries.length - MAX_LOG_OBJECT_KEYS;
  }
  return result;
}
