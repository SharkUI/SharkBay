---
kind: sharkbay_task
taskId: C9H2M7-u3960864-m81ae10
taskTag: C9H2M7
mode: task
title: Fix duplicate agent launch echo
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e4e03-2826-7453-a296-c1eb7e6a0af9
branch: main
createdAt: 2026-05-22T04:58:01Z
updatedAt: 2026-05-22T05:01:27Z
completedAt: 2026-05-22T05:01:27Z
---

## Summary
Delayed terminal initial-command writes until shell startup output settles, preventing SharkBay Teamwork agent launches from showing the long bootstrap command twice. Added regression coverage that confirms delayed initial commands still execute.

## Files
- .sharkbay/tasks/C9H2M7-u3960864-m81ae10-fix-duplicate-agent-launch-echo.md
- src/main/terminal.ts
- tests/terminal.test.ts

## Work
- Searched team context for prior bootstrap, session id, and terminal launch work.
- Relevant prior tasks: Q8M2L6-u3960864-m81ae10, L4V8N3-u3960864-m81ae10, and L3M9C6-u3960864-m81ae10.
- Reproduced the early pty write behavior where zsh echoes the initial command before prompt rendering, then redraws it again at the prompt.
- Updated `TerminalManager` to schedule initial commands after a quiet shell-startup window, with a maximum delay fallback.
- Added terminal test coverage for non-service initial-command execution after shell startup.

## Verification
- `npm test -- tests/terminal.test.ts tests/teamwork-harness.test.ts`
- `npm run typecheck`
- `git diff --check`

## Notes
- User reported Claude startup showing the full `SHARKBAY_SESSION_ID ... claude --session-id ... bootstrap prompt` command twice.
