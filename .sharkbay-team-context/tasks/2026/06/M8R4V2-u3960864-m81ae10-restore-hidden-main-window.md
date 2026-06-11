---
kind: sharkbay_task
taskId: M8R4V2-u3960864-m81ae10
taskTag: M8R4V2
mode: task
title: Restore hidden main window on dock activate
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019eb5ea-9bd2-7eb0-85c9-20e696401d4d
branch: main
createdAt: 2026-06-11T09:06:06Z
updatedAt: 2026-06-11T09:13:15Z
completedAt: 2026-06-11T09:13:15Z
commits:
  - e633895307ea8bea0acabad94e4dc3e54e66bebf
---

## Summary
Fixed the macOS main-window close/reopen behavior so red close hides the existing BrowserWindow and Dock activation restores it instead of creating a fresh window.

## Files
- .sharkbay/tasks/M8R4V2-u3960864-m81ae10-restore-hidden-main-window.md
- electron/main.ts

## Work
- Searched team context for prior island/session/window work and found related island overlay task K8V3N7-u3960864-m81ae10.
- Found prior Dock/island tasks M3K7V2-u3960864-m81ae10 and I7P3W9-u3960864-m81ae10; this fix must preserve Dock reopen and island non-activating behavior.
- Identified current root cause: `closed` nulls `mainWindow`, so Dock activation creates a fresh BrowserWindow instead of restoring the still-running hidden UI state.
- Changed macOS main-window close to hide the existing BrowserWindow during normal use, while allowing real destruction during app quit.
- Preparing a focused commit for the main-window lifecycle fix.

## Verification
- `npm run typecheck` passed.
- `git diff --check` passed.
- Manual packaged-app restart check not run in this session.

## Notes
- User reports red close hides the main window while island remains, but Dock activation creates a new main window while the old window and agent session remain alive.
- CodeGraph reported no directly affected test files for `electron/main.ts`.
