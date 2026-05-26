---
kind: sharkbay_task
taskId: Q4N7X2-u3960864-m81ae10
taskTag: Q4N7X2
mode: quick
title: Refine code intelligence protocol
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e64b4-2e32-7dd2-b80a-774ed2ef3f9d
branch: main
createdAt: 2026-05-26T14:35:14Z
updatedAt: 2026-05-26T14:50:22Z
completedAt: 2026-05-26T14:50:22Z
commits:
  - 18c5cf0b08088e3d4a8253707ce3f87b14e4f4d5
---

## Summary
Refined the SharkBay harness Code Intelligence wording so agents prefer the configured CodeGraph install and preserve quotes in the context command example.

## Files
- .sharkbay/tasks/Q4N7X2-u3960864-m81ae10-refine-code-intelligence-protocol.md
- .sharkbay/harness/protocol.md
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts

## Work
- Searched team context for prior CodeGraph and protocol work before editing.
- Noted related prior tasks `J5K8N2-u3960864-m81ae10` and `R3M7Q8-u3960864-m81ae10` to keep this as a usage-only wording change.
- Located the generated protocol source and matching harness test assertion.
- Updated the current protocol, generated protocol template, and harness test assertion for the new CodeGraph preference wording.
- Committed the tracked generated protocol template and test changes.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/teamwork-harness.test.ts`
- `npm run typecheck`
- `git diff --check`
- `rg -n "CodeGraph installed|prefer CodeGraph|codegraph context \"what you need to understand\"|codegraph query" .sharkbay/harness/protocol.md src/main/teamwork-harness.ts tests/teamwork-harness.test.ts`

## Notes
- User requested that CodeGraph be stated as installed/configured and preferred over `rg` for code searches, and that the `codegraph context "..."` example include quoted arguments.
- `.sharkbay/` local harness and task files are ignored by Git; the commit will include the tracked generator and test updates.
