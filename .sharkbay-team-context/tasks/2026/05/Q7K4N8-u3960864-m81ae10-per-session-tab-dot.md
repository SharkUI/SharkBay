---
kind: sharkbay_task
taskId: Q7K4N8-u3960864-m81ae10
taskTag: Q7K4N8
mode: task
title: Fix agent tab dot to show per-session state
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 4bb2a3b2-644d-4e7e-8f5f-6d39c7a7e868
branch: main
createdAt: 2026-05-30T10:33:29Z
updatedAt: 2026-05-30T11:17:17Z
completedAt: 2026-05-30T11:17:17Z
commits:
  - 7b2e1941
---

## Summary
Fix agent tab status dot to show per-session state instead of per-project state, so multiple agent tabs in the same project show independent indicators.

## Files
- src/main/hooks/state-manager.ts
- electron/ipc.ts
- src/renderer/App.tsx

## Work
- Root cause: state was keyed by projectId — all agent tabs in same project shared one dot.
- State manager: changed map key from projectPath to `projectPath\0sessionId`, added sessionId to HookStateEvent.
- IPC relay: pass sessionId from state manager through to renderer (was hardcoded null).
- Renderer DashboardView: added hookStateBySessionId storing {state, projectId} per agent session.
- Renderer TerminalPane: added useMemo that maps agentSessionId → terminalSessionId via heuristic (most recently created unassigned agent tab in matching project), derives per-terminal state.
- Tab dot now reads hookStateByTerminalId[tab.session.id] instead of hookActivityByProjectId[space.projectId].
- Project list pill still uses hookActivityByProjectId for project-level aggregation.

## Verification
- `npm run typecheck` passes.
- `npm test` passes: 40 files, 157 tests.
- `npm test -- tests/codewhale-hooks.test.ts` passes (9 tests, exercises AgentHookStateManager).

## Notes
- Related: N3K7V2-u3960864-m81ae10 (wired the dot), 0ced4fc3 (added idle dot)
- The agentSession→terminal mapping uses a creation-time heuristic: newest unassigned agent tab in the project gets matched first.
- Stale mapping entries (closed tabs) are harmless — they point to terminal IDs no longer in spaces, so useMemo excludes them from results.
