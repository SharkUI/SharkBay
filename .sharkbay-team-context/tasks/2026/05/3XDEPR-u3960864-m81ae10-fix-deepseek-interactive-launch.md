---
kind: sharkbay_task
taskId: 3XDEPR-u3960864-m81ae10
taskTag: 3XDEPR
mode: quick
title: Fix DeepSeek TUI interactive launch
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 91b5eb4a-06b4-4bb4-a22e-4a5bfa11fd89
branch: main
createdAt: 2026-05-22T05:12:00Z
updatedAt: 2026-05-22T05:50:00Z
completedAt: 2026-05-22T05:50:00Z
commit: bd284c2e
---

## Summary
Fixed DeepSeek TUI launch to enter interactive TUI mode instead of one-shot reply, with bootstrap prompt written to the pty after a 3-second delay.

## Files
- src/main/teamwork-harness.ts
- src/main/terminal.ts
- tests/teamwork-harness.test.ts

## Work
- Confirmed `deepseek "prompt"` and `deepseek -p "prompt"` are both one-shot (non-interactive).
- Changed `teamworkBootstrapArgs` to return `[]` for DeepSeek so the command stays as bare `deepseek` (interactive TUI).
- Added delayed pty.write (3s) of TEAMWORK_BOOTSTRAP_PROMPT in terminal.ts when DeepSeek is launched with Teamwork.
- Added `"deepseek"` to `interactiveForegroundProcesses` for proper terminal title detection.
- Updated test expectation to match new behavior.

## Verification
- `npm test`: 37 files, 119 tests passed.
- `npm run typecheck`: clean.

## Notes
- DeepSeek TUI has no CLI flag for interactive mode with initial prompt; delayed pty.write is the workaround.
- If 3s is insufficient on slow machines, the constant `delayedBootstrapWriteMs` can be tuned.
