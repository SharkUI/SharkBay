---
kind: sharkbay_task
taskId: R6M4T8-u3960864-m81ae10
taskTag: R6M4T8
mode: task
title: Allow protocol install without git
status: completed
completedAt: 2026-05-31T10:48:05Z
commits:
  - 508a2e95
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: e60cc129-c0f7-4b0c-8c0d-3f861ed7116f
branch: main
createdAt: 2026-05-31T10:45:39Z
updatedAt: 2026-05-31T10:48:05Z
---

## Summary
Allow protocol harness installation (local task tracking) without git. Team sync remains gated on git + GitHub remote.

## Files
- src/main/harness.ts
- electron/ipc.ts
- src/renderer/App.tsx
- tests/harness.test.ts

## Work
- Removed git requirement from `installHarness` — git exclude steps are now conditional on `isGitWorktree()`.
- Removed `assertHarnessInstallable` call from `installProtocol` in ipc.ts.
- Split `installProtocol` into two paths: full (git+remote → sync enabled) and local-only (no git → harness installed, sync disabled).
- Changed `getProtocolStatus` to report `installed: true` when harness exists, regardless of context branch.
- Updated "Install Protocol" card text to not mention GitHub requirement.
- Updated empty state copy from "local Git projects" to "local projects".
- Updated test to expect successful install in non-git directory.

## Verification
- TypeScript: both tsconfig.renderer.json and tsconfig.node.json — clean
- Tests: 157 passed, 0 failed

## Notes
- Prior task W2N8K4 added the Git panel init prompt for git init/clone.
- scanTasks already works without git (just reads .sharkbay/tasks/ directory).
- installHarness writes files to .sharkbay/ — no inherent git dependency.
- Team sync (context branch, push/pull) requires git + GitHub remote.
- Design: split install into local harness (no git) vs full protocol (git+remote for sync).
