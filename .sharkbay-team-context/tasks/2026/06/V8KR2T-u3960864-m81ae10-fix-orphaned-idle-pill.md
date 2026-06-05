---
kind: sharkbay_task
taskId: V8KR2T-u3960864-m81ae10
taskTag: V8KR2T
mode: task
title: Fix orphaned idle pill from external agent sessions
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: bf59c2d7-6c19-4fe8-9a40-cfcef05072ba
branch: main
createdAt: 2026-06-05T02:51:22Z
updatedAt: 2026-06-05T02:52:28Z
completedAt: 2026-06-05T02:52:28Z
commits:
  - c6c4f3cf
---

## Summary
Fix bug where hookStateBySessionId entries without terminalSessionId (from external agent sessions) are never cleared, causing a persistent idle pill on project cards that overrides working state.

## Files
- src/renderer/App.tsx

## Work
- Root cause: entries in hookStateBySessionId without terminalSessionId cannot be cleared by any UI path (tab focus, tab close, terminal exit all require agentSessionToTerminalRef mapping). These orphan entries participate in project-level aggregation with idle(2) > working(1) priority.
- Fix: skip entries without terminalSessionId in the project-level aggregation useEffect.

## Verification
- `npm run typecheck` passes (both renderer and node configs)
- `npm test` passes (158/158 tests, 40 test files)

## Notes
- External agents (e.g. codex in a standalone terminal) trigger hooks via the global socket but cannot be resolved to a SharkBay terminal tab.
- The hookStateByTerminalId memo already skips these entries for per-tab display; the aggregation was the only path that didn't filter them.
