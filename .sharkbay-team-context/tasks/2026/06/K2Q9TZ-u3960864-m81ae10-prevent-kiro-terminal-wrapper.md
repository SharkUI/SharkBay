---
kind: sharkbay_task
taskId: K2Q9TZ-u3960864-m81ae10
taskTag: K2Q9TZ
mode: quick
title: Prevent Kiro terminal wrapper
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019ec97d-bff5-7c02-bb55-4c7e1a7ce7a5
branch: main
createdAt: 2026-06-15T04:57:24Z
updatedAt: 2026-06-15T05:01:03Z
completedAt: 2026-06-15T05:01:03Z
commits:
  - bc833ef922d13897320c40e3aef36bba801c64c6
---

## Summary
SharkBay-created terminals now mark themselves as already launched by Kiro/Q, preventing Kiro's zsh integration from re-execing them through `kiro-cli-term`. This keeps idle shell tab titles deriving from cwd while preserving existing agent CLI title behavior.

## Files
- .sharkbay/tasks/K2Q9TZ-u3960864-m81ae10-prevent-kiro-terminal-wrapper.md
- src/main/terminal.ts
- tests/terminal.test.ts

## Work
- Investigated Kiro zsh integration and found it launches `kiro-cli-term` unless `PROCESS_LAUNCHED_BY_Q` is present.
- Related context: `J5L8N2-u3960864-m81ae10` and `F6T9Q2-u3960864-m81ae10` intentionally preserve agent CLI labels while those CLIs run.
- Planned a scoped environment fix for SharkBay ptys without changing agent CLI title behavior.
- Added `PROCESS_LAUNCHED_BY_Q=1` to SharkBay terminal environments and asserted it in terminal tests.

## Verification
- `npm test -- tests/terminal.test.ts`
- `npm run typecheck`
- `env -u Q_TERM -u Q_TERM_TMUX -u QTERM_SESSION_ID PROCESS_LAUNCHED_BY_Q=1 zsh -lic '...'` confirmed `Q_TERM` stays empty under the SharkBay terminal env.
- `git diff --check`

## Notes
- `.sharkbay/team-context/` was searched and read-only related records were reviewed.
