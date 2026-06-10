---
kind: sharkbay_task
taskId: DU470E-u3960864-m81ae10
taskTag: DU470E
mode: task
title: App update hint
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 98720d29-1281-49d4-93fd-a974937597cf
branch: main
createdAt: 2026-06-10T01:52:00Z
updatedAt: 2026-06-10T02:07:09Z
completedAt: 2026-06-10T02:07:09Z
commits:
  - 8e57c3dc
---

## Summary
Added a rough app update indicator that fetches GitHub latest release on startup, and if the version differs from the running app version and the release is >48h old, shows a clickable "vX.Y.Z available" pill at the bottom-left corner.

## Files
- vite.config.ts
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Injected `__APP_VERSION__` from package.json into renderer via vite `define`
- Added `UpdateHint` component: fetches GitHub latest release on mount, compares tag to current version, checks 48h threshold, renders clickable button
- Added `.update-hint` CSS: fixed bottom-left, minimal pill style with night theme variant
- Clicking the hint opens the release page via `shell.openExternal`

## Verification
- `npm run build` passes
- `npm run typecheck` passes

## Notes
- Uses public GitHub API directly from renderer (no IPC needed for public repos)
- No auth — rate limit is 60 req/h per IP, sufficient for startup-only check
- Repo hardcoded as SharkUI/SharkBay
