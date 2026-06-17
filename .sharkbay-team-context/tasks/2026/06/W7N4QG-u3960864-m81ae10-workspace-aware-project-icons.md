---
kind: sharkbay_task
taskId: W7N4QG-u3960864-m81ae10
taskTag: W7N4QG
mode: task
title: Workspace-aware project icon discovery
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 36e01a66-0b7b-4cf7-961d-b61311ec52fa
branch: main
createdAt: 2026-06-17T11:37:46Z
updatedAt: 2026-06-17T11:40:34Z
completedAt: 2026-06-17T11:40:34Z
---

## Summary
Make project logo resolution discover monorepo workspace package directories (pnpm-workspace.yaml / package.json workspaces) so projects whose icons live under a non-standard package dir (e.g. `web/public/icon.png`) display their logo instead of the default icon.

## Files
- src/main/project-icons.ts
- tests/project-icons.test.ts

## Work
- Diagnosed: Zygnal stores icons at `web/public/*`, but `commonIconPaths` only covers `public/*`, `packages/web/public/*`, `apps/web/public/*`. Bare `web/` pnpm workspace package is not matched, so `iconSources` is empty and the renderer falls back to the default icon.
- Decision: dynamic workspace discovery (more robust than hardcoding more paths), no new deps — minimal pnpm-workspace.yaml + package.json workspaces parsing.
- Added `workspacePackageDirs` (parses pnpm-workspace.yaml `packages:` block and package.json `workspaces` array/object, expands a single trailing `*`/`**` segment by listing immediate subdirs) and `workspaceIconPaths` (probes `public/*` icon candidates per package dir).
- Wired workspace-derived paths into `resolveLocalIconSources` as an additive fallback after `packageIconPaths` and `commonIconPaths`; existing hardcoded paths left intact to avoid regressions for repos without workspace declarations.
- Reused `resolveReadableRepoFile` / `resolveRepoPath` / `isPathInside` so all reads stay within the configured-project boundary established by R9T2K6.
- Added two tests (bare pnpm workspace dir, package.json `packages/*` glob).

## Verification
- `npm run typecheck` — passes.
- `npx vitest run` — 45 files / 193 tests pass (incl. 3 project-icons tests).
- `npm run build` — passes (pre-existing >500 kB chunk warning only).
- Real-world: ran compiled `resolveProjectIconSources('/Users/shark/Projects/Zygnal', [repo])` → returns 1 local source `web/public/icon.png` (data:image/png), confirming the logo now resolves.

## Notes
- Prior tasks touching src/main/project-icons.ts: R9T2K6-u3960864-m81ae10 (re-scoped icon path safety around configured project boundaries) and P4M8Q1-u3960864-m81ae10. New code reuses resolveReadableRepoFile / resolveRepoPath to stay within those boundaries.
- Icon suffix order prefers dedicated logo/app icons (project-icon, logo, icon, icon-512) over favicons, so monorepo apps show a real logo rather than a small favicon when both exist. This differs slightly from the favicon-first order in `commonIconPaths`.
- Glob expansion is intentionally limited to a single trailing `*`/`**` segment (covers `packages/*`, `apps/*`); deeper/embedded globs are not expanded.
- No commit produced (user did not request one).
