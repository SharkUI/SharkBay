---
kind: sharkbay_task
taskId: K3D9P4-u3960864-m81ae10
taskTag: K3D9P4
mode: task
title: Refine CodeGraph sync triggers
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e633b-10c4-7561-a52f-e660da21a851
branch: main
createdAt: 2026-05-26T13:46:33Z
updatedAt: 2026-05-26T13:51:19Z
completedAt: 2026-05-26T13:51:19Z
---

## Summary
Refined CodeGraph syncing so only the current project is maintained, Git projects debounce dirty-count changes for 10 seconds, and non-Git projects keep selection-time init/sync behavior.

## Files
- .sharkbay/tasks/K3D9P4-u3960864-m81ae10-codegraph-sync-trigger.md
- electron/core-host.ts
- electron/ipc.ts
- electron/preload.mts
- src/core/codegraph-manager.ts
- src/core/core-protocol.ts
- src/core/core-service.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- tests/ipc-channels.test.ts
- tests/codegraph-manager.test.ts

## Work
- Located the current CodeGraph status and project detail call chain with CodeGraph.
- Split CodeGraph status reads from init/sync maintenance with a new ensure-status path.
- Updated the current project detail pane to debounce Git dirty-file-count changes for 10 seconds before running CodeGraph maintenance.
- Kept non-Git local projects on selection-time CodeGraph maintenance as a fallback.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/codegraph-manager.test.ts tests/ipc-channels.test.ts tests/plugin-host.test.ts tests/teamwork-harness.test.ts`
- `npm run typecheck`
- `git diff --check`
- `npm run build`
- `codegraph sync -q /Users/shark/Projects/SharkBay && codegraph status --json /Users/shark/Projects/SharkBay` reported `pendingChanges` all zero.

## Notes
- Builds on T9C2G7-u3960864-m81ae10 and L6M8Q2-u3960864-m81ae10.
