---
kind: sharkbay_task
taskId: 42UUCU-u3960864-m81ae10
taskTag: 42UUCU
mode: task
title: CodeGraph auto-sync with 5-min debounce
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 51b8e171-bc65-488e-800d-e8f2338f1098
branch: main
createdAt: 2026-06-10T06:01:26Z
updatedAt: 2026-06-10T06:09:40Z
completedAt: 2026-06-10T06:09:40Z
commits:
  - 55087805
---

## Summary
Replaced the manual Sync index button and opt-in auto-maintain checkbox with always-on automatic CodeGraph sync. Sync triggers on dirty worktree file-count changes with a 5-minute debounce. Uninitialized projects auto-init on selection without any user toggle.

## Files
- src/renderer/App.tsx
- src/renderer/workflow.ts
- src/renderer/types.ts
- src/shared/types.ts
- src/shared/ipc-channels.ts
- src/main/config.ts
- electron/ipc.ts
- electron/preload.mts
- tests/renderer-workflow.test.ts
- tests/ipc-channels.test.ts
- tests/codegraph-automaintain.test.ts (deleted)

## Work
- Removed Sync index button and auto-maintain checkbox from CodeGraphStatusSummary.
- Removed codeGraphAutoMaintain field from AppConfig, default config, normalization, and migration check.
- Removed setCodeGraphAutoMaintain IPC channel, handler, preload binding, and type.
- Removed autoMaintain parameter from shouldEnsureCodeGraphForSelection; auto-init now always fires for uninitialized local Git projects.
- Changed codeGraphSyncDebounceMs from 10s to 300s (5 min).
- Removed all autoMaintain gating from the three CodeGraph effects in ProjectDetailPane.
- Deleted tests/codegraph-automaintain.test.ts; updated renderer-workflow and ipc-channels tests.

## Verification
- `npm run typecheck` — pass.
- `npm test -- tests/renderer-workflow.test.ts tests/ipc-channels.test.ts tests/config-migration.test.ts` — 10 tests pass.
- `npm run build` — pass.

## Notes
- Reverses G8K4N2-u3960864-m81ae10 UI additions (button + checkbox) while keeping the cancellable job lifecycle from J7P2M5.
- Issue: https://github.com/SharkUI/SharkBay/issues/15
- The 5-min debounce relies on the existing 5s workspace polling cycle that updates gitDirtyFiles count; no fs watcher needed.
