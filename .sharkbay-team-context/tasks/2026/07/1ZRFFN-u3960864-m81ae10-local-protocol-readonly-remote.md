---
kind: sharkbay_task
taskId: 1ZRFFN-u3960864-m81ae10
taskTag: 1ZRFFN
mode: task
title: Allow local protocol for read-only remotes
status: completed
completedAt: 2026-07-01T14:34:20Z
commits:
  - 9963f39f
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f1de8-0b29-7ee0-b340-b3c5d40fed5f
branch: main
createdAt: 2026-07-01T14:10:49Z
updatedAt: 2026-07-01T14:34:20Z
---

## Summary
Allow installing the local SharkBay task protocol when a project has a GitHub remote but the current user lacks write permission.

## Files
- electron/ipc.ts
- tests/ipc-protocol-install.test.ts

## Work
- Reviewed prior team context tasks R6M4T8-u3960864-m81ae10 and K4WBEA-u3960864-m81ae10.
- Identified `installProtocol` as the remaining hard failure path for read-only upstream remotes.
- Changed `installProtocol` so read-only GitHub remotes fall back to local-only harness installation with sync disabled.
- Added an IPC protocol install regression test for a read-only upstream remote.
- Preparing commit at user request.
- Committed tracked source and test changes.

## Verification
- `npm test -- tests/ipc-protocol-install.test.ts` passed.
- `codegraph affected electron/ipc.ts tests/ipc-protocol-install.test.ts`
- `npx tsc -p tsconfig.node.json --noEmit` passed.

## Notes
- Team sync should remain enabled only for write/admin remotes.
