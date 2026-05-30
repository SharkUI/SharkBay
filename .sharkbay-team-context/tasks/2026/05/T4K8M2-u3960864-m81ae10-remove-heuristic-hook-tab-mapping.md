---
kind: sharkbay_task
taskId: T4K8M2-u3960864-m81ae10
taskTag: T4K8M2
mode: task
title: Remove heuristic hook-to-tab mapping in renderer
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: f8e84f7d-3967-418e-8e64-7cacc8cbcc9e
branch: main
createdAt: 2026-05-30T14:59:39Z
updatedAt: 2026-05-30T15:02:05Z
completedAt: 2026-05-30T15:02:05Z
---

## Summary
Remove the fallback heuristic in renderer that guesses session→tab mappings, keeping only server-resolved PID-based mappings.

## Files
- src/renderer/App.tsx
- electron/ipc.ts
- src/main/hooks/state-manager.ts

## Work
- Removed renderer fallback heuristic that guessed session→tab by createdAt — only server-resolved PID mappings are trusted now.
- Added `pendingHookResolutions` map in ipc.ts: when PID resolution fails, the session is queued for retry.
- On `terminalUpdate` (when new terminal PID registers), pending sessions are re-resolved and status re-sent with the correct terminalSessionId.
- Extended `AgentHookStateManager.getStatus()` to support lookup by sessionId (for re-send on late resolution).

## Verification
- `npx tsc -p tsconfig.renderer.json --noEmit` — clean
- `npx tsc -p tsconfig.node.json --noEmit` — clean

## Notes
- Root cause: after `pkill -f "electron ."` kills SharkBay, restart loses terminalPidToId. The heuristic then mis-assigns sessions to tabs. Removing heuristic + adding retry ensures correctness at the cost of a brief delay before tab dots appear (until PID walk succeeds).
