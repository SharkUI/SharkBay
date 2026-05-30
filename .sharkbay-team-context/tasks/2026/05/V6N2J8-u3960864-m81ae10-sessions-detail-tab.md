---
kind: sharkbay_task
taskId: V6N2J8-u3960864-m81ae10
taskTag: V6N2J8
mode: task
title: Add Sessions detail tab from hooks log
status: completed
completedAt: 2026-05-30T01:18:34Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: c7bf41f7-691b-48ff-a3cf-4567c6449adc
branch: main
createdAt: 2026-05-30T01:14:15Z
updatedAt: 2026-05-30T01:18:34Z
---

## Summary
Add a "Sessions" tab in the right detail panel (left of Tasks) that lists agent sessions parsed from hooks.log, sorted by last event time desc. Clicking a session either jumps to an existing terminal tab or restores the session in a new tab.

## Files
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/main/hooks/sessions.ts (new)
- electron/ipc.ts
- electron/preload.mts
- src/renderer/types.ts
- src/renderer/App.tsx
- tests/ipc-channels.test.ts

## Work
- New IPC: `hooks:getSessions` parses hooks.log → SessionViewModel[]
- Detail tab "Sessions" before Tasks, localOnly
- Each session row: agent icon, model short name, turn count, sorted by lastEventAt desc
- Click: find open terminal with matching session → focus; else restore via buildAgentSessionRestoreCommand

## Verification
- tsc --noEmit passes (both node and renderer configs)
- All 142 tests pass

## Notes
- Session detection: match terminal tabs by env var SHARKBAY_RESTORED_SESSION_ID or by agentId + timing
- hooks.log parsing is lightweight — typically <5000 lines per project
