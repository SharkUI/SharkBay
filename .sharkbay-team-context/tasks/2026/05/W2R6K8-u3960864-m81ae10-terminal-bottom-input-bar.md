---
kind: sharkbay_task
taskId: W2R6K8-u3960864-m81ae10
taskTag: W2R6K8
mode: task
title: Terminal bottom input bar
status: completed
completedAt: 2026-05-30T10:13:40Z
commits:
  - ae8bef25
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 0e4b4f69-a7ff-43b7-9d34-b2d4e55b19f4
branch: main
createdAt: 2026-05-30T09:51:55Z
updatedAt: 2026-05-30T10:13:40Z
---

## Summary
Add a fixed input bar at the bottom of the terminal panel that supports mouse, native input, dictation, and multi-line editing — then submits text to the active terminal session's pty.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Added PromptInputBar component with auto-resizing textarea
- Wired submission to sendTerminalInput / inputFire
- Split text and `\r` into two writes with 30ms delay to avoid TUI paste-mode issue
- Changed terminal-layout grid to `auto minmax(0, 1fr) auto` for third row
- Added day/night/morning theme styles for the input bar
- xterm won't steal focus from textarea (existing isUserEditingElsewhere guard)
- TypeScript compiles clean, verified working with Codex
- CodeWhale still doesn't respond to `\r` (known pre-existing issue)

## Verification
- Manual test: type in bottom bar, confirmed text submits to terminal pty
- Codex: text fills input and submits correctly with 30ms delayed \r
- CodeWhale: text fills input but \r still not recognized (pre-existing agent-side issue)
- Shift+Enter gives newline in textarea

## Notes
- CodeWhale has a known issue where \r doesn't trigger submit — same problem in bootstrap prompt injection (terminal.ts:215). Likely needs investigation into CodeWhale's TUI input handling.
- Data path: textarea → send(text) → 30ms → send("\r") → IPC → pty.write
- The 30ms split avoids bracketed-paste behavior in TUI apps that treat \r-within-paste as newline
