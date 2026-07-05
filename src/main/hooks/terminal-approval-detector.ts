/**
 * Detects permission-approval prompts from terminal output for agents
 * whose hook protocol does not emit attention events (e.g. Kiro).
 *
 * A live approval prompt is one that (a) sits on the LAST rendered line and
 * (b) is followed by no further output because the agent is blocked waiting
 * for a keypress. We therefore only evaluate once terminal output has settled
 * (SETTLE_MS of silence) and only fire when the approval footer is the last
 * non-empty line. This rejects incidental occurrences of the phrase in
 * scrollback replay, resumed history, or the agent's own printed text — none
 * of which end on the footer once output settles on the live input prompt.
 *
 * Subsequent hook events (tool_start, turn_end) naturally override the
 * injected state — no explicit "clear" needed.
 */

const APPROVAL_PATTERN = /ESC to close\s*\|\s*Enter/;
const TAIL_WINDOW = 256;
export const SETTLE_MS = 400;

function stripAnsi(data: string): string {
  return data
    .replace(/\][\s\S]*?(?:|\\)/g, "")
    .replace(/\[[0-?]*[ -/]*[@-~]/g, "");
}

type SessionBuffer = {
  agentId: string;
  cwd: string;
  tail: string;
  fired: boolean;
  settleTimer: ReturnType<typeof setTimeout> | null;
};

export type ApprovalDetectedEvent = {
  agentId: string;
  terminalSessionId: string;
  cwd: string;
};

export class TerminalApprovalDetector {
  private sessions = new Map<string, SessionBuffer>();
  private onDetected: ((event: ApprovalDetectedEvent) => void) | null = null;

  setCallback(callback: (event: ApprovalDetectedEvent) => void): void {
    this.onDetected = callback;
  }

  track(terminalSessionId: string, agentId: string, cwd: string): void {
    this.sessions.set(terminalSessionId, { agentId, cwd, tail: "", fired: false, settleTimer: null });
  }

  untrack(terminalSessionId: string): void {
    const buf = this.sessions.get(terminalSessionId);
    if (buf?.settleTimer) clearTimeout(buf.settleTimer);
    this.sessions.delete(terminalSessionId);
  }

  feed(terminalSessionId: string, data: string): void {
    const buf = this.sessions.get(terminalSessionId);
    if (!buf) return;

    const clean = stripAnsi(data);
    buf.tail = (buf.tail + clean).slice(-TAIL_WINDOW);

    // Defer evaluation until output settles: a real approval prompt blocks
    // waiting for input, so the footer is the last thing written. Bursts of
    // replayed history settle on the live input prompt instead.
    if (buf.settleTimer) clearTimeout(buf.settleTimer);
    buf.settleTimer = setTimeout(() => {
      buf.settleTimer = null;
      this.evaluate(terminalSessionId, buf);
    }, SETTLE_MS);
    buf.settleTimer.unref?.();
  }

  private evaluate(terminalSessionId: string, buf: SessionBuffer): void {
    if (isLiveApprovalPrompt(buf.tail)) {
      if (!buf.fired) {
        buf.fired = true;
        this.onDetected?.({ agentId: buf.agentId, terminalSessionId, cwd: buf.cwd });
      }
    } else {
      buf.fired = false;
    }
  }
}

/**
 * True when the approval footer is the last non-empty line of the settled
 * output — i.e. an actual live prompt, not a phrase buried in scrollback.
 */
function isLiveApprovalPrompt(tail: string): boolean {
  const lines = tail.split(/\r?\n/);
  while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() === "") lines.pop();
  const lastLine = lines[lines.length - 1] ?? "";
  return APPROVAL_PATTERN.test(lastLine);
}
