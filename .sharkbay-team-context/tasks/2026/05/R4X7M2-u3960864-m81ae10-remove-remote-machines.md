---
kind: sharkbay_task
taskId: R4X7M2-u3960864-m81ae10
taskTag: R4X7M2
mode: task
title: Remove remote machine (SSH) functionality
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 3855312a-f158-451b-ba9e-67b304bac236
branch: remove-remote-machines
createdAt: 2026-05-28T02:39:45Z
updatedAt: 2026-05-28T04:00:43Z
completedAt: 2026-05-28T04:00:43Z
commits:
  - aa47fe74
---

## Summary
Removed all remote machine / SSH functionality from SharkBay — dedicated source files, SSH provider, IPC handlers, types, UI components, styles, tests, and documentation.

## Files
- src/main/remote-machines.ts (deleted)
- src/main/remote-files.ts (deleted)
- src/main/remote-git.ts (deleted)
- src/main/port-forwards.ts (deleted)
- src/providers/ssh/ (deleted)
- docs/remote-machine.md (deleted)
- tests/remote-git.test.ts (deleted)
- tests/remote-machines.test.ts (deleted)
- tests/ssh-provider.test.ts (deleted)
- tests/port-forwards.test.ts (deleted)
- electron/core-host.ts
- electron/ipc.ts
- electron/preload.mts
- src/shared/types.ts
- src/shared/ipc-channels.ts
- src/core/project-uri.ts
- src/core/core-service.ts
- src/core/diagnostics.ts
- src/main/config.ts
- src/main/scanner.ts
- src/main/terminal.ts
- src/main/agent-clis.ts
- src/main/project-icons.ts
- src/plugins/bundled/agent-detector.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/renderer/workflow.ts
- src/styles/app.css
- src/profiles/profile-orchestrator.ts
- tests/config-migration.test.ts
- tests/core-provider-registry.test.ts
- tests/diagnostics.test.ts
- tests/ipc-channels.test.ts
- tests/project-icons.test.ts
- tests/renderer-workflow.test.ts
- tests/scanner.test.ts
- tests/terminal.test.ts
- README.md

## Work
- Deleted 6 dedicated remote source files and 4 dedicated remote test files
- Removed SshProvider from core-host and provider registry
- Removed all remote machine IPC handlers, port forward manager, and secret store usage from electron/ipc.ts and preload.mts
- Removed RemoteMachine, RemoteMachineInput, port forward types, ssh from ExecutionTargetKind unions across shared and renderer types
- Removed SSH URI parsing from project-uri.ts
- Removed SSH latency tracking from diagnostics
- Removed remote machine config management (add/remove/upsert/normalize)
- Removed remote project scanning from scanner.ts
- Removed SSH terminal launch logic and isRemote tracking
- Removed remote agent CLI detection over SSH
- Removed remote project icon resolution over SSH
- Removed RemoteMachineDialog, RemoteMachineDetailPanel, MachineProfileCard, PortForwardsDetailTab UI components
- Removed remote machine settings nav section and port forwards tab
- Removed ~700 lines of remote machine CSS
- Updated README to remove remote machine references
- Fixed all affected test files

## Verification
- `npx tsc --noEmit -p tsconfig.node.json` — passes
- `npx tsc --noEmit -p tsconfig.renderer.json` — passes
- `npm test` — 36 test files, 135 tests pass

## Notes
- The `ssh://` project URI scheme is no longer supported
- `ExecutionTargetKind` now only includes "local" | "container" | "wsl"
- `executionTargetKindForTargetId` falls back to "local" instead of "ssh" for unknown target IDs
- Some dead `isRemote = false` assignments remain in App.tsx — harmless, can be cleaned up later
- The `inline-connection-result` CSS class remains (used by other features)
