---
kind: sharkbay_task
taskId: NNJDN0-u3960864-m81ae10
taskTag: NNJDN0
mode: task
title: Audit phase two task polling overhead reduction
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f3fd9-becc-7ba1-b5a1-549001149a38
branch: audit
commits:
  - 34a1d2553472063336ecbffa66e58e7c452beaef
createdAt: 2026-07-08T15:10:42Z
updatedAt: 2026-07-08T15:12:39Z
completedAt: 2026-07-08T15:12:39Z
---

## Summary
Reduced runtime overhead from task/status polling in the project detail task tab.

## Files
- src/renderer/App.tsx
- .sharkbay/tasks/NNJDN0-u3960864-m81ae10-audit-phase-two-task-polling.md

## Work
- Created the task on branch `audit`.
- Scope: lower fixed task/status polling overhead without changing the protocol event model.
- Used CodeGraph to locate `TasksDetailTab` and protocol status/task IPC usage.
- Confirmed task changes already arrive through `protocol:tasksChanged`; status has no event, so this step keeps a lower-frequency periodic fallback.
- Changed the task/status fallback refresh from a fixed 3s interval to a 15s visible-window interval with immediate refresh on focus or visibility restore.

## Verification
- `npm run typecheck` passed.
- `npx vitest run tests/renderer-workflow.test.ts tests/ipc-channels.test.ts` passed: 2 files, 9 tests.
- `npm test` passed: 57 files, 320 tests.
- `git diff --check` passed.
- `codegraph sync .` completed after the edit.
- `git status --short` was clean after commit.

## Notes
- Success criteria: task data remains promptly refreshed via existing task-change events, periodic fallback work is reduced, and targeted/full tests pass.
