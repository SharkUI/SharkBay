---
kind: sharkbay_task
taskId: 3YGNE7-u3960864-m81ae10
taskTag: 3YGNE7
mode: quick
title: Use knowledge site as embedded browser home page
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: kiro
createdAt: 2026-05-17T03:21:46Z
updatedAt: 2026-05-17T03:22:00Z
completedAt: 2026-05-17T03:22:00Z
---

## Summary

When opening a new embedded browser tab, use the project's knowledge site as the home page if available, falling back to the existing service URL or about:blank logic.

## Files
- src/renderer/App.tsx

## Work
- Modified `openBrowserProjectTab` to call `knowledgeSite.getPath` when no running service is detected.
- If a knowledge site path is returned, opens the browser at `file://<sitePath>`.
- Falls back to `about:blank` if the API is unavailable or throws.
- `file:` protocol was already allowed by `normalizeBrowserUrl` in browser-tabs.ts.

## Verification
- `npm run typecheck` passes (both renderer and node configs).

## Notes
- Related to K7S4N2 (original Knowledge Site implementation).
- `getPath` returns the expected path without checking file existence; if the site hasn't been generated yet, the browser will show a file-not-found page. The user can trigger generation via the TEAM panel button.
