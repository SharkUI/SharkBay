---
kind: sharkbay_task
taskId: Z5Q8HD-u3960864-m81ae10
taskTag: Z5Q8HD
mode: task
title: Fix usage token cache accounting
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e628b-0d2a-70b3-b6d3-bd88c8786231
branch: main
createdAt: 2026-05-26T04:35:51Z
updatedAt: 2026-05-26T06:18:53Z
completedAt: 2026-05-26T06:18:53Z
status: completed
---

## Summary
Fixed token usage reporting so Codex and Claude Code show comparable fresh input, cache write/read, and total input values. The Settings usage UI now labels fresh input separately from cache read tokens instead of comparing Codex inclusive input against Claude non-cache input.

## Files
- src/main/token-usage-collector.ts
- src/main/token-usage-db.ts
- src/shared/types.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/styles/app.css
- tests/token-usage-collector.test.ts
- tests/token-usage-db.test.ts
- .sharkbay/tasks/Z5Q8HD-u3960864-m81ae10-fix-usage-token-caches.md

## Work
- Reviewed prior token usage tasks T8M3X5, K7W3N9, N8C5RY, and U7P4Q9 from team context.
- Planned report-layer normalization so Codex's inclusive cached input and Claude's split cache fields are presented with the same fresh/cache/total vocabulary.
- Updated usage report rows and totals to include `cacheCreationTokens`, `cacheReadTokens`, and `totalInputTokens`.
- Updated the per-agent usage UI to display Fresh input, Output, Cache write/read, and Total input, with tables widened safely for the extra columns.
- Added pure unit coverage for the Codex-vs-Claude cache accounting rules.
- Added future duplicate protection for Codex `token_count` events when `total_token_usage` has not advanced.

## Verification
- `npm test -- tests/token-usage-db.test.ts tests/token-usage-collector.test.ts` passed.
- `npx tsc -p tsconfig.node.json --noEmit` passed.
- `npx tsc -p tsconfig.renderer.json --noEmit` passed.
- `npm run build` passed.
- `git diff --check -- src/main/token-usage-collector.ts src/main/token-usage-db.ts src/shared/types.ts src/renderer/types.ts src/renderer/App.tsx src/styles/app.css tests/token-usage-collector.test.ts tests/token-usage-db.test.ts .sharkbay/tasks/Z5Q8HD-u3960864-m81ae10-fix-usage-token-caches.md` passed.

## Notes
- Preserve `.sharkbay/team-context/` as read-only.
- No commit was produced.
