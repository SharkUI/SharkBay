---
kind: sharkbay_task
taskId: V9K3R7-u3960864-m81ae10
taskTag: V9K3R7
mode: task
title: Fix island transparent area blocking mouse events
status: completed
completedAt: 2026-06-08T01:39:37Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 6ee6d06c-2ffa-4ad5-9324-e4bf52f6d9fe
branch: feat/island-overlay
createdAt: 2026-06-08T01:38:24Z
updatedAt: 2026-06-08T01:39:37Z
---

## Summary
Fix island overlay window's transparent areas blocking mouse hover and click on underlying windows.

## Files
- electron/main.ts
- electron/island-preload.mts
- src/island/island.html

## Work
- Island window is 520x(menuBarHeight+32) but the closed pill is only 295x32, leaving transparent dead zones on sides and below that intercept mouse events.
- Solution: use setIgnoreMouseEvents(true, {forward: true}) to let transparent areas pass through mouse events while still receiving mousemove for hover detection.
- On mouseenter of #island div: disable ignore (restore interactivity). On mouseleave: re-enable ignore (pass through again).
- Initial state set to ignore in createIslandWindow so window starts with passthrough enabled.

## Verification
- TypeScript compiles without errors (tsconfig.node.json, tsconfig.renderer.json).
- Run app to confirm hover/click works in areas around the closed island pill.

## Notes
- Standard Electron pattern for transparent overlay windows.
