type CodexActivity = "working" | "stopped" | "approval";

function liveLines(screenLines: readonly string[]): string[] {
  const lines = screenLines.map((line) => line.trim());
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

// Inspect only Codex's live footer, never question text in terminal scrollback.
export function codexHasPendingInput(screenLines: readonly string[]): boolean {
  const footer = liveLines(screenLines).slice(-8);
  const text = footer.join("\n");
  const collapsed = footer.some((line) => /^(?:\?\s*)?[1-9]\d*\s+questions?(?:\s|$)/i.test(line))
    && /(?:^|\n)(?:⇧←|shift\+left)\s+to\s+answer(?:\n|$)/i.test(text);
  const expanded = /(?:^|\n)enter\s+submit\s+\^\]\s+skip\s+(?:⇧→|shift\+right)\s+main\s+prompt(?:\n|$)/i.test(text);
  return collapsed || expanded;
}

export function codexTerminalActivity(screenLines: readonly string[]): CodexActivity | null {
  if (codexHasPendingInput(screenLines)) return "approval";
  const lines = liveLines(screenLines);
  // Queued or multiline input can put the live progress indicator well above
  // the footer. The caller supplies the live screen, never scrollback rows.
  if (lines.some((line) => /\besc to interrupt\)(?:\s*[·•].*)?\s*$/i.test(line))) return "working";
  if (lines.slice(-8).some((line) => /^[›❯](?:\s|$)/.test(line))) return "stopped";
  return null;
}

export function codexActivityWithHook(terminalState: CodexActivity, hookState?: CodexActivity): CodexActivity {
  if (terminalState === "approval" || hookState === "approval") return "approval";
  // An input prompt is also visible during work; its presence cannot end a
  // turn that the associated hook still reports as running.
  if (terminalState === "stopped" && hookState === "working") return "working";
  return terminalState;
}
