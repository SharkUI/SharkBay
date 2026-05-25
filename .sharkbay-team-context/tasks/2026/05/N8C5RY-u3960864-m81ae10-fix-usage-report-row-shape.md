---
kind: sharkbay_task
taskId: N8C5RY-u3960864-m81ae10
taskTag: N8C5RY
mode: quick
title: Fix usage report row shape
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e5f25-42dc-7383-89e5-ebbb479bc38c
branch: main
createdAt: 2026-05-25T13:27:51Z
updatedAt: 2026-05-25T13:31:44Z
completedAt: 2026-05-25T13:31:44Z
---

## Summary
Fixed the usage detail window crash caused by report rows returning snake_case token fields. Usage report rows are now mapped to camelCase in the DB layer, and the renderer normalizes legacy snake_case rows before rendering.

## Files
- src/main/token-usage-db.ts
- src/usage-window/UsageReport.tsx
- tests/token-usage-db.test.ts
- .sharkbay/tasks/N8C5RY-u3960864-m81ae10-fix-usage-report-row-shape.md

## Work
- Reviewed related team context tasks T8M3X5 and L6Q2NV.
- Identified that usage report SQL rows are returned as snake_case fields while the renderer expects camelCase fields.
- Added explicit SQL-row to renderer-row mapping for usage report breakdowns.
- Added usage window report normalization so current dev sessions can tolerate legacy snake_case rows.
- Added a DB test covering camelCase report rows.

## Verification
- `npm test -- tests/token-usage-db.test.ts tests/ipc-channels.test.ts tests/codex-sessions.test.ts` passed.
- `npm run typecheck` passed.
- `npx vite build` passed.
- `git diff --check -- src/main/token-usage-db.ts src/usage-window/UsageReport.tsx tests/token-usage-db.test.ts .sharkbay/tasks/N8C5RY-u3960864-m81ae10-fix-usage-report-row-shape.md` passed.

## Notes
- Preserve unrelated dirty token usage work from the existing feature branch state.
