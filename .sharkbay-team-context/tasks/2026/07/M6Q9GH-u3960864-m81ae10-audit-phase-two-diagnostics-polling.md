---
kind: sharkbay_task
taskId: M6Q9GH-u3960864-m81ae10
taskTag: M6Q9GH
mode: task
title: Audit phase two diagnostics polling overhead reduction
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f3fd9-becc-7ba1-b5a1-549001149a38
branch: audit
commits:
  - d8130036c4ea0f04d8dbaac88993834d21c1bbfa
createdAt: 2026-07-08T15:19:03Z
updatedAt: 2026-07-08T15:21:05Z
completedAt: 2026-07-08T15:21:05Z
---

## Summary
Reduced runtime overhead from diagnostics polling in the settings diagnostics panel.

## Files
- src/renderer/App.tsx
- .sharkbay/tasks/M6Q9GH-u3960864-m81ae10-audit-phase-two-diagnostics-polling.md

## Work
- Created the task on branch `audit`.
- Scope: lower diagnostics polling overhead while preserving manual refresh and foreground refresh behavior.
- Used CodeGraph to locate `DiagnosticsSettingsPanel` and diagnostics read usage.
- Confirmed diagnostics auto-refresh currently runs every 3s while the settings diagnostics panel is active.
- Changed diagnostics auto-refresh from a fixed 3s interval to a 15s visible-window interval with immediate refresh on focus or visibility restore.

## Verification
- `npm run typecheck` passed.
- `npx vitest run tests/renderer-workflow.test.ts tests/diagnostics.test.ts` passed: 2 files, 12 tests.
- `npm test` passed: 57 files, 320 tests.
- `git diff --check` passed.
- `codegraph sync .` completed after the edit.
- `git status --short` was clean after commit.

## Notes
- Success criteria: diagnostics still load when the panel is active, manual refresh remains immediate, background polling work is reduced, and targeted/full tests pass.
