---
kind: sharkbay_task
taskId: K8V2N5-u3960864-m81ae10
taskTag: K8V2N5
mode: task
title: Fix attention/idle auto-clear when app loses focus
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: d86274c8-69b1-49a6-85b5-5ca4211dea23
branch: feat/island-overlay
createdAt: 2026-06-08T01:06:35Z
updatedAt: 2026-06-08T01:06:35Z
completedAt: 2026-06-08T01:06:35Z
commits:
  - 366faefb
---

## Summary
Fixed a bug where attention/idle states on the active agent tab were immediately cleared even when SharkBay was not focused, preventing the user from ever seeing them.

## Files
- src/renderer/App.tsx

## Work
- Added `document.hasFocus()` guard to auto-clear effect — only clears idle/attention when the window actually has focus
- Added window `focus` event listener so the clear fires when the user returns to SharkBay
- Added `document.hasFocus()` guard to `agentTabLightState` so the project pill also shows attention/idle for the active tab when the app is in the background
- Added focus/blur listeners to the project pill computation effect so it recomputes when window focus changes

## Verification
- TypeScript passes (`npx tsc --noEmit --moduleResolution node` — no errors)
- Logic: when SharkBay loses focus, `document.hasFocus()` returns false, so neither the auto-clear fires nor is the pill state suppressed. When focus returns, the focus listener triggers both the clear and the pill recomputation.

## Notes
- The auto-clear at line ~1047 was the root cause: it fires on every `hookStateByTerminalId` change and clears immediately without checking window focus.
- `agentTabLightState` was a secondary issue — it suppressed the pill display even if the state hadn't been cleared yet.
