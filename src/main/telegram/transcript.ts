/**
 * Clean final-answer extraction from agent session transcripts.
 *
 * Coding agents render full-screen TUIs, so the raw PTY stream is a pile of
 * redraw frames and cannot yield a clean answer. Instead we reconstruct the
 * turn's answer from the agent's own transcript file. Parsers are pure and keyed
 * by agent; the fs/cursor plumbing lives in the harness (ipc.ts).
 */

/**
 * Kiro CLI writes `~/.kiro/sessions/cli/<sessionId>.jsonl`, one JSON object per
 * line: `{ version, kind, data }`. `kind: "AssistantMessage"` carries
 * `data.content[]` blocks of kind `thinking` | `text` | `toolUse`. The visible
 * answer is the concatenation of the non-empty `text` blocks.
 */
export function extractKiroAnswer(lines: string[]): string {
  // The closing summary is the assistant text that comes AFTER the last tool
  // activity. Text before/between tool calls is intermediate narration (shown in
  // live progress, not the final answer). A pure-text turn keeps all its text.
  let afterTool: string[] = [];
  let lastText: string | null = null;
  for (const line of lines) {
    if (!line) continue;
    let entry: { kind?: string; data?: { content?: Array<{ kind?: string; data?: unknown }> } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.kind === "ToolResults") {
      afterTool = [];
      continue;
    }
    if (entry.kind !== "AssistantMessage") continue;
    const content = entry.data?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.kind === "toolUse") {
        afterTool = []; // text before this tool call is intermediate
      } else if (block?.kind === "text" && typeof block.data === "string" && block.data.trim()) {
        afterTool.push(block.data.trim());
        lastText = block.data.trim();
      }
    }
  }
  const answer = afterTool.join("\n\n").trim();
  return answer || (lastText ?? "");
}

/**
 * Codex CLI writes `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. TUI sessions
 * start with `session_meta`, then emit `event_msg` status records and
 * `response_item` model/tool records. `task_complete.last_agent_message` is the
 * clean final answer for a completed turn.
 */
export function extractCodexAnswer(lines: string[]): string {
  let taskComplete: string | null = null;
  let afterTool: string[] = [];
  let lastText: string | null = null;

  for (const line of lines) {
    const entry = parseJsonObject(line);
    if (!entry) continue;
    const type = readString(entry, "type");
    const payload = readObject(entry, "payload");
    const payloadType = readString(payload, "type");

    if (type === "event_msg" && payloadType === "task_complete") {
      const last = readString(payload, "last_agent_message")?.trim();
      if (last) taskComplete = last;
      continue;
    }

    if (type !== "response_item" || !payload) continue;
    if (payloadType === "function_call" || payloadType === "custom_tool_call" || payloadType === "web_search_call") {
      afterTool = [];
      continue;
    }
    if (payloadType !== "message" || readString(payload, "role") !== "assistant") continue;

    const text = outputTextFromContent(readUnknown(payload, "content"))?.trim();
    if (!text) continue;
    afterTool.push(text);
    lastText = text;
  }

  const answer = afterTool.join("\n\n").trim();
  return taskComplete ?? (answer || (lastText ?? ""));
}

export function extractClaudeAnswer(lines: string[]): string {
  let endTurnText: string[] = [];

  for (const line of lines) {
    const entry = parseJsonObject(line);
    if (!entry) continue;
    if (readString(entry, "type") !== "assistant") continue;
    const message = readObject(entry, "message");
    if (!message) continue;
    const content = readUnknown(message, "content");
    if (!Array.isArray(content)) continue;

    if (readString(message, "stop_reason") === "end_turn") {
      const texts: string[] = [];
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        if (readString(block, "type") === "text") {
          const text = readString(block, "text")?.trim();
          if (text) texts.push(text);
        }
      }
      if (texts.length) endTurnText = texts;
    }
  }

  return endTurnText.join("\n\n").trim();
}

/** Extract a turn's clean answer for the given agent, or null when unsupported. */
export function extractAnswer(agentId: string, lines: string[]): string | null {
  const normalized = agentId.toLowerCase();
  if (normalized === "kiro") {
    const answer = extractKiroAnswer(lines);
    return answer || null;
  }
  if (normalized === "codex") {
    const answer = extractCodexAnswer(lines);
    return answer || null;
  }
  if (normalized === "claude") {
    const answer = extractClaudeAnswer(lines);
    return answer || null;
  }
  // Other agents fall back to the PTY-derived tail until a reader is added.
  return null;
}

/**
 * Clean live-progress activity for the in-progress turn: assistant text plus a
 * `🔧 tool · purpose` line per tool call (thinking and raw tool results omitted).
 */
export function extractKiroProgress(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    let entry: { kind?: string; data?: { content?: Array<{ kind?: string; data?: unknown }> } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.kind !== "AssistantMessage") continue;
    const content = entry.data?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.kind === "text" && typeof block.data === "string" && block.data.trim()) {
        out.push(block.data.trim());
      } else if (block?.kind === "toolUse" && block.data && typeof block.data === "object") {
        const data = block.data as { name?: unknown; input?: unknown };
        const name = typeof data.name === "string" ? data.name : "tool";
        const purpose =
          data.input && typeof data.input === "object" && typeof (data.input as { __tool_use_purpose?: unknown }).__tool_use_purpose === "string"
            ? (data.input as { __tool_use_purpose: string }).__tool_use_purpose
            : "";
        out.push(purpose ? `🔧 ${name} · ${purpose}` : `🔧 ${name}`);
      }
    }
  }
  return out.join("\n");
}

export function extractCodexProgress(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    const entry = parseJsonObject(line);
    if (!entry) continue;
    const type = readString(entry, "type");
    const payload = readObject(entry, "payload");
    const payloadType = readString(payload, "type");

    if (type === "event_msg" && payloadType === "agent_message") {
      const message = readString(payload, "message")?.trim();
      if (message) out.push(message);
      continue;
    }

    if (type !== "response_item" || !payload) continue;
    if (payloadType === "function_call" || payloadType === "custom_tool_call") {
      out.push(`🔧 ${readString(payload, "name") ?? "tool"}`);
    } else if (payloadType === "web_search_call") {
      out.push("🔎 web search");
    }
  }
  return out.join("\n");
}

export function extractClaudeProgress(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    const entry = parseJsonObject(line);
    if (!entry || readString(entry, "type") !== "assistant") continue;
    const message = readObject(entry, "message");
    const content = readUnknown(message ?? entry, "content");
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const type = readString(block, "type");
      if (type === "text") {
        const text = readString(block, "text")?.trim();
        if (text) out.push(text);
      } else if (type === "tool_use") {
        out.push(`🔧 ${readString(block, "name") ?? "tool"}`);
      }
    }
  }
  return out.join("\n");
}

export function progressSince(agentId: string, lines: string[]): string | null {
  const normalized = agentId.toLowerCase();
  if (normalized === "kiro") {
    return extractKiroProgress(lines) || null;
  }
  if (normalized === "codex") {
    return extractCodexProgress(lines) || null;
  }
  if (normalized === "claude") {
    return extractClaudeProgress(lines) || null;
  }
  return null;
}

/**
 * Line index where the latest turn begins (the last user `Prompt` entry).
 * Slicing the transcript from here yields the most recent turn's answer.
 * Returns 0 (whole file) when unsupported or no prompt is found.
 */
export function lastTurnStartIndex(agentId: string, lines: string[]): number {
  const normalized = agentId.toLowerCase();
  if (normalized === "codex") {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line) continue;
      const entry = parseJsonObject(line);
      const payload = entry ? readObject(entry, "payload") : null;
      if (!entry || !payload) continue;
      const type = readString(entry, "type");
      const payloadType = readString(payload, "type");
      if (type === "event_msg" && payloadType === "user_message") return i;
      if (type === "response_item" && payloadType === "message" && readString(payload, "role") === "user") return i;
    }
    return 0;
  }
  if (normalized === "claude") {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line) continue;
      const entry = parseJsonObject(line);
      if (!entry || readString(entry, "type") !== "user") continue;
      const message = readObject(entry, "message");
      const content = readUnknown(message ?? entry, "content");
      if (typeof content === "string" && content.trim()) return i;
      if (Array.isArray(content) && content.some((block) => block && typeof block === "object" && readString(block, "type") !== "tool_result")) return i;
    }
    return 0;
  }
  if (normalized !== "kiro") return 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      if ((JSON.parse(line) as { kind?: string }).kind === "Prompt") return i;
    } catch {
      // ignore malformed lines
    }
  }
  return 0;
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  if (!line) return null;
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  return entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : null;
}

function readObject(value: object | null, key: string): Record<string, unknown> | null {
  if (!value) return null;
  const next = (value as Record<string, unknown>)[key];
  return next && typeof next === "object" && !Array.isArray(next) ? next as Record<string, unknown> : null;
}

function readString(value: object | null, key: string): string | null {
  if (!value) return null;
  const next = (value as Record<string, unknown>)[key];
  return typeof next === "string" ? next : null;
}

function readUnknown(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

function outputTextFromContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return readString(item, "text");
    })
    .filter((text): text is string => Boolean(text));
  return parts.join("\n\n");
}

