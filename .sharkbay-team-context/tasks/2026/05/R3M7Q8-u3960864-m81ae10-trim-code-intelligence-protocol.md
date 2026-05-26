---
kind: sharkbay_task
taskId: R3M7Q8-u3960864-m81ae10
taskTag: R3M7Q8
mode: quick
title: Trim code intelligence protocol
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e633b-10c4-7561-a52f-e660da21a851
branch: main
createdAt: 2026-05-26T13:06:53Z
updatedAt: 2026-05-26T13:07:23Z
completedAt: 2026-05-26T13:07:23Z
---

## Summary
Removed implementation-lifecycle wording from the Code Intelligence protocol guidance so agents only see structural query guidance.

## Files
- .sharkbay/tasks/R3M7Q8-u3960864-m81ae10-trim-code-intelligence-protocol.md
- .sharkbay/harness/protocol.md
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts

## Work
- Reviewed the current Code Intelligence wording and prior CodeGraph task notes.
- Planned a wording-only trim so agents are not told about CodeGraph lifecycle management.
- Removed CodeGraph lifecycle/install/sync/uninstall wording from the generated protocol template and current local protocol.
- Updated the harness test assertion to focus on the structural query guidance.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/teamwork-harness.test.ts`
- `npm run typecheck`
- `rg -n "Code Intelligence|CodeGraph|lifecycle|initialize|sync|uninstall|codegraph query|codegraph context" .sharkbay/harness/protocol.md src/main/teamwork-harness.ts tests/teamwork-harness.test.ts`
- `git diff --check`

## Notes
- The CodeGraph extension and lifecycle manager are not implemented yet.
- No commit was produced.
