import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type HookSession = {
  sessionId: string;
  agentId: string;
  model: string | null;
  startedAt: string;
  lastEventAt: string;
  promptCount: number;
  turnCount: number;
  toolCount: number;
};

type LogEntry = {
  timestamp: string;
  source: string;
  normalized?: {
    agent: string;
    sessionId: string;
    event: string;
    timestamp: string;
    prompt?: string;
    tool?: { name: string };
    cwd?: string;
  };
  payload?: Record<string, unknown>;
};

export function parseHookSessions(repoPath: string): HookSession[] {
  const logPath = path.join(repoPath, ".sharkbay", "logs", "hooks.log");
  let content: string;
  try {
    content = fs.readFileSync(logPath, "utf8");
  } catch {
    return [];
  }

  const sessions = new Map<string, {
    agentId: string;
    model: string | null;
    startedAt: string;
    lastEventAt: string;
    promptCount: number;
    turnCount: number;
    toolCount: number;
  }>();

  for (const line of content.split("\n")) {
    if (!line) continue;
    let entry: LogEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = entry.payload;
    const normalized = entry.normalized;
    const sid = (payload?.session_id as string) || normalized?.sessionId;
    if (!sid) continue;

    let session = sessions.get(sid);
    if (!session) {
      session = {
        agentId: normalized?.agent ?? entry.source ?? "unknown",
        model: null,
        startedAt: entry.timestamp,
        lastEventAt: entry.timestamp,
        promptCount: 0,
        turnCount: 0,
        toolCount: 0,
      };
      sessions.set(sid, session);
    }

    session.lastEventAt = entry.timestamp;

    if (payload?.model && typeof payload.model === "string") {
      session.model = payload.model;
    }

    const event = normalized?.event;
    if (event === "prompt") session.promptCount++;
    if (event === "turn_end") session.turnCount++;
    if (event === "tool_start") session.toolCount++;
  }

  const result: HookSession[] = [];
  for (const [sessionId, data] of sessions) {
    if (data.agentId === "kiro" && data.model === null) {
      data.model = readKiroModel(sessionId);
    }
    result.push({ sessionId, ...data });
  }

  result.sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
  return result;
}

function readKiroModel(sessionId: string): string | null {
  try {
    const file = path.join(os.homedir(), ".kiro", "sessions", "cli", `${sessionId}.json`);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const model = data?.session_state?.rts_model_state?.model_info?.model_id;
    return typeof model === "string" && model ? model : null;
  } catch {
    return null;
  }
}
