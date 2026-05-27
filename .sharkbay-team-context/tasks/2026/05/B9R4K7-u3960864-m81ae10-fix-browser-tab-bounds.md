---
kind: sharkbay_task
taskId: B9R4K7-u3960864-m81ae10
taskTag: B9R4K7
mode: quick
title: Fix browser tab bounds
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e6875-e82e-7be2-82bf-6730faea76dc
branch: main
createdAt: 2026-05-27T15:19:21Z
updatedAt: 2026-05-27T15:23:35Z
completedAt: 2026-05-27T15:23:35Z
---

## Summary
Fixed embedded browser tab sizing and placement by keeping the project detail panel visible instead of expanding browser tabs across the right side.

## Files
- .sharkbay/tasks/B9R4K7-u3960864-m81ae10-fix-browser-tab-bounds.md
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Searched team context for browser tab and BrowserView history; relevant prior tasks include F4C8R2-u3960864-m81ae10 and K7S4N2-u3960864-m81ae10.
- Reproduced the issue in the running packaged SharkBay app: activating a browser tab hides the detail panel and expands the BrowserView across the right side.
- Removed the browser-tab-driven detail panel hiding path so BrowserView bounds remain constrained to the terminal panel host.

## Verification
- `codegraph affected src/renderer/App.tsx src/styles/app.css`
- `npm run typecheck`
- `npm test -- tests/browser-tabs.test.ts tests/renderer-workflow.test.ts`
- `git diff --check -- src/renderer/App.tsx src/styles/app.css .sharkbay/tasks/B9R4K7-u3960864-m81ae10-fix-browser-tab-bounds.md`
- Started `npm run dev`, opened the Electron dev app, and verified a new browser tab keeps the right detail panel visible while the BrowserView stays inside the terminal panel.

## Notes
- Root cause appears to be `detailPanelHidden = activeTerminalTabKind === "browser"` driving dashboard grid columns to hide the detail panel, so BrowserView bounds follow an expanded host.
