---
kind: sharkbay_task
taskId: P3B7K2-u3960864-m81ae10
taskTag: P3B7K2
mode: task
title: Keep agent terminal pinned to bottom after submitting a prompt
status: completed
completedAt: 2026-06-21T07:22:07Z
commits:
  - c13e64ed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 959a1b82-7ab2-4fe9-92db-1218af04c786
branch: main
createdAt: 2026-06-21T07:12:45Z
updatedAt: 2026-06-21T07:22:07Z
---

## Summary
Sometimes submitting a prompt in the prompt input bar makes the agent terminal
jump to the top of the scrollback instead of staying at the bottom. Pin the
active terminal to the bottom for a short window after submit so the user keeps
following the agent's response.

## Files
- src/renderer/App.tsx

## Work
- Investigation (read-only):
  - xterm `Terminal.focus()` uses `{ preventScroll: true }`, so `tab.terminal.focus()` is not the cause.
  - `FitAddon.fit()` is a no-op unless rows/cols actually change.
  - PromptInputBar overlays the terminal (`.xterm-surface` fixed `inset: 0 0 41px 0`, see task R8V3N6), so submit does not resize the surface.
  - Conclusion: SharkBay does not resize/scroll on submit; the jump comes from the agent CLI's async post-submit redraw, hence "sometimes".

- Implementation (src/renderer/App.tsx, TerminalPane):
  - Added `followBottomUntil` ref (Map<sessionId, expiryMs>).
  - Added `pinTerminalToBottom(sessionId)`: sets a 1000ms window and scrolls the active terminal to bottom immediately.
  - In `writeTerminalOutputToTab`: while inside the window, write with a callback that calls `terminal.scrollToBottom()` so each post-submit output chunk re-pins to bottom; lazily clears the entry once expired.
  - Added optional `onSubmit?: (sessionId) => void` prop to `PromptInputBar`, called from `submit()` after sending; wired to `pinTerminalToBottom`.

## Verification
- `npm run typecheck` — passes.
- `npm run build` — passes (vite production build).
- `npm test` — 46 files / 210 tests passed (the 2 previously-flaky tests now green).
- Behavioral verification of the live xterm scroll could not be run in this headless environment; logic verified by build/tests and code review.

## Notes
- Related prior work: R8V3N6 (input bar overlay layout), CKU05K (hookState auto-focus), EK9656 (per-session prompt history).
- Fix keeps the view pinned to bottom only for a brief window after the user submits, matching the intent of "follow the response after sending".
