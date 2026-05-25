---
kind: sharkbay_task
taskId: K7W3N9-u3960864-m81ae10
taskTag: K7W3N9
mode: task
title: Redesign usage tracking per-agent in settings
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 6b4bfc8e-2edb-4c8e-b2f2-825015fadaa0
branch: main
createdAt: 2026-05-25T14:58:34Z
updatedAt: 2026-05-25T15:32:37Z
completedAt: 2026-05-25T15:32:37Z
commits:
  - 456bb37f
---

## Summary
Removed standalone usage window. Fixed Codex collector to use event_msg token_count. Added Kiro credits collector. Moved per-agent usage UI into Settings > Agent CLIs detail panels with summary, 7d/30d/all filter, bar chart, per-project breakdown, and daily breakdown.

## Files
- electron/usage-window.ts (deleted)
- usage-window.html (deleted)
- src/usage-window/main.tsx (deleted)
- src/usage-window/UsageReport.tsx (deleted)
- src/usage-window/usage-window.css (deleted)
- src/renderer/UsageSummary.tsx (deleted)
- electron/ipc.ts
- electron/preload.mts
- src/main/token-usage-collector.ts
- src/main/token-usage-db.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- src/styles/app.css
- vite.config.ts
- tests/ipc-channels.test.ts
- tests/token-usage-db.test.ts

## Work
- Removed usage window BrowserWindow, HTML entry, Vite multi-page entry, UsageSummary sidebar button, usageOpenDetail IPC
- Fixed extractCodexUsage: changed from response_item (never worked) to event_msg + token_count using last_token_usage
- Added Kiro backfill: reads ~/.kiro/sessions/cli/*.json, extracts metering_usage credits per turn, stores in cost_usd column
- Added costUsd field to TokenEvent type; updated all SQL queries to aggregate SUM(cost_usd)
- Added AgentCliUsageSection component in AgentCliDetailInstalled with 7d/30d/all range selector, summary stats, bar chart, per-project breakdown, daily breakdown
- Kiro displays credits; Claude/Codex display tokens

## Verification
- `npx tsc -p tsconfig.node.json --noEmit` clean
- `npx tsc -p tsconfig.renderer.json --noEmit` clean
- `npx vitest run` — 38 test files, 122 tests pass
- `npm run build` — vite build succeeds

## Notes
- Codex response_item never had a usage field; the correct source is event_msg with payload.type=token_count
- Known Codex bug (openai/codex#14489): rate-limit-only updates re-emit stale last_token_usage causing overcounting; using last_token_usage directly is acceptable for now since the bug is intermittent
- Kiro only provides credits locally (input_token_count/output_token_count always 0); credits stored in cost_usd column
- Prior work: T8M3X5 created the original token usage feature
