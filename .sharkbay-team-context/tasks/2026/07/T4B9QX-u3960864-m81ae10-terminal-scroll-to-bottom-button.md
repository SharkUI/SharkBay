---
kind: sharkbay_task
taskId: T4B9QX-u3960864-m81ae10
taskTag: T4B9QX
mode: task
title: Add scroll-to-bottom button for terminal
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: 76040e16-8786-4b0e-b4a0-cc7f401b158b
branch: main
createdAt: 2026-07-05T07:18:43Z
updatedAt: 2026-07-05T07:19:40Z
completedAt: 2026-07-05T07:19:40Z
---

## Summary
Add a floating "back to bottom" button in the terminal surface that appears when the viewport is scrolled far (more than ~2 screen heights) from the bottom, and scrolls the terminal to the bottom on click.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Explored terminal rendering via CodeGraph; renderer terminal lives in `XTermSurface` (src/renderer/App.tsx), xterm v6.0.0.
- Plan: track scroll distance using `terminal.buffer.active.baseY - viewportY` vs `terminal.rows * 2`; subscribe to `onScroll` + `onWriteParsed`; render button that calls `terminal.scrollToBottom()`.

## Verification
- Pending: npm run typecheck; npm run build.

## Notes
- xterm exposes `buffer.active.baseY` (max scroll top) and `viewportY` (current top); distance in lines = baseY - viewportY.
