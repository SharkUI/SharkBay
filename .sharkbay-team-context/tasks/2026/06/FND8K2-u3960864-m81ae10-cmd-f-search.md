---
kind: sharkbay_task
taskId: FND8K2-u3960864-m81ae10
taskTag: FND8K2
mode: task
title: Cmd+F search in agent/shell/browser tabs
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 6e6d3878-d19c-4c90-84f7-a01416b75adb
branch: main
createdAt: 2026-06-23T08:52:23Z
updatedAt: 2026-06-23T12:46:24Z
completedAt: 2026-06-23T12:46:24Z
commits:
  - 88951968
---

## Summary
Added Cmd+F in-tab search with highlight + locate for terminal tabs (agent/shell,
via xterm SearchAddon) and browser tabs (via Electron webContents.findInPage),
driven by a shared renderer SearchOverlay opened from a Find (CmdOrCtrl+F)
application-menu accelerator. Requirement 1 only; history-locate (req 2) deferred.

## Files
- package.json / package-lock.json (add @xterm/addon-search@0.16.0)
- src/renderer/App.tsx (SearchAddon on terminal tabs; SearchOverlay component; wiring)
- src/shared/types.ts (BrowserFindInput/StopFind/FoundInPageEvent)
- src/renderer/types.ts (same types + browser/app bridge methods)
- src/shared/ipc-channels.ts (browserFind/browserStopFind/browserFoundInPage)
- src/shared/app-events.ts (openFind)
- src/main/browser-tabs.ts (find/stopFind + found-in-page forwarding)
- electron/ipc.ts (find/stopFind handlers + foundInPage forwarding/cleanup)
- electron/preload.mts (browser find bridge + onOpenFind)
- src/main/application-menu.ts (Find item, CmdOrCtrl+F)
- electron/main.ts (openFindFromApplicationMenu wiring)
- src/styles/app.css (.search-overlay + night theme + is-searching grid)
- tests/application-menu.test.ts, tests/ipc-channels.test.ts (updated)

## Work
- Terminals: load SearchAddon in createXTerm, expose searchAddon on TerminalShellTab;
  overlay uses findNext/findPrevious (incremental + decorations) and onDidChangeResults
  for the count.
- Browser: BrowserView.webContents.findInPage/stopFindInPage; found-in-page forwarded
  over IPC; overlay uses activeMatchOrdinal/matches for the count.
- Cmd+F registered as an Edit-menu accelerator → app:openFind IPC → renderer overlay,
  dispatched by active tab kind (terminal vs browser; editor tabs ignored).
- Overlay rendered as a flow strip above the active space's surface stack
  (.terminal-space.is-searching switches to a 3-row grid). This avoids the
  BrowserView-covers-renderer-DOM problem: opening the strip shrinks the surface
  host, and the existing ResizeObserver reflows both xterm fit and BrowserView bounds.

## Verification
- npm run typecheck — pass
- npm run build — pass (tsc node + vite)
- npx vitest run — 46 files / 212 tests pass (updated menu + ipc-channels snapshots)
- Not exercised at runtime in a packaged app; logic verified via build/types/tests.
- Bug-fix round: headless node harness (DOM-stubbed) reproduced the proposed-API
  throw and confirmed it disappears with allowProposedApi; typecheck/build/212 tests
  still pass after both fixes.

## Notes
- addon-search 0.16.0 is compatible with @xterm/xterm 6.0.0 (published 27s apart,
  same release train; build-287 betas are the 6.1 line).
- Bug 1 (terminal found nothing): SearchAddon decorations use proposed xterm APIs
  (registerDecoration/registerMarker). Terminal was created without
  `allowProposedApi: true`, so findNext threw "You must set the allowProposedApi
  option" and aborted before selecting/highlighting — fixed by enabling it in
  createXTerm.
- Bug 2 (browser searched only ASCII): the SearchOverlay <input> is a controlled
  React input with no IME handling, so CJK composition triggered searches with
  intermediate pinyin/latin and never cleanly searched the committed text. Fixed
  with composition tracking (composingRef + onCompositionStart/End, keyCode 229
  guard), mirroring PromptInputBar.
- Requirement 2 (history → terminal locate) intentionally deferred by user; would
  reuse SearchAddon and registerMarker, limited to normal-buffer shell tabs.
- Bug 3 (overlay colors not matching appearance): the app has 3 themes
  (day base + night + morning); the overlay only had night overrides, so it was
  unstyled in the morning theme. Added matching morning overrides in app.css so the
  search bar tracks the appearance theme like .prompt-input-bar does.
- Toggle behavior: CmdOrCtrl+F now toggles the search overlay (open/close) via
  setSearchOpen(open => !open); CmdOrCtrl+, toggles Settings (dashboard <-> settings).
  Both menu accelerators fire app events on every press regardless of focus.
- Bug 4 (agent xterm flicker on toggle): the overlay was a flow grid row, so
  opening/closing it resized .xterm-surface-stack -> ResizeObserver -> fitAddon.fit()
  -> PTY resize -> full TUI redraw (flicker). Reworked the overlay to an absolutely
  positioned floating bar rendered INSIDE each surface (XTermSurface over the xterm;
  BrowserSurface inside .browser-view-host), so terminal size never changes -> no
  fit -> no flicker. For browser tabs (BrowserView paints over renderer DOM) the
  view is inset from the top by searchOverlayInsetTop (48px) so the bar stays
  visible; the inset is applied via a dedicated re-bounds effect using a ref, so
  toggling never re-runs the primary effect (whose cleanup hides/detaches the view)
  -> no browser flash.
- Bug 5 (focus jumps back to find when clicking prompt/browser): SearchOverlay's
  focus/subscribe effects depended on the `target` object, which was a fresh literal
  every render, so any parent re-render re-ran them and re-focused the input (and
  re-ran clearDecorations/stopFind). Changed deps to stable primitives
  [target.kind, target.tabId] so they only run on tab change / first open.
