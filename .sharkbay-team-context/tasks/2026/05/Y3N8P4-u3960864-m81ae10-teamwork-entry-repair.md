---
kind: sharkbay_task
taskId: Y3N8P4-u3960864-m81ae10
taskTag: Y3N8P4
mode: task
title: Teamwork entry repair
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e3652-c845-7d42-b7e2-bff9b0a0339b
createdAt: 2026-05-17T15:11:50Z
updatedAt: 2026-07-01T14:25:45Z
completedAt: 2026-05-18T03:27:51Z
commit: b4dcec69a93c58a474c8bdbcbe76639f77636b90
---

## Summary
Implemented non-eager Teamwork installation and per-agent entry-file repair before agent launch.

## Files
- src/main/teamwork-harness.ts
- src/main/terminal.ts
- src/shared/types.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- tests/teamwork-harness.test.ts
- docs/teamwork.md
- docs/development.md
- docs/product.md
- docs/architecture.md
- README.md

## Work
- Started task and confirmed the current adapter template and terminal launch path.
- Changed Teamwork install to write only `.sharkbay` harness state and `/.sharkbay/` local exclude.
- Added per-agent Teamwork entry repair for matching agent launch, preserving project-owned content outside the managed block.
- Routed renderer agent launches through an explicit `agentId` so the main process does not guess from command text.
- Adjusted uninstall to preserve user `.git/info/exclude` edits while removing SharkBay's own `/.sharkbay/` line when applicable.
- Updated tests and docs for on-demand entry files.

## Verification
- `npm run typecheck`
- `npm run test -- tests/teamwork-harness.test.ts tests/terminal.test.ts`
- `npm run test`
- `npm run build`

## Notes
- User decided installation should only write `.sharkbay/` and `/.sharkbay/` exclude; entry files should be maintained only when the matching agent starts.
