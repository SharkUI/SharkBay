---
kind: sharkbay_task
taskId: FCSID2-u3960864-m81ae10
taskTag: FCSID2
mode: quick
title: Fix Codex session helper
status: completed
completedAt: 2026-07-01T14:18:46Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019f1e00-b4e1-7ec3-8de1-3c74e63596aa
branch: main
createdAt: 2026-07-01T14:16:25Z
updatedAt: 2026-07-01T14:18:46Z
---

## Summary
Fixed the SharkBay harness session helper so Codex tasks keep native session links after Codex 0.142 metadata key-order changes. The helper now accepts current `payload.session_id` metadata and still falls back to older `payload.id`.

## Files
- src/main/harness.ts
- tests/harness.test.ts
- .sharkbay/harness/agent-session-id.sh
- .sharkbay/tasks/FCSID2-u3960864-m81ae10-fix-codex-session-helper.md

## Work
- Started from related investigation task CXSID7-u3960864-m81ae10, which identified the brittle Codex transcript sed parse.
- Updating the generated and deployed Codex session helper to accept current `payload.session_id` metadata before falling back to older `payload.id`.
- Added a harness regression test that installs the helper and resolves a fake Codex transcript whose metadata starts with `session_id`.

## Verification
- `sh -n .sharkbay/harness/agent-session-id.sh`
- `.sharkbay/harness/agent-session-id.sh "Codex GPT-5.5"` returned `019f1e00-b4e1-7ec3-8de1-3c74e63596aa`.
- `codegraph affected src/main/harness.ts tests/harness.test.ts .sharkbay/harness/agent-session-id.sh`
- `npm test -- tests/harness.test.ts` passed: 25 tests.

## Notes
- No commit produced.
