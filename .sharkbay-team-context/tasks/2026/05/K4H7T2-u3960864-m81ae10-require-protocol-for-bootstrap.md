---
kind: sharkbay_task
taskId: K4H7T2-u3960864-m81ae10
taskTag: K4H7T2
mode: quick
title: Require protocol for bootstrap
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e746f-0a65-76a0-9f90-cd1fd59513b5
branch: main
createdAt: 2026-05-29T15:52:33Z
updatedAt: 2026-05-29T15:55:49Z
completedAt: 2026-05-29T15:55:49Z
commits:
  - 60daa77382bc2bb743ffd451810e325cb9cedd23
---

## Summary
Bootstrap prompt injection now requires the installed protocol file at `.sharkbay/harness/protocol.md`, not just the `.sharkbay/` directory.

## Files
- .sharkbay/tasks/K4H7T2-u3960864-m81ae10-require-protocol-for-bootstrap.md
- src/main/harness.ts
- tests/harness.test.ts

## Work
- Searched team context for prior bootstrap prompt and harness protocol work, including `P6T9R4-u3960864-m81ae10` and `N8C4V7-u3960864-m81ae10`.
- Used CodeGraph to locate the bootstrap prompt injection path in `src/main/harness.ts`.
- Changed bootstrap injection to require `isHarnessInstalled()`, which checks `.sharkbay/harness/protocol.md`.
- Added coverage for a repo that has `.sharkbay/` but no harness protocol file.
- Preparing a git commit for the tracked harness and test changes.
- Committed tracked changes as `60daa77382bc2bb743ffd451810e325cb9cedd23`.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/harness.test.ts` passed.
- `git diff --check -- src/main/harness.ts tests/harness.test.ts .sharkbay/tasks/K4H7T2-u3960864-m81ae10-require-protocol-for-bootstrap.md` passed.
- `codegraph affected src/main/harness.ts tests/harness.test.ts` reported `tests/harness.test.ts`.

## Notes
- User requested bootstrap prompt injection require `.sharkbay/harness/protocol.md`, not just `.sharkbay/`.
