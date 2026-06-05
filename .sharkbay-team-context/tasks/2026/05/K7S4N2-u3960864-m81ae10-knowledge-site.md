---
kind: sharkbay_task
taskId: K7S4N2-u3960864-m81ae10
taskTag: K7S4N2
mode: task
title: Implement Knowledge Site feature
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: kiro
createdAt: 2026-05-17T02:15:00Z
updatedAt: 2026-05-17T02:32:00Z
completedAt: 2026-05-17T02:32:00Z
commit: aab974f7
---

## Summary
Added built-in Knowledge Site feature: generates a static HTML site from project README/docs and team-context tasks, opens in SharkBay's embedded browser via a TEAM panel entry.

## Files
- src/main/knowledge-site.ts
- src/main/browser-tabs.ts
- src/main/teamwork-sync.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- electron/ipc.ts
- electron/preload.mts
- tests/ipc-channels.test.ts
- tests/browser-tabs.test.ts
- package.json

## Work
- Checked team context for overlapping work — none found.
- Added `marked@15.0.7` dependency for markdown rendering.
- Implemented `src/main/knowledge-site.ts`: discovers README.md + docs/**/*.md + team-context tasks, renders to static HTML with inline CSS, uses content hash to skip unnecessary rebuilds. Output to `.sharkbay/site/`.
- Added IPC channels `knowledgeSite:generate` and `knowledgeSite:getPath` with handlers and preload exposure.
- Hooked `generateKnowledgeSite` into `TeamworkSync.syncOnce()` (non-blocking, fires after successful sync).
- Added "Knowledge Site" action card in TEAM panel (visible when Teamwork is installed), opens embedded browser tab.
- Added `openBrowserTab` to `TerminalPaneHandle` for detail panel → browser tab communication.
- Allowed `file:` protocol in `normalizeBrowserUrl` so embedded browser can load local site HTML.

## Verification
- `npm run typecheck` passes.
- `npm test` — all 56 tests pass.
- `npm run build` succeeds.

## Notes
- Task data source is `.sharkbay/team-context/tasks/` (synced from sharkbay-team-context branch), not local `.sharkbay/tasks/`.
- README/docs change detection uses file content hash, not git status.
- Site is pure static HTML, no JS, openable directly via file:// in browser.
- `.sharkbay/site/` is already excluded from git by the harness's `.git/info/exclude` rule for `/.sharkbay/`.
