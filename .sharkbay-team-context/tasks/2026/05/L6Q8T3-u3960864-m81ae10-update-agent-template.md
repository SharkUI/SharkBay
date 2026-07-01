---
kind: sharkbay_task
taskId: L6Q8T3-u3960864-m81ae10
taskTag: L6Q8T3
mode: quick
title: Update agent template
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e3585-7c4e-7793-a29d-820b3366874b
createdAt: 2026-05-17T11:14:13Z
updatedAt: 2026-07-01T14:25:45Z
completedAt: 2026-05-17T11:15:13Z
commit: 55ee65c0
---

## Summary
Updated the SharkBay task protocol template so `agent` is recorded per task, not per project.

## Files
- .sharkbay/harness/protocol.md
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts

## Work
- Started protocol template update after reviewing generated harness code and team context.
- Removed project-level `Agent` from the generated and local protocol.
- Changed the task frontmatter template to `agent: # e.g. Codex GPT-5.5` with examples below the template.
- Added a harness test covering the new protocol output.

## Verification
- `npm test -- tests/teamwork-harness.test.ts tests/build-config.test.ts`
- `npm run typecheck`
- `npm test`

## Notes
- `Project: Agent` is removed because a project can have multiple agents over time.
- Backfilled `agent: Codex GPT-5.5` on C3E7L9-u3960864-m81ae10.
