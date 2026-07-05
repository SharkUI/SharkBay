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
updatedAt: 2026-07-05T07:24:50Z
completedAt: 2026-07-05T07:19:40Z
commits:
  - e710b1d
---

## Summary
Add a floating "back to bottom" button in the terminal surface that appears when the viewport is scrolled far (more than ~2 screen heights) from the bottom, and scrolls the terminal to the bottom on click.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Explored terminal rendering via CodeGraph; renderer terminal lives in `XTermSurface` (src/renderer/App.tsx), xterm v6.0.0.
- Added `showScrollToBottom` state + effect in `XTermSurface`: subscribes to `terminal.onScroll` and `onWriteParsed`, computes `baseY - viewportY` and shows button when distance > `rows * 2` (~2 screens).
- Rendered a circular floating button in the surface (bottom-right) that calls `terminal.scrollToBottom()` and refocuses the terminal.
- Added `.terminal-scroll-bottom` CSS with light + night theme variants, matching existing overlay conventions.

## Verification
- npm run typecheck → passed.
- npm run build → passed (vite build succeeded).

## Notes
- xterm exposes `buffer.active.baseY` (max scroll top) and `viewportY` (current top); distance in lines = baseY - viewportY.
- Threshold is 2 * terminal.rows (2 screen heights) as requested.
- No commit produced; user did not request one.
