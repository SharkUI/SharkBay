---
kind: sharkbay_task
taskId: G8K4N2-u3960864-m81ae10
taskTag: G8K4N2
mode: task
title: Gate CodeGraph auto-init
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 9e2de4aa-5299-4c79-bfb6-8a363f3ba64f
branch: fix/node-cpu-codegraph-lifecycle
dependsOn: []
createdAt: 2026-06-09T09:33:03Z
updatedAt: 2026-06-09T10:04:43Z
completedAt: 2026-06-09T10:04:43Z
commits:
  - 219d1690
---

## Summary
CodeGraph `init`/`sync` no longer runs automatically on project selection or
detail load. Selection now only reads status; indexing is an explicit user
action (Init/Sync button) plus an opt-in "auto-maintain" toggle that defaults
to OFF and is persisted in AppConfig. Part 1 of issue #15 — the primary CPU
trigger.

## Files
- src/shared/types.ts
- src/shared/ipc-channels.ts
- src/main/config.ts
- electron/ipc.ts
- electron/preload.mts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/renderer/workflow.ts
- src/styles/app.css
- tests/codegraph-automaintain.test.ts
- tests/renderer-workflow.test.ts
- tests/ipc-channels.test.ts

## Work
- Added `codeGraphAutoMaintain: boolean` to AppConfig (default false) plus a
  `setCodeGraphAutoMaintain` config setter, IPC channel, handler, and preload
  binding mirroring the existing setAppearanceTheme pattern.
- Gated all three auto-`ensure` effects in ProjectDetailPane on the new flag;
  selection now always only calls readCodeGraphStatus.
- Added an explicit Init/Sync button and an auto-maintain checkbox to the
  CodeGraph status card; the button calls a new runManualCodeGraphEnsure.
- Updated shouldEnsureCodeGraphForSelection to require autoMaintain and updated
  its workflow tests; added a config test locking in default-OFF + round-trip.

## Verification
- `npm run typecheck` — pass.
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/renderer-workflow.test.ts tests/ipc-channels.test.ts tests/config-migration.test.ts tests/codegraph-automaintain.test.ts` — pass.
- `npm run build` — pass.
- Full `npm test`: 2 pre-existing failures (tests/prompt-store.test.ts,
  tests/harness.test.ts) confirmed failing on clean main via git stash; both
  unrelated to this task (prompt-history-length + locale-prompt expectations).

## Notes
- Issue: https://github.com/SharkUI/SharkBay/issues/15 (problem 1).
- Prior related work: T9C2G7, K3D9P4; this task intentionally reverses the
  auto-init behavior G6P9L3 introduced.
- Constraint honored: only changes WHEN indexing runs, not what data is shown.
- No commit produced by the task; user will commit/push.
- Enables Task B (J7P2M5): jobs now start only on explicit action.
