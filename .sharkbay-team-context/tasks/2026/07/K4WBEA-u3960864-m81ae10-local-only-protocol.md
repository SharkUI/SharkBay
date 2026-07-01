---
kind: sharkbay_task
taskId: K4WBEA-u3960864-m81ae10
taskTag: K4WBEA
mode: task
title: Clarify local-only protocol behavior
status: completed
completedAt: 2026-07-01T13:47:35Z
commits:
  - 3c0100e5
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f1de8-0b29-7ee0-b340-b3c5d40fed5f
branch: main
createdAt: 2026-07-01T13:41:59Z
updatedAt: 2026-07-01T14:25:45Z
---

## Summary
Clarified that the SharkBay harness protocol remains usable without a GitHub repo while team context sync is unavailable. Updated the generated protocol template, current local protocol copy, and harness tests.

## Files
- src/main/harness.ts
- tests/harness.test.ts
- .sharkbay/harness/protocol.md

## Work
- Reviewed prior team context task R6M4T8-u3960864-m81ae10, which established local-only protocol installation without git.
- Identified generated protocol wording as the likely gap; install/status logic already supports local-only use.
- Changed team context protocol wording to be conditional on GitHub repo sync being configured.
- Added local-only harness test assertions for protocol wording generated without a repo.
- Preparing commit at user request.
- Committed tracked source and test changes.

## Verification
- `codegraph affected src/main/harness.ts tests/harness.test.ts .sharkbay/harness/protocol.md`
- `npm test -- tests/harness.test.ts` passed: 24 tests.

## Notes
- Team context remains read-only and should only be searched when present/synced.
