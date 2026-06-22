---
kind: sharkbay_task
taskId: F4S8N2-u3960864-m81ae10
taskTag: F4S8N2
mode: quick
title: Fix Review with… submenu clipped at panel right edge
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 3c83b047-df8a-41f7-ab1b-c3561ec6b4a9
branch: main
createdAt: 2026-06-22T11:10:38Z
updatedAt: 2026-06-22T11:14:46Z
completedAt: 2026-06-22T11:14:46Z
---

## Summary
The task context menu's "Review with…" flyout submenu always opens to the right
(`left: calc(100% - 2px)`) with no edge detection, so when the task menu opens
near the right edge of the project panel the submenu overflows the window and
the agent labels are clipped. Make the submenu flip to the left when there is
not enough room on the right.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Root cause: `.project-context-submenu` is absolutely positioned to the right of
  the parent menu with no boundary check (added in RVW7K2 round-2).
- App.tsx: compute `flipSubmenuLeft = reviewMenu.x + 178 * 2 > window.innerWidth`
  (menu + submenu are each 178px) in the reviewMenu render, and apply a
  `project-context-submenu--left` modifier to the submenu via `cx(...)`.
- app.css: added `.project-context-submenu--left` (`left: auto; right: calc(100% - 2px)`)
  so the flyout opens leftward when near the right edge.

## Verification
- `npm run typecheck` — passes.
- `npm run build` — succeeds.

## Notes
- Related prior task: RVW7K2 (introduced the Review / Review with… submenu),
  V3N8W2 (context menu width).
