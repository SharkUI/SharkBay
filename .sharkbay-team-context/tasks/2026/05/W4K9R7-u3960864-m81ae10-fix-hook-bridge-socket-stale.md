---
kind: sharkbay_task
taskId: W4K9R7-u3960864-m81ae10
taskTag: W4K9R7
mode: task
title: Fix hook bridge socket path file going stale
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 3f4b1793-88f1-40bb-af41-11a88d9a8c59
branch: main
createdAt: 2026-05-30T08:27:45Z
updatedAt: 2026-05-30T09:05:58Z
completedAt: 2026-05-30T09:05:58Z
commits:
  - 99b6d228
---

## Summary
Fix hook-based agent status indicators (traffic lights and project card pills) breaking after app restarts by preventing the socket path file from going stale.

## Files
- src/main/hooks/bridge.ts
- electron/ipc.ts

## Work
- Root cause: `HookBridge.start()` had no idempotency guard. When `registerIpcHandlers` is called multiple times (or across app restarts with lingering file state), the socket path file can end up pointing to a dead socket from a prior instance.
- Evidence: live socket is `90c1ad44` but socket path file pointed to dead `3c990cb2`.
- The hook CLI reads the stale socket path file, tries to connect to the dead socket, and silently discards events.
- Fix 1: add early-return guard in `HookBridge.start()` when `this.server` is already set — prevents double-bind and ensures the socket path file is only written once on successful listen.
- Fix 2: assign server to `this.server` AFTER successful bind (not before) to avoid losing reference to a functioning server on retry.
- Fix 3: add `hookBridge.removeAllListeners("event")` in ipc.ts to prevent duplicate event handler accumulation.
- Immediate fix: manually corrected the stale socket path file to point to the live socket.

## Verification
- `npm run typecheck` passes.
- `npm test` passes: 40 files, 157 tests.
- Hook log immediately shows fresh events after socket path file correction.
- `npm run build` compiles successfully with guard present in output.

## Notes
- Related: H7K9P2-u3960864-m81ae10, N3K7V2-u3960864-m81ae10, K2W8R4-u3960864-m81ae10
- The status pill renders when `hookActivityByProjectId[candidate.id]` is truthy. The traffic light renders when `hookActivityByProjectId[space.projectId]` equals "working" or "attention". Both are downstream of the hook bridge delivering events.
- App needs repackaging for the code fix to take effect in production. Socket path file correction provides immediate relief.
