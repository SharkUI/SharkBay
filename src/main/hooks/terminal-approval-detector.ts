/**
 * Detects permission-approval prompts from terminal output for agents
 * whose hook protocol does not emit attention events (e.g. Kiro).
 *
 * Watches a sliding window of terminal output for a known prompt signature
 * and fires a callback when detected. Subsequent hook events (tool_start,
 * turn_end) naturally override the injected state — no explicit "clear" needed.
 */

const APPROVAL_PATTERN = "ESC to close";
const TAIL_WINDOW = 256;

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
    this.sessions.set(terminalSessionId, { agentId, cwd, tail: "", fired: false });
  }

  untrack(terminalSessionId: string): void {
    this.sessions.delete(terminalSessionId);
  }

  feed(terminalSessionId: string, data: string): void {
    const buf = this.sessions.get(terminalSessionId);
    if (!buf) return;

    const clean = stripAnsi(data);
    buf.tail = (buf.tail + clean).slice(-TAIL_WINDOW);

    if (buf.tail.includes(APPROVAL_PATTERN)) {
      if (!buf.fired) {
        buf.fired = true;
        this.onDetected?.({ agentId: buf.agentId, terminalSessionId, cwd: buf.cwd });
      }
    } else {
      buf.fired = false;
    }
  }
}
