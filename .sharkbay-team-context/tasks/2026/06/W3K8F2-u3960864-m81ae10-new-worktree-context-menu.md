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
updatedAt: 2026-06-01T06:19:08Z
completedAt: 2026-06-01T06:19:08Z
commits:
  - 950287cb3a1396305dad90c5b3f8dd493f64e2a4
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
- Investigating why Git metadata writes fail in the current Codex sandbox before retrying the push.
- Remote `main` was pushed by another agent after advancing past the issue #14 IME fix.

## Verification
- `npm run typecheck` passes.
- `npm test` — 157/157 tests pass across 40 files.
- `npm run build` succeeds.
- `git log --oneline --decorate --max-count=4 main` confirmed local and `origin/main` point at `950287cb`.

## Notes
- Addresses issue #12.
- Codex picked up the completed local task to push it after issue #14 was committed directly on remote `main`; user then had another agent perform the push.
- Local pre-push commit `d21ce650` was superseded by remote commit `950287cb3a1396305dad90c5b3f8dd493f64e2a4`, whose parent is `7904af75a6ca63560545b9599a07d81ebeedd8b5`.
- No workspace model changes — worktree is just a new local project directory.
- Target directory is placed alongside the source project: `../<baseName>-<sanitizedBranch>`.
- Branch characters not matching `[a-zA-Z0-9._-]` are replaced with `-` in the directory name.
