---
kind: sharkbay_task
taskId: C7F2N9-u3960864-m81ae10
taskTag: C7F2N9
mode: task
title: Add caffeinate setting
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f4a89-e823-7152-8aa4-f7136b0e5ad2
branch: main
createdAt: 2026-07-10T05:42:13Z
updatedAt: 2026-07-10T05:47:44Z
completedAt: 2026-07-10T05:47:44Z
---

## Summary
Added a General settings switch that keeps the app caffeinated while SharkBay terminal tabs are working. The renderer now requests an Electron power save blocker only when the setting is enabled and at least one tab is in the working state.

## Files
- .sharkbay/tasks/C7F2N9-u3960864-m81ae10-add-caffeinate-setting.md
- electron/ipc.ts
- electron/preload.mts
- src/main/config.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- tests/config-migration.test.ts
- tests/ipc-channels.test.ts

## Work
- Started task after checking team context for related settings, terminal activity, and sleep/black-screen history.
- Added a persisted General setting for caffeinating while terminal tabs are working.
- Wired renderer working-state aggregation to an Electron `powerSaveBlocker` request in the main process.

## Verification
- `git diff --check -- electron/ipc.ts electron/preload.mts src/main/config.ts src/renderer/App.tsx src/renderer/types.ts src/shared/ipc-channels.ts src/shared/types.ts tests/config-migration.test.ts tests/ipc-channels.test.ts .sharkbay/tasks/C7F2N9-u3960864-m81ae10-add-caffeinate-setting.md`
- `npm test -- tests/config-migration.test.ts tests/ipc-channels.test.ts`
- `npm run typecheck`
- `codegraph affected electron/ipc.ts electron/preload.mts src/main/config.ts src/renderer/App.tsx src/renderer/types.ts src/shared/ipc-channels.ts src/shared/types.ts tests/config-migration.test.ts tests/ipc-channels.test.ts`

## Notes
- Assumption: the setting should default off and only hold a wake lock while at least one terminal session is in the existing working state.
- No commit was produced.
