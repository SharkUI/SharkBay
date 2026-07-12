---
kind: sharkbay_task
taskId: K8T3N7-u3960864-m81ae10
taskTag: K8T3N7
mode: task
title: Detect Kiro approval state from terminal output
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: cc80f08f-4831-408a-8235-0972b9a3fab6
branch: feat/kiro-terminal-approval
createdAt: 2026-06-09T01:33:48Z
updatedAt: 2026-06-09T01:38:11Z
completedAt: 2026-06-09T01:38:11Z
---

## Summary
Detect Kiro's permission approval prompt from terminal output and inject a synthetic attention event into the state manager, giving Kiro sessions a red (approval) indicator.

## Files
- src/main/hooks/terminal-approval-detector.ts
- src/main/hooks/state-manager.ts
- electron/ipc.ts
- tests/terminal-approval-detector.test.ts

## Work
- Created TerminalApprovalDetector: sliding window (256 chars) pattern match on "ESC to close"
- Added `injectEvent()` to AgentHookStateManager for synthetic event injection (bypasses connector normalize)
- Integrated in ipc.ts: track kiro terminals on update, feed on data, untrack on exit
- Callback does reverse hookSessionToTerminal lookup to find hook session id
- The `fired` flag prevents duplicate events; resets when pattern leaves the window

## Verification
- `npm run typecheck` — passed
- `npm test` — 166/167 passed (pre-existing harness locale failure only)
- `tests/terminal-approval-detector.test.ts` — 6/6 passed (pattern detection, chunked input, dedup, untrack)

## Notes
- Related to R7K4M9 (state rename). Prior task D1GSIG investigated kiro attention status.
- Terminal data arrives in chunks; need buffer/window for pattern matching.
