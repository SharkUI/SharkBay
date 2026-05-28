---
kind: sharkbay_task
taskId: JGGB9O-u3960864-m81ae10
taskTag: JGGB9O
mode: task
title: Remove Stack detail panel
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro
sessionId: 7ee3b4bd-dcb6-4cee-a6dc-15ae26f64789
branch: main
createdAt: 2026-05-28T04:32:42Z
updatedAt: 2026-05-28T04:42:23Z
---

## Summary

Removed the Stack detail panel tab and cleaned up all unused profiles IPC/bridge code (readMachineProfile, readProjectProfile) across the renderer, preload, IPC handlers, core-host dispatch, core-protocol, and channel definitions.

## Files

- src/renderer/App.tsx
- src/renderer/types.ts
- electron/preload.mts
- electron/ipc.ts
- electron/core-host.ts
- src/core/core-protocol.ts
- src/shared/ipc-channels.ts
- tests/ipc-channels.test.ts

## Work

- Removed StackDetailTab component (~100 lines), ProfileChipFact helper, and "stack" tab entry from App.tsx
- Removed MachineProfile and ProjectProfile imports from App.tsx
- Removed all profile-related types from renderer/types.ts (ExecutionTargetKind, ProfileReadOptions, ProfileWarning, ToolProfile, MachineProfile, DetectedProfileItem, DetectedPackageManager, ProjectServiceProfile, ProjectWorkspaceProfile, ProjectProfile) and the profiles bridge block
- Removed profiles block (readMachine, readProject) from electron/preload.mts and unused type imports
- Removed readMachineProfile and readProjectProfile IPC handlers from electron/ipc.ts
- Removed readMachineProfile and readProjectProfile from electron/core-host.ts dispatch map
- Removed readMachineProfile and readProjectProfile from CoreMethodMap in core-protocol.ts
- Removed readMachineProfile and readProjectProfile channel definitions from ipc-channels.ts
- Updated ipc-channels test snapshot

## Verification

- `npm run typecheck` passes
- `npm run build` passes
- `npm test` — all 135 tests pass (36 files)

## Notes

- Backend profiles system retained: profile-orchestrator.ts, core-service.ts methods, shared/types.ts types, profile-cache.ts, local-provider.ts — all still used internally by core (e.g. scanProjects calls readMachineProfile).
- CSS classes (project-facts-card, repository-fact) shared with Git tab — not removed.
