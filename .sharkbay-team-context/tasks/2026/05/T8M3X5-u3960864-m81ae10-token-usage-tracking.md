---
kind: sharkbay_task
taskId: T8M3X5-u3960864-m81ae10
taskTag: T8M3X5
mode: task
title: Token usage tracking feature
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: e06419bd-4021-4de7-a0dc-16322f7f4c64
branch: main
createdAt: 2026-05-25T12:10:00Z
updatedAt: 2026-05-25T12:30:00Z
completedAt: 2026-05-25T12:30:00Z
---

## Summary
Added SQLite-backed token usage tracking that parses Claude Code and Codex JSONL session logs, displays a compact summary in the sidebar, and opens a detail window with per-project/agent/time breakdown and cost estimates.

## Files
- package.json
- vite.config.ts
- tsconfig.renderer.json
- src/main/token-usage-db.ts
- src/main/token-usage-collector.ts
- src/main/token-usage-pricing.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/main/agent-clis.ts
- electron/ipc.ts
- electron/main.ts (unchanged, dynamic import from usage-window.ts)
- electron/usage-window.ts
- electron/preload.mts
- src/renderer/UsageSummary.tsx
- src/renderer/App.tsx
- src/renderer/types.ts
- src/styles/app.css
- src/usage-window/main.tsx
- src/usage-window/UsageReport.tsx
- src/usage-window/usage-window.css
- usage-window.html
- tests/ipc-channels.test.ts
- tests/codex-sessions.test.ts
- docs/shared/usage-detail-mockup.html

## Work
- Added better-sqlite3 dependency with asarUnpack for native module
- Created token-usage-db.ts: SQLite schema (token_events + pricing tables), dedup via source_file+offset, summary/report queries
- Created token-usage-collector.ts: parses Claude Code assistant messages and Codex response_items for usage data, batched insertion
- Created token-usage-pricing.ts: default pricing for Claude/GPT models, cost computation
- Extended AgentSessionWatcher with lineByteOffset tracking and collector hook
- Added usage:getSummary, usage:getReport, usage:openDetail IPC channels
- Created UsageSummary sidebar component (bottom of project-panel, 30s polling)
- Created usage detail window (separate BrowserWindow via Vite multi-page)
- UsageReport component with filter bar, summary cards, daily chart, breakdown tables
- Full day/night theme support in CSS
- Updated renderer SharkBayBridge type with usage namespace
- Fixed tests for new AgentSessionState fields and IPC channel list

## Verification
- `npm install` passes with better-sqlite3
- `npx tsc -p tsconfig.node.json --noEmit` clean
- `npx tsc -p tsconfig.renderer.json --noEmit` clean
- `npx vitest run tests/ipc-channels.test.ts tests/codex-sessions.test.ts` both pass
- Remaining 2 test failures in teamwork-harness.test.ts are pre-existing (live session ID resolution)

## Notes
- Cost is only computed when model matches a known pricing pattern; NULL otherwise
- Collector flushes batch every 50 events or 5 seconds
- Usage window is a singleton — clicking again focuses the existing one
- The `AgentSessionState.lineByteOffset` tracks cumulative bytes for dedup offset
- Pricing table is user-extensible via SQLite (manual INSERT for new models)
- Detail window mockup at docs/shared/usage-detail-mockup.html for design reference
