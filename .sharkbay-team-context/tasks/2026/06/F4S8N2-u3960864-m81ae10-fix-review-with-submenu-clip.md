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
updatedAt: 2026-06-22T11:18:54Z
completedAt: 2026-06-22T11:18:54Z
commits:
  - 97d2e96f
---

## Summary
The task context menu's "Review with…" flyout submenu always opened to the right
(`left: calc(100% - 2px)`) with no edge detection, so near the panel's right edge
it overflowed and clipped the agent labels. Flip the submenu left when there is
not enough room, and clamp the parent context menu's horizontal position so it
never overflows the right edge either.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Root cause: `.project-context-submenu` is absolutely positioned to the right of
  the parent menu with no boundary check (added in RVW7K2 round-2); the parent
  menu was placed at raw `clientX/clientY` with no clamping.
- App.tsx: clamp the parent menu's left to
  `Math.max(8, Math.min(reviewMenu.x, window.innerWidth - 178 - 8))` and use it in
  the inline style; compute `flipSubmenuLeft = menuLeft + 178 * 2 > window.innerWidth`
  off the clamped left and apply a `project-context-submenu--left` modifier via `cx(...)`.
- app.css: added `.project-context-submenu--left` (`left: auto; right: calc(100% - 2px)`)
  so the flyout opens leftward when near the right edge.

## Verification
- `npm run typecheck` — passes.
- `npm run build` — succeeds.
- Committed as 97d2e96f (only src/renderer/App.tsx menu hunks + src/styles/app.css;
  12 insertions / 2 deletions). Unrelated in-progress "restore open tabs" work
  (task T6R9P4) in the working tree was deliberately left unstaged. Not pushed.

## Notes
- Related prior task: RVW7K2 (introduced the Review / Review with… submenu),
  V3N8W2 (context menu width).

## Reviews
- 通过：实现与 Summary/Files/Work 一致，提交 97d2e96f 范围干净，typecheck 复核通过；仅垂直裁切/极窄窗口翻转/魔数重复等小问题 — `.sharkbay/reviews/F4S8N2-B0Q02I.md` (2026-06-22T13:39:33Z)