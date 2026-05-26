---
kind: sharkbay_task
taskId: T9C2G7-u3960864-m81ae10
taskTag: T9C2G7
mode: task
title: Add CodeGraph management
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e633b-10c4-7561-a52f-e660da21a851
branch: main
createdAt: 2026-05-26T13:10:53Z
updatedAt: 2026-05-26T13:22:29Z
completedAt: 2026-05-26T13:22:29Z
---

## Summary
Added CodeGraph as a bundled extension with Core-managed per-project init/sync/status handling and disable cleanup. The Files panel now shows a compact CodeGraph Status Summary while Settings exposes the extension through the existing extensions list.

## Files
- .sharkbay/tasks/T9C2G7-u3960864-m81ae10-add-codegraph-management.md
- electron/core-host.ts
- electron/ipc.ts
- electron/preload.mts
- src/core/codegraph-manager.ts
- src/core/core-protocol.ts
- src/core/core-service.ts
- src/main/teamwork-harness.ts
- src/plugins/bundled-plugins.ts
- src/plugins/bundled/codegraph-detector.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/styles/app.css
- tests/codegraph-manager.test.ts
- tests/ipc-channels.test.ts
- tests/plugin-host.test.ts
- tests/teamwork-harness.test.ts

## Work
- Registered a `xyz.sharkbay.codegraph` bundled extension that detects the CodeGraph CLI through the existing plugin/profile system.
- Added Core and IPC methods for CodeGraph status maintenance, including local project safety checks, automatic init/sync, concurrent status de-duping, and extension-disable cleanup.
- Exposed status through preload and rendered a two-line CodeGraph Status Summary at the top of the Files panel.
- Kept protocol changes limited to Code Intelligence usage guidance and added focused manager coverage for init/sync and missing CLI behavior.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/codegraph-manager.test.ts tests/plugin-host.test.ts tests/ipc-channels.test.ts tests/teamwork-harness.test.ts`
- `npm run typecheck`
- `git diff --check`
- `npm run build`
- `codegraph sync -q /Users/shark/Projects/SharkBay && codegraph status --json /Users/shark/Projects/SharkBay` reported `pendingChanges` all zero.

## Notes
- C9G4VN-u3960864-m81ae10 confirmed CodeGraph is installed and the SharkBay project index is healthy.
- R3M7Q8-u3960864-m81ae10 trimmed protocol guidance so agents are not told about CodeGraph lifecycle details.
- No commit was produced for this task.
