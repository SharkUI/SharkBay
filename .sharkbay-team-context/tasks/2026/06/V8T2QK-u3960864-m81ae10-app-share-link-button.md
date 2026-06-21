---
kind: sharkbay_task
taskId: V8T2QK-u3960864-m81ae10
taskTag: V8T2QK
mode: task
title: In-app Share button for local artifact/site pages
status: completed
completedAt: 2026-06-21T12:31:56Z
commits:
  - 6860bebe
  - 18110d62
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 959a1b82-7ab2-4fe9-92db-1218af04c786
branch: main
createdAt: 2026-06-21T11:41:05Z
updatedAt: 2026-06-21T12:40:51Z
---

## Summary
Add a "Get share link" button at the right of the embedded browser address bar
that appears only when the current page is a local `file://` `.html`/`.htm`. It
uploads the page to share.sharkbay.xyz (via the main process, with the repo's
githubUserId + machineId) and shows the resulting shareable URL with open + copy.

## Files
- src/shared/ipc-channels.ts (add share channel)
- src/main/share-artifact.ts (new: read file, resolve identity, POST to share API)
- src/main/share-popover.ts (new: frameless native popover window for the result)
- electron/ipc.ts (register handlers)
- electron/preload.mts (expose bridge.share.create + share.popover)
- src/renderer/types.ts (bridge type)
- src/renderer/App.tsx (BrowserSurface Share button + native popover trigger)
- src/styles/app.css (Share button styles)
- tests/ipc-channels.test.ts (channel guard updated)

## Work
- Chosen design (user-directed): no page-DOM injection; add the button to
  SharkBay's own browser toolbar UI. Upload happens in the main process so there
  is no file:// CORS issue and the original file bytes are sent.
- Identity from getLocalHarnessIdentity(repoRoot) where repoRoot is derived by
  splitting the file path on `/.sharkbay/`.
- Sends { html, title, githubUserId, machineId, appVersion } to the share API
  (identity model from S9H4RX); no upload token shipped in the open-source app.
- Result UI: a DOM dropdown is hidden behind the embedded BrowserView (native
  views paint above renderer DOM). Switched to a frameless, always-on-top child
  BrowserWindow positioned at the Share button's screen rect (anchor computed in
  the renderer via window.screenX/Y + getBoundingClientRect). It shows
  loading/done/error; Copy/Open/Close are anchor links intercepted in main via
  will-navigate (clipboard / shell.openExternal / close); closes on blur. Themed
  light/dark to match the app.

## Verification
- `npm run typecheck` — passes.
- `npm run build` — passes.
- `npm test` — 46 files / 210 tests pass (ipc-channels guard updated for
  `share:artifact` and `share:popover`).
- Live behavior (popover positioning/DPI, upload) not exercisable here; verified
  by build/tests/review. Popover placement math may need a small tweak after a
  real run.

## Iterations (user feedback)
- Button shows icon + "Share" label.
- Popover readability fixed; then replaced the DOM popover with a native window
  (see Work) because the BrowserView covered it. User confirmed positioning is
  correct.
- Removed the popover window shadow (MARGIN=0, window hugs the card).
- "Open" now opens the share URL in the built-in browser (main sends
  `share:openUrl` to the renderer → opens a browser tab in the selected space),
  not the system browser.
- App now also sends `githubLogin` so the shared page can show the uploader.

## Notes
- Depends on the share.sharkbay.xyz service (task S9H4RX).
- IMPORTANT ops note: the app sends no SHARE_UPLOAD_TOKEN, so that env var must be
  UNSET on the server, otherwise app uploads get 401.
- Share API base overridable via env SHARKBAY_SHARE_API for testing; default
  https://share.sharkbay.xyz.
- Known limitation: non-self-contained site pages (if any reference relative
  assets) lose those assets when shared as a single file; artifacts are
  self-contained.
