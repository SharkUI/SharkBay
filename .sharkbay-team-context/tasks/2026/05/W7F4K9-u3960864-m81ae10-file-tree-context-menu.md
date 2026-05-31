---
kind: sharkbay_task
taskId: W7F4K9-u3960864-m81ae10
taskTag: W7F4K9
mode: task
title: Add file tree context menu
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 2c97761c-3abf-4f1f-a491-56034f89481a
branch: main
createdAt: 2026-05-31T01:47:43Z
updatedAt: 2026-05-31T02:04:05Z
completedAt: 2026-05-31T02:04:05Z
commits:
  - 7e50aefb
---

## Summary
Added right-click context menu to the Files Panel tree with 7 actions: New File, New Folder, Edit (file only), Rename, Copy Path, Diff (file only, opens git diff in terminal), and Delete.

## Files
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/main/file-content.ts
- src/core/core-protocol.ts
- src/core/core-service.ts
- src/core/execution-provider.ts
- src/providers/local/local-provider.ts
- electron/ipc.ts
- electron/preload.mts
- electron/core-host.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- tests/ipc-channels.test.ts

## Work
- Added `deleteProjectFile` and `renameProjectFile` IPC channels end-to-end (shared types → execution provider interface → local provider → core service → core protocol → core host → electron IPC → preload → renderer bridge types).
- Implemented context menu UI in `FilesDetailTab` using the same pattern as the project card context menu (absolute-positioned div, pointer/keydown dismiss).
- Added inline rename input and inline create input to `ProjectFileTreeItemRow`.
- New File creates an empty file; New Folder creates a directory via `.gitkeep` placeholder.
- Edit action is equivalent to double-click (opens file in editor).
- Diff action reuses existing `onOpenGitDiff` (opens terminal with `git --no-pager diff`).
- Copy Path copies the full absolute path to clipboard.
- Delete uses recursive `fs.rm` with path safety checks.
- Updated IPC channels snapshot test.
- Fixed: file tree now shows root directory node so users can create files/folders at project root.
- Fixed: New File / New Folder only shown when right-clicking a directory.
- Fixed: `writeLocalProjectFile` now creates parent directories (`mkdir -p`) so new file/folder creation works.
- Fixed: Copy Path uses absolute path (project root + relative path).

## Verification
- `tsc -p tsconfig.renderer.json --noEmit` passes.
- `tsc -p tsconfig.node.json --noEmit` passes.
- `vitest run` — 40 test files, 157 tests all pass.

## Notes
- The context menu reuses the existing `.project-context-menu` CSS class.
- Rename inline input uses a new `.project-file-rename-input` class (needs CSS styling).
- New Folder creates a `.gitkeep` inside the directory since `writeFile` only writes files; a dedicated `mkdir` IPC could be added later.
- Related team tasks: R9T2K6, P4M8Q1, V3N8W2 (project context menu pattern).
