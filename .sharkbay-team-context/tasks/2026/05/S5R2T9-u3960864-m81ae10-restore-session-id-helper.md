---
kind: sharkbay_task
taskId: S5R2T9-u3960864-m81ae10
taskTag: S5R2T9
mode: quick
title: Restore session id helper
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e5e19-3c4b-7492-85b5-66ba8499582e
branch: main
createdAt: 2026-05-25T07:47:59Z
updatedAt: 2026-05-25T07:49:52Z
completedAt: 2026-05-25T07:49:52Z
---

## Summary
Restored agent sessions now carry their known task `sessionId` through `SHARKBAY_RESTORED_SESSION_ID`. The session id helper returns that value directly before falling back to native session discovery.

## Files
- .sharkbay/harness/agent-session-id.sh
- src/main/teamwork-harness.ts
- src/shared/agent-session-restore.ts
- tests/agent-session-restore.test.ts
- tests/teamwork-harness.test.ts
- .sharkbay/tasks/S5R2T9-u3960864-m81ae10-restore-session-id-helper.md

## Work
- Started task after checking related team context tasks T8H4V2-u3960864-m81ae10, R7S4M2-u3960864-m81ae10, and D8S3K6-u3960864-m81ae10.
- Added a restore-session environment handoff so restored agent sessions can return the known task session id directly.
- Kept the local harness helper and generated source script in sync.

## Verification
- `sh -n .sharkbay/harness/agent-session-id.sh`
- `SHARKBAY_RESTORED_SESSION_ID=33333333-3333-4333-8333-333333333333 .sharkbay/harness/agent-session-id.sh "Codex GPT-5"`
- `npm test -- tests/agent-session-restore.test.ts tests/teamwork-harness.test.ts`
- `npm run typecheck`
- `git diff --check`
- Confirmed `.sharkbay/harness/agent-session-id.sh` matches `AGENT_SESSION_ID_SCRIPT` in `src/main/teamwork-harness.ts`.

## Notes
- `.sharkbay/team-context/` is read-only.
- No commit produced.
