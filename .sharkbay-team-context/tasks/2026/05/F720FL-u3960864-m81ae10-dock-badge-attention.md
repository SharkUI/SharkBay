---
kind: sharkbay_task
taskId: F720FL-u3960864-m81ae10
taskTag: F720FL
mode: task
title: Dock badge and bounce for attention projects
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro
sessionId: d5fc8bc9-7407-4551-87ad-692e1078fdd9
branch: main
createdAt: 2026-05-28T02:59:20Z
updatedAt: 2026-05-28T04:06:27Z
completedAt: 2026-05-28T04:06:27Z
commits:
  - d6c31b3c
---

## Summary

Added macOS Dock badge count and bounce when the window is unfocused and projects have "attention" state. Badge clears on window focus.

## Files

- electron/main.ts
- electron/preload.mts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- tests/ipc-channels.test.ts

## Work

- Added `dockBadgeUpdate` IPC channel (fire-and-forget via `ipcMain.on`).
- Main process sets `app.dock.setBadge(count)` and calls `app.dock.bounce("informational")` when count > 0.
- Main process clears badge on window `focus` event.
- Renderer sends attention count (projects with `"idle"` terminal activity state) on window blur and when `terminalActivityByProjectId` changes while unfocused; sends 0 on focus.
- Added `dock.updateBadge` to preload API and `SharkBayBridge` type.

## Verification

- `npm run typecheck` passes (both renderer and node configs).
- `npm test` passes (135 tests, 36 files).

## Notes

- Attention state = `terminalActivityByProjectId` entry with value `"idle"` (rendered as "attention" pill in sidebar).
- `app.dock.bounce("informational")` bounces once; does not require user permission.
- Badge accepts any string; we use the numeric count converted to string.
