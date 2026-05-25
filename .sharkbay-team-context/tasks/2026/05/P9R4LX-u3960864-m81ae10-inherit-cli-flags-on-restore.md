---
kind: sharkbay_task
taskId: P9R4LX-u3960864-m81ae10
taskTag: P9R4LX
mode: quick
title: Inherit CLI launch flags on restore
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e5f25-42dc-7383-89e5-ebbb479bc38c
branch: main
createdAt: 2026-05-25T12:40:22Z
updatedAt: 2026-05-25T12:42:02Z
completedAt: 2026-05-25T12:42:02Z
---

## Summary
Restore-session launches now inherit the Agent CLI launch flags configured in Settings. The restore command builder accepts optional launch flags, and the task restore path reads the same persisted settings used by normal agent launches.

## Files
- src/shared/agent-session-restore.ts
- src/renderer/App.tsx
- tests/agent-session-restore.test.ts
- .sharkbay/tasks/P9R4LX-u3960864-m81ae10-inherit-cli-flags-on-restore.md

## Work
- Reviewed related team context tasks W5K9L2 and R7S4M2 before making changes.
- Added optional launch flags to restore command construction.
- Passed Settings-persisted Agent CLI launch flags into task restore commands.
- Added coverage for restore commands that include configured launch flags.

## Verification
- `npm test -- tests/agent-session-restore.test.ts` passed.
- `npx tsc -p tsconfig.renderer.json --noEmit` passed.
- `git diff --check -- src/shared/agent-session-restore.ts src/renderer/App.tsx tests/agent-session-restore.test.ts .sharkbay/tasks/P9R4LX-u3960864-m81ae10-inherit-cli-flags-on-restore.md` passed.
- `npm run typecheck` failed on pre-existing unrelated dirty work: missing `better-sqlite3` types in `src/main/token-usage-db.ts` and stale `AgentSessionState` fixture fields in `tests/codex-sessions.test.ts`.

## Notes
- Existing unrelated dirty files are present and should remain untouched.
