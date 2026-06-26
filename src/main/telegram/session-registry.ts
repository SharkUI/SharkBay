/**
 * Aggregates agent sessions across configured projects for `/sessions`
 * (spec tasks #6). The pure builder is injected with the session parser and a
 * live-status lookup so it can be unit tested without fs / the state manager.
 */

import type { HookSession } from "../hooks/sessions.js";
import type { SessionState, TelegramSessionRow } from "./types.js";

export type ProjectRef = {
  projectPath: string;
  cwdUri: string;
  projectName: string;
};

export type LiveStatus = { state: SessionState; action: string };

export type BuildSessionRowsInput = {
  projects: ProjectRef[];
  parse: (projectPath: string) => HookSession[];
  /** sessionId → live status (from the hook state manager). */
  statuses: Map<string, LiveStatus>;
  limit?: number;
};

/** Build the `/sessions` rows: newest first, annotated with project + live state. */
export function buildSessionRows(input: BuildSessionRowsInput): { rows: TelegramSessionRow[]; total: number } {
  const all: TelegramSessionRow[] = [];
  for (const project of input.projects) {
    for (const session of input.parse(project.projectPath)) {
      const live = input.statuses.get(session.sessionId) ?? null;
      all.push({
        sessionId: session.sessionId,
        projectPath: project.projectPath,
        cwdUri: project.cwdUri,
        projectName: project.projectName,
        agentId: session.agentId,
        model: session.model,
        title: session.title,
        subtitle: live?.action || session.title,
        lastEventAt: session.lastEventAt,
        state: live?.state ?? null,
      });
    }
  }
  all.sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
  const total = all.length;
  const rows = typeof input.limit === "number" ? all.slice(0, input.limit) : all;
  return { rows, total };
}

export function countOnline(rows: TelegramSessionRow[]): number {
  return rows.filter((r) => r.state === "working" || r.state === "approval").length;
}
