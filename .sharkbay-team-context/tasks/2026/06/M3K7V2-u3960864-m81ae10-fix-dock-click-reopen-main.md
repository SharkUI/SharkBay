---
kind: sharkbay_task
taskId: M3K7V2-u3960864-m81ae10
taskTag: M3K7V2
mode: quick
title: Fix dock click not reopening main window
status: completed
completedAt: 2026-06-10T06:03:09Z
commits:
  - 7801a66d
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 6057c5ac-7305-4fd2-be8f-282100fe64e4
branch: main
createdAt: 2026-06-10T06:02:45Z
updatedAt: 2026-06-10T06:03:09Z
---

## Summary
Fix: clicking dock icon after closing main window (with island still visible) should reopen the main window.

## Files
- electron/main.ts

## Work
- Root cause: `activate` handler checks `BrowserWindow.getAllWindows().length === 0`, but island window is still alive so condition is never true.
- Fix: check `mainWindow` directly; also add `closed` listener to null the reference.

## Verification
- Close main window via red traffic light, then click dock icon — main window reappears.

## Notes
- Island window is intentionally kept alive when main window closes.
