import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type HookSession = {
  sessionId: string;
  agentId: string;
  model: string | null;
  title: string | null;
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
    title: string | null;
    transcriptPath: string | null;
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
        title: null,
        transcriptPath: null,
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
    if (typeof payload?.transcript_path === "string") {
      session.transcriptPath = payload.transcript_path;
    }

    const event = normalized?.event;
    if (event === "prompt") {
      session.promptCount++;
      if (session.title === null && typeof normalized?.prompt === "string") {
        const title = sessionTitleFromPrompt(normalized.prompt);
        if (title) session.title = title;
      }
    }
    if (event === "turn_end") session.turnCount++;
    if (event === "tool_start") session.toolCount++;
  }

  const result: HookSession[] = [];
  for (const [sessionId, { transcriptPath, ...data }] of sessions) {
    if (data.model === null) {
      if (data.agentId === "kiro") data.model = readKiroModel(sessionId);
      else if (data.agentId === "gemini" && transcriptPath) data.model = readGeminiModel(transcriptPath);
    }
    if (data.title === null && transcriptPath) {
      data.title = readTranscriptTitle(transcriptPath);
    }
    result.push({ sessionId, ...data });
  }

  result.sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
  return result;
}

function readGeminiModel(transcriptPath: string): string | null {
  try {
    let model: string | null = null;
    for (const line of fs.readFileSync(transcriptPath, "utf8").split("\n")) {
      if (!line) continue;
      const m = JSON.parse(line)?.model;
      if (typeof m === "string" && m) model = m;
    }
    return model;
  } catch {
    return null;
  }
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

const BOILERPLATE_PREFIXES = [
  "I'm working in SharkBay Task Protocol",
  "# Overview\n",
  "# Applications mentioned",
];

function sessionTitleFromPrompt(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (!trimmed) return null;
  for (const prefix of BOILERPLATE_PREFIXES) {
    if (trimmed.startsWith(prefix)) return null;
  }
  const firstLine = trimmed.split("\n")[0] ?? "";
  if (firstLine.length <= 50) return firstLine;
  const cut = firstLine.lastIndexOf(" ", 50);
  return firstLine.slice(0, cut > 20 ? cut : 50) + "…";
}

function readTranscriptTitle(transcriptPath: string): string | null {
  try {
    const fd = fs.openSync(transcriptPath, "r");
    const buf = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const chunk = buf.toString("utf8", 0, bytesRead);
    for (const line of chunk.split("\n")) {
      if (!line) continue;
      let entry: { type?: string; message?: { role?: string; content?: unknown } };
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.type !== "human" && entry.message?.role !== "user") continue;
      const content = entry.message?.content;
      const text = typeof content === "string" ? content
        : Array.isArray(content) ? (content.find((b: { type?: string }) => b.type === "text") as { text?: string } | undefined)?.text ?? ""
        : "";
      const title = sessionTitleFromPrompt(text);
      if (title) return title;
    }
    return null;
  } catch {
    return null;
  }
}
