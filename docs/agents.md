# Agent Guide

This file gives automation agents and contributors the repository-specific context needed to work safely in SharkBay.

## Required Reading

Before doing anything in this worktree, you must read:

- `AGENTS.md` for SharkBay task-record requirements in this worktree.
- `.sharkbay/harness/protocol.md` when present.
- `README.md` for project overview and commands.
- `docs/index.md` for the documentation map.
- `docs/architecture.md` for process, IPC, storage, and safety boundaries.
- `docs/development.md` for validation and packaging commands.
- `docs/tasks.md` before changing protocol behavior.

## Project Shape

- Product: SharkBay
- Project type: local-first macOS Electron developer workbench
- Renderer: React and global CSS, concentrated in `src/renderer/App.tsx`
- Main process: Electron IPC handlers and runtime services in `electron/` and `src/main/`
- Shared contracts: `src/shared/`
- Tests: Vitest unit tests under `tests/`

## Development Commands

| Action | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Start dev app | `npm run dev` |
| Run static checks | `npm run lint` |
| Run typecheck | `npm run typecheck` |
| Run tests | `npm test` |
| Build | `npm run build` |
| Package unpacked app | `npm run pack` |
| Build distributable app | `npm run dist` |
| Check whitespace | `git diff --check` |

`npm run lint` currently runs the TypeScript typecheck.

## Work Rules

- Preserve user changes and unrelated dirty files.
- Keep changes scoped to the requested behavior.
- Prefer existing modules, IPC patterns, types, and tests over new abstractions.
- Treat renderer-provided filesystem paths as untrusted; main-process handlers must re-resolve them against persisted configured projects.
- Do not weaken path safety, IPC exposure, Protocol ownership checks, or generated-file overwrite guards.
- When updating docs, keep README high-level and put implementation detail in `docs/`.

## Verification

Run the checks relevant to the touched surface. Prefer this order for code changes:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. Task-specific manual or scripted verification

For docs-only changes, at minimum inspect the changed files and run a lightweight repository check such as `git diff --check`.

## Task Records

This worktree uses SharkBay Task Protocol. Create or update `.sharkbay/tasks/*.md` records before persistent project changes, and complete the task record after verification. Do not edit `.sharkbay/team-context/` directly.
