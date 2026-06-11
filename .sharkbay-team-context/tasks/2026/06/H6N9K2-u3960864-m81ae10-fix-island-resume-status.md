---
kind: sharkbay_task
taskId: H6N9K2-u3960864-m81ae10
taskTag: H6N9K2
mode: quick
title: Fix island resume status
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019eb5ff-e4b1-7801-887a-3e8411b5b76f
branch: main
createdAt: 2026-06-11T09:33:17Z
updatedAt: 2026-06-11T10:44:29Z
completedAt: 2026-06-11T09:39:10Z
commits:
  - 1ef151f296dcdddbdcf3d12a5bed89074b457a31
---

## Summary
Fixed island status selection after Codex/Claude resume or session switching by selecting the latest hook event per terminal and cleaning all stale hook mappings for a terminal.

## Files
- src/renderer/App.tsx
- electron/ipc.ts

## Work
- Confirmed issue #17 likely comes from multiple hook sessions mapping to one terminal without timestamp-based selection.
- Related team context: K8V3N7-u3960864-m81ae10, V7K3P9-u3960864-m81ae10, T4K8M2-u3960864-m81ae10, V8KR2T-u3960864-m81ae10.
- Updated renderer state aggregation so one terminal uses the latest hook event by timestamp, with a `working`-only unique project+agent fallback for unresolved terminalSessionId.
- Updated terminal cleanup paths to clear all hook sessions associated with the terminal.
- Updated main-process helper paths to choose the latest mapped hook session and delete all terminal mappings on exit.
- Replied to and closed GitHub issue #17 as completed.

## Verification
- `npm run typecheck`
- `npm test`

## Notes
- Keep island visuals unchanged; fix the upstream hook-session to terminal-status mapping.
