---
kind: sharkbay_task
taskId: R2K4V7-u3960864-m81ae10
taskTag: R2K4V7
mode: task
title: Fix sidebar idle pill shows on active tab's project
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: f8e84f7d-3967-418e-8e64-7cacc8cbcc9e
branch: main
createdAt: 2026-05-30T14:24:01Z
updatedAt: 2026-05-30T14:27:18Z
completedAt: 2026-05-30T14:27:18Z
---

## Summary
Fixed project sidebar pill to not show idle for the active tab, and corrected priority order to attention > idle > working.

## Files
- src/renderer/App.tsx

## Work
- Added useEffect in TerminalPane that auto-clears idle state from `hookStateBySessionId` when the active tab's hook state becomes idle. This prevents idle from reaching the project-level aggregation for the focused tab.
- Changed `priorityOf` to attention=3, idle=2, working=1 to match the desired pill priority: if any non-active tab is idle, pill shows idle (above working).

## Verification
- `npx tsc -p tsconfig.renderer.json --noEmit` — clean
- `npx tsc -p tsconfig.node.json --noEmit` — clean

## Notes
- Related to prior fix 5d565699 which only suppressed idle dot on active terminal tab, not the sidebar pill.
- The auto-clear approach means the session record is removed entirely for active-tab idle. If the agent later sends a new event (e.g. another turn_end), it re-creates the entry and the effect clears it again immediately.
