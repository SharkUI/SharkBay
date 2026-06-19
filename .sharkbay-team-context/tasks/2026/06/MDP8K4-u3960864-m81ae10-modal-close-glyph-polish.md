---
kind: sharkbay_task
taskId: MDP8K4-u3960864-m81ae10
taskTag: MDP8K4
mode: quick
title: Polish modal close glyph and Add Project typography
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude (claude-opus-4.8)
sessionId: cc0ae2e7-3e87-40e2-86bc-e4955b6960ae
branch: main
createdAt: 2026-06-19T14:27:14Z
updatedAt: 2026-06-19T14:47:59Z
completedAt: 2026-06-19T14:47:59Z
commits:
  - 3512cc2c
---

## Summary
Replace the literal "x" modal close buttons with a proper ✕ glyph (SVG) across
all dialogs, and align the Add Project modal's font sizes to the app's ~13px
content scale (calibrated against docs/screenshot.png).

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- All 5 modal header close buttons: literal "x" -> stroke ✕ SVG matching
  `.icon-button svg`.
- (Tried a macOS traffic-light close on Add Project; reverted per request —
  kept the corner ✕.)
- Add Project modal type scale: dialog title 18px -> 16px (scoped), copy body
  12px -> 13px, note 11px -> 12px, section heading weight to 600.
- Base `.button` had no font-size (inherited 14px root) making non-compact
  action buttons oversized; set base `.button` font-size: 13px.

## Verification
- `npm run typecheck` — pass. `npm run build` — pass.

## Notes
- Close-glyph change is app-wide for consistency (all dialogs share the same
  literal "x"); tab-bar close affordance left unchanged (separate component).
