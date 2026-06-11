---
kind: sharkbay_task
taskId: I7P3W9-u3960864-m81ae10
taskTag: I7P3W9
mode: quick
title: Only session-card clicks should open the main window from the island
status: completed
completedAt: 2026-06-11T09:00:46Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: 1a7166f9-a9d3-4954-87f0-ed97c51985f7
branch: main
createdAt: 2026-06-11T08:27:49Z
updatedAt: 2026-06-11T09:00:46Z
commits:
  - 94fea9b5
---

## Summary
Clicking any island region currently surfaces the main SharkBay window. Restrict
that so only clicking a session card opens (and locates) the main window; clicking
elsewhere on the island just expands/collapses the pill.

## Files
- electron/main.ts

## Work
- First attempt (reverted): guarded `app.on("activate")` with a "pointer over island"
  flag. Did not work — on macOS `app.on("activate")` maps to dock-click/reopen, not to
  clicking the app's own window, so it never fired for island clicks.
- Real root cause: the island is a normal always-on-top window. `focusable: false`
  alone does not stop a click from activating the app on macOS (per docs,
  setFocusable "does not remove the focus from the window"), so clicking anywhere on
  the island activates SharkBay and brings the main window to the front.
- Fix: create the island as a non-activating macOS panel
  (`type: "panel"` + existing `focusable: false`). Clicking it no longer activates the
  app. The "open + locate session" path (`islandFocusSession`, scoped to `.session-row`)
  still calls `mainWin.show()/focus()` explicitly, so card clicks work and dock-click
  reopen (M3K7V2) is untouched.

## Verification
- Build: `npm run typecheck` (tsc renderer + node) passed.
- Manual (user to confirm, requires a FULL app restart — main-process/window-creation
  change, dev hot-reload won't apply it): click island pill/blank panel area → main
  window must NOT come to front; click a session card → main window opens and focuses
  that session; click dock icon with main window hidden → main window reopens (M3K7V2).

## Notes
- Related prior task: M3K7V2-u3960864-m81ae10 (fix dock click reopen main). Do not
  regress that behavior.
- Island window is intentionally kept alive when the main window closes.
- `app.on("activate")` does NOT fire from clicking the app's own window on macOS; it
  is dock-click/reopen only. The fix is at the window level (`type: "panel"`), not in
  the activate handler.
- The change only takes effect on a fresh Electron launch (the island window is
  created once at startup).
