---
kind: sharkbay_task
taskId: W3K9P4-u3960864-m81ae10
taskTag: W3K9P4
mode: task
title: Fix startup flash of empty panels
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: d02b1496-8b00-4106-ba6c-a3d456b7ecaf
branch: main
createdAt: 2026-05-28T12:40:06Z
updatedAt: 2026-05-28T13:10:17Z
completedAt: 2026-05-28T13:10:17Z
commits:
  - cf974112
---

## Summary

Defer window.show() until renderer signals contentReady, parallelize scanner, fix terminal panel button layout shift when agents load, and remove unnecessary "No terminal open" empty state.

## Files

- src/shared/ipc-channels.ts
- src/renderer/types.ts
- electron/preload.mts
- electron/main.ts
- src/renderer/App.tsx
- src/main/scanner.ts
- src/styles/app.css
- tests/ipc-channels.test.ts

## Work

- Added `contentReady` IPC channel; window defers show until signal (5s fallback)
- Parallelized per-project metadata resolution in scanner (Promise.all instead of sequential for-loop)
- Fixed terminal toolbar button layout shift: added CSS sibling rules so install button doesn't get `margin-left: auto` when preceded by browser/agent buttons
- Removed "No terminal open" EmptyState from both terminal panel locations

## Verification

- `npm run typecheck` — passes
- `npm test` — 135 tests pass
- `npm run build` — passes

## Notes

- The button centering was caused by two `margin-left: auto` elements in the flex container (first tab-add button + install button) splitting remaining space
- Empty terminal area is now just blank — the toolbar buttons are self-explanatory
