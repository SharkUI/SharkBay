---
kind: sharkbay_task
taskId: V7K3P9-u3960864-m81ae10
taskTag: V7K3P9
mode: task
title: Fix hook session to terminal tab matching
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 2d6f306e-1f3d-40f5-a1e2-bf7bfa2db586
branch: main
createdAt: 2026-05-30T13:40:22Z
updatedAt: 2026-05-30T13:51:46Z
completedAt: 2026-05-30T13:51:46Z
commits:
  - 10bc5f35
---

## Summary
Fix the agent hook session → terminal tab matching by using PID-based process tree resolution instead of the broken "newest unassigned tab" heuristic. The hook CLI now passes the agent PID, and the main process walks the process tree to find which terminal owns the agent.

## Files
- src/main/hooks/cli/sharkbay-hook.ts
- src/main/hooks/types.ts
- src/main/hooks/bridge.ts
- src/main/hooks/state-manager.ts
- src/main/hooks/connectors/opencode.ts
- electron/ipc.ts
- src/shared/types.ts
- src/renderer/types.ts
- src/renderer/App.tsx

## Work
- Hook CLI sends `process.ppid` (agent PID) in bridge message for all connectors (main hook, CodeWhale hook, OpenCode plugin)
- Added `pid` field to `HookBridgeMessage`, `UnifiedHookEvent`, `HookStateEvent`, `AgentProjectStatusEvent`
- Main process (ipc.ts) caches terminal PIDs from create/update events
- On hook stateChange, resolves agent PID → terminal via process tree walk (up to 5 levels)
- Caches resolved `hookSessionToTerminal` mapping; cleans up on terminal exit
- Added `terminalSessionId` field to `AgentProjectStatusEvent`
- Renderer uses server-resolved `terminalSessionId` when available; falls back to heuristic for sessions without PID
- Fixed potential stale assignment bug by applying server-resolved mappings before building assignedTerminals set

## Verification
- `npm run typecheck` passes
- `npm test` passes: 40 files, 157 tests

## Notes
- Related: Q7K4N8-u3960864-m81ae10 (introduced the heuristic)
- The heuristic fallback is preserved for agents that don't report PID (e.g., older hook scripts before reinstall)
- After this change, hooks need reinstall to get PID reporting. This happens automatically on next app start (bridge.ts regenerates the scripts).
