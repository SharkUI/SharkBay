---
kind: sharkbay_task
taskId: C0PQBT-u3960864-m81ae10
taskTag: C0PQBT
mode: task
title: Terminal URL click and context menu
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: a6ef2e33-ab48-4161-a39e-37c9fe2cd11c
branch: main
createdAt: 2026-06-06T12:09:54Z
updatedAt: 2026-06-06T12:54:38Z
completedAt: 2026-06-06T12:54:38Z
commits:
  - c4ab708c
  - 07bf21cd
---

## Summary
Add terminal URL interaction: left-click opens URL in SharkBay's internal browser tab, right-click shows a context menu with "Open in Default Browser" (system browser) and "Copy URL" options.

## Files
- src/shared/ipc-channels.ts
- electron/ipc.ts
- electron/preload.mts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/styles/app.css
- tests/ipc-channels.test.ts

## Work
- Added `openExternal` IPC channel (`shell:openExternal`) for opening URLs in system default browser.
- Wired `shell.openExternal` handler in electron/ipc.ts using Electron's `shell` module.
- Exposed `shell.openExternal` in preload bridge and typed it in `SharkBayBridge`.
- Modified `createXTerm` to accept an `onLinkClick` callback; left-click on URL calls this to open an internal browser tab via `openBrowserTab`.
- Added `hoveredLink` ref to `TerminalShellTab`; tracked via `WebLinksAddon` hover/leave options.
- Modified `XTermSurface` to show a context menu on right-click when a link is hovered:
  - "Open in Default Browser" → `shell.openExternal` (system browser)
  - "Copy URL" → clipboard
- Added `.terminal-link-context-menu` CSS with light and night theme variants.
- Updated IPC channels test to include the new channel.

## Verification
- `npm run typecheck` passes (both renderer and node configs).
- `npm test` passes (40 test files, 158 tests).
- `npm run build` succeeds (production build).

## Notes
- The `WebLinksAddon` `hover`/`leave` options track the URL text under cursor; the context menu only appears if a link is hovered at right-click time.
- Also set `linkHandler` on the XTerm instance to override the default OSC 8 link behavior (which shows a `confirm()` dialog). Both OSC links and regex-detected links now use the same open-in-internal-browser behavior.
- Uses `navigator.clipboard.writeText` for copy (already used elsewhere in the project).
- Uses `?.` optional chaining on bridge calls since the shell API may not be available in non-Electron contexts.
