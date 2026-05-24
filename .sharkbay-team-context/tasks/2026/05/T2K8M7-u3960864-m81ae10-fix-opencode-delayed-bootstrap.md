---
kind: sharkbay_task
taskId: T2K8M7-u3960864-m81ae10
taskTag: T2K8M7
mode: quick
title: Fix opencode launch to use delayedBootstrapPrompt
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: f6c613a6-5822-41d0-b4e1-61b67036f490
branch: main
createdAt: 2026-05-24T03:55:00Z
updatedAt: 2026-05-24T03:57:00Z
completedAt: 2026-05-24T03:57:00Z
commit: 7ffa3f66
---

## Summary
Switch opencode from --prompt arg to delayedBootstrapPrompt mechanism (same as deepseek) to avoid TUI freeze on startup.

## Files
- src/main/teamwork-harness.ts
- src/main/terminal.ts
- tests/teamwork-harness.test.ts

## Work
- Changed `teamworkBootstrapArgs("opencode")` to return `[]` (bare command, no --prompt).
- Added `"opencode"` to the delayedBootstrapPrompt condition in terminal.ts alongside deepseek.
- Updated test assertion to expect bare `"opencode"` command without --prompt args.

## Verification
- `npm run typecheck`: clean.
- `npm test`: 37 files, 119 tests passed.

## Notes
- Root cause: opencode --prompt triggers TUI mode with terminal queries that congest even with fire-and-forget IPC.
- Same fix pattern as 3XDEPR (deepseek).
- This is what PR #9 was also trying to fix; we initially rejected it thinking Q24IBU's IPC fix was sufficient.
