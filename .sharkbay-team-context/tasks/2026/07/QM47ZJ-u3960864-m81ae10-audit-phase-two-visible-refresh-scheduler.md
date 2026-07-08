---
kind: sharkbay_task
taskId: QM47ZJ-u3960864-m81ae10
taskTag: QM47ZJ
mode: task
title: Audit phase two visible refresh scheduler cleanup
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f3fd9-becc-7ba1-b5a1-549001149a38
branch: audit
commits:
  - 974c483126b97ac62418ba03a0013a8e619725f7
createdAt: 2026-07-08T15:41:54Z
updatedAt: 2026-07-08T15:44:22Z
completedAt: 2026-07-08T15:44:22Z
---

## Summary
Cleaned up renderer refresh scheduling so background windows do not keep empty intervals alive and foreground restore does not double-refresh.

## Files
- src/renderer/App.tsx
- .sharkbay/tasks/QM47ZJ-u3960864-m81ae10-audit-phase-two-visible-refresh-scheduler.md

## Work
- Created the task on branch `audit`.
- Scope: address review follow-up items for hidden-window timer cleanup and focus/visibility duplicate refreshes in renderer refresh scheduling.
- Used CodeGraph to locate the current workspace, sessions, tasks, and diagnostics visible-refresh scheduling paths.
- Planned a small shared helper for the repeated renderer scheduling pattern instead of four separate custom edits.
- Added `startVisibleRefreshInterval` to keep intervals only while `document.hidden` is false and to debounce foreground restore refreshes across `focus`/`visibilitychange`.
- Replaced the repeated scheduling code in workspace, sessions, tasks, and diagnostics refresh effects.

## Verification
- `npm run typecheck` passed.
- `npx vitest run tests/renderer-workflow.test.ts tests/diagnostics.test.ts tests/hook-sessions.test.ts` passed: 3 files, 18 tests.
- `npm test` passed: 57 files, 320 tests.
- `git diff --check` passed.
- `codegraph sync .` completed after the edit.
- `git status --short` was clean after commit.

## Notes
- Success criteria: visible refresh paths keep intervals only while visible, refresh once on foreground restore, and targeted/full tests pass.
