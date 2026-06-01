---
kind: sharkbay_task
taskId: W3K8F2-u3960864-m81ae10
taskTag: W3K8F2
mode: task
title: New Worktree context menu action
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 76f66cdb-a4cf-4d5c-934f-e2bbbc27d2ce
branch: main
createdAt: 2026-06-01T05:29:22Z
updatedAt: 2026-06-01T05:57:27Z
completedAt: 2026-06-01T05:57:27Z
commits:
  - d21ce650
---

## Summary
Added a "New Worktree" action to the project card context menu that creates a git worktree with a new branch and registers it as a SharkBay project.

## Files
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/main/worktree.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- electron/ipc.ts
- electron/preload.mts
- tests/ipc-channels.test.ts

## Work
- Added `createWorktree` IPC channel (`git:createWorktree`).
- Created `src/main/worktree.ts` with handler that runs `git worktree add <targetDir> -b <branch>`, then calls `addConfiguredProject` and `renameProject` to register the new worktree as a project with display name `<baseName>:<branchName>`.
- Registered handler in `electron/ipc.ts`, exposed in `electron/preload.mts` under config section.
- Added `CreateWorktreeInput` / `CreateWorktreeResult` types to shared types, and `createWorktree` to the renderer `SharkBayBridge` type.
- Added "New Worktree" context menu item (visible only for local git-managed projects) and a modal with branch name input in `App.tsx`.
- After successful creation, project list is refreshed via `onRefresh`.
- Updated IPC channels snapshot test.

## Verification
- `npm run typecheck` passes.
- `npm test` — 157/157 tests pass across 40 files.
- `npm run build` succeeds.

## Notes
- Addresses issue #12.
- No workspace model changes — worktree is just a new local project directory.
- Target directory is placed alongside the source project: `../<baseName>-<sanitizedBranch>`.
- Branch characters not matching `[a-zA-Z0-9._-]` are replaced with `-` in the directory name.
