---
kind: sharkbay_task
taskId: NBRTB8-u3960864-m81ae10
taskTag: NBRTB8
mode: task
title: Rename Teamwork to Protocol in source and tests
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: a7ddbbdb-bc28-4de6-ab36-b57cd200e0e6
branch: main
createdAt: 2026-05-28T07:35:54Z
updatedAt: 2026-05-28T08:03:22Z
completedAt: 2026-05-28T08:03:22Z
commits:
  - 48d0150a
---

## Summary
Renamed TEAM tab to TASKS, "Teamwork" to "Protocol" across all source and test files. File renames, type/function/IPC/CSS renames, UI string updates. All 135 tests pass.

## Files
- src/main/harness.ts (renamed from teamwork-harness.ts)
- src/main/tasks.ts (renamed from teamwork-tasks.ts)
- tests/harness.test.ts (renamed from teamwork-harness.test.ts)
- tests/tasks.test.ts (renamed from teamwork-tasks.test.ts)
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/renderer/types.ts
- electron/ipc.ts
- electron/preload.mts
- src/main/terminal.ts
- src/renderer/App.tsx
- src/styles/app.css
- src/core/core-service.ts
- tests/teamwork-sync.test.ts
- tests/ipc-channels.test.ts

## Work
- Renamed source files and test files via git mv
- Renamed 11 types, 14 functions/variables, 9 IPC channels, 6 CSS classes
- Updated all UI strings (tab label, buttons, toasts, dialogs, empty states)
- Updated bootstrap prompt text to "SharkBay Task Protocol mode"
- Kept TeamworkSync class and teamwork-sync.ts unchanged (team-context sync)

## Verification
- npm run typecheck: passes
- npm test: 135 tests pass across 36 test files

## Notes
- teamwork-sync.ts, TeamworkSync class, sharkbay-team-context branch name all kept unchanged per design decision
- cleanTeamContext/canCleanTeamContext state fields kept (refer to team context branch)
