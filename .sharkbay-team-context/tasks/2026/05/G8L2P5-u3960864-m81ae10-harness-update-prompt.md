---
kind: sharkbay_task
taskId: G8L2P5-u3960864-m81ae10
taskTag: G8L2P5
mode: task
title: Add harness update prompt
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e4aae-1051-7390-9545-b07a6ae7c9c7
branch: main
createdAt: 2026-05-22T01:47:13Z
updatedAt: 2026-05-22T02:06:51Z
completedAt: 2026-05-22T01:53:24Z
commit: 0f2c0423
---

## Summary
Added explicit TEAM-panel harness drift detection and manual update flow. SharkBay now reports managed harness file differences above Knowledge Site and only overwrites or adds those files after the user clicks Update Harness.

## Files
- docs/teamwork.md
- electron/ipc.ts
- electron/preload.mts
- .sharkbay/tasks/G8L2P5-u3960864-m81ae10-harness-update-prompt.md
- src/main/teamwork-harness.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/styles/app.css
- tests/ipc-channels.test.ts
- tests/teamwork-harness.test.ts

## Work
- Searched team context for prior harness and TEAM panel work, including T8H4V2-u3960864-m81ae10, D8S3K6-u3960864-m81ae10, and W6C9P2-u3960864-m81ae10.
- Identified the current silent refresh path in agent bootstrap preparation and the TEAM panel status/action-card rendering path.
- Added managed harness drift detection and a manual update action path instead of rewriting harness files during agent launch.
- Added TEAM panel UI, IPC/preload bindings, shared types, documentation, and regression coverage for stale/missing managed harness files.

## Verification
- `npm test -- tests/teamwork-harness.test.ts tests/ipc-channels.test.ts`
- `npm run typecheck`
- `npm test`
- `git diff --check`

## Notes
- Existing unrelated dirty edits in `src/renderer/App.tsx` terminal activity handling were preserved.
- Commit produced: `0f2c0423`.
