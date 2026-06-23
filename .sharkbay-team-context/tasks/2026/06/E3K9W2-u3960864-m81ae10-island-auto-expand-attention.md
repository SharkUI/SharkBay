---
kind: sharkbay_task
taskId: E3K9W2-u3960864-m81ae10
taskTag: E3K9W2
mode: task
title: Island auto-expand on attention + scrollbar + activity auto-collapse
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: ccafb45b-ec2d-4687-9387-9aeaf720db58
branch: main
createdAt: 2026-06-23T11:43:06Z
updatedAt: 2026-06-23T12:56:36Z
completedAt: 2026-06-23T12:56:36Z
commits:
  - 676809594fd95cbf4a82bd2d7867f92abee277d8
---

## Summary
The island overlay auto-opens when a session leaves "working" (matching the
sound-notification trigger) and hides its vertical scrollbar. For auto-expands
only, it auto-collapses when the user is active but ignoring it: a mouse move
without hovering after 3s, or main-window keyboard input after 1s. Hovering the
island (or a manual collapse) cancels the pending collapse.

## Files
- src/island/island.html
- electron/island-preload.mts
- electron/main.ts
- electron/preload.mts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts

## Work
- Req 1 (trigger): hasNewAttentionTransition fires only on working ->
  non-working (previousState === "working" && nextState !== "working"), exactly
  mirroring notifySessionTransitions; first empty snapshot still skipped.
- Req 2 (scrollbar): .session-list hides its scrollbar
  (::-webkit-scrollbar { display:none } + scrollbar-width:none), kept scrollable.
- Reqs 3/4 (auto-collapse, auto-expand only):
  - island.html: open(auto=false); auto-expand calls open(true) ->
    beginAutoCollapse; close() and mouseenter call cancelAutoCollapse;
    hover/click opens use open(false) so they do NOT arm collapse.
  - island-preload.mts: exposes beginAutoCollapse / cancelAutoCollapse.
  - main.ts (createIslandWindow): on beginAutoCollapse, poll
    screen.getCursorScreenPoint() every 250ms; cursor inside island bounds ==
    hover -> cancel; a move while not hovering -> requestCollapse(3000).
    islandUserKeyboardActivity -> requestCollapse(1000). requestCollapse keeps
    the soonest pending delay (keyboard 1s can preempt mouse 3s) and fires
    island:collapse. Cleared on cancel and window "closed".
  - Req 4 path (option b): preload.mts dock.notifyIslandKeyboardActivity ->
    channels.islandUserKeyboardActivity; App.tsx adds a capture-phase window
    keydown listener throttled to ~2/sec that forwards activity. Main-window
    only (incl. xterm via capture); typing in other apps does not count.

## Verification
- `npm run typecheck` -> pass (renderer + node, --noEmit).
- island.html inline <script> syntax-checked via node `new Function(...)`.
- Reviewed edge cases: no activity -> stays open; cursor already over island ->
  treated as hover (no collapse); hover-then-leave -> existing mouseleave path;
  keyboard 1s preempts mouse 3s.
- Not runtime-tested in a live Electron session.

## Notes
- Related team context: S6K9Q2, M18MRG / H6N9K2, V9K3R7.
- Constraint that drove the design: the island renderer cannot see global
  mouse-move/keyboard (focusable:false panel + click-through), so global
  activity is detected in the main process (cursor polling) and keyboard is
  forwarded from the main window (option b, no native dep / permission).
- ipcMain.on handlers for island:* are registered once per createIslandWindow
  (called once at startup), matching the existing island:setExpanded pattern.
- Committed the 7 code files as 67680959. The task file is gitignored under
  .sharkbay/, so it is not part of the commit. Not pushed.
- `.sharkbay/team-context/` is read-only.
