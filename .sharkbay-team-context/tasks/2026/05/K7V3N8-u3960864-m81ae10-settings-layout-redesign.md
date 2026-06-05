---
kind: sharkbay_task
taskId: K7V3N8-u3960864-m81ae10
taskTag: K7V3N8
mode: task
title: Settings layout redesign (Codex-style)
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 4daee965-1411-4a2e-8683-51b107b1a1ef
branch: main
createdAt: 2026-05-24T04:55:00Z
updatedAt: 2026-05-24T05:32:00Z
completedAt: 2026-05-24T05:32:00Z
commit: e59e892b
---

## Summary
Rewrote settings to 1:1 match Codex layout. Removed Local Machine section entirely. Replaced theme segmented control with SVG preview cards from git history (commit 6aab3cfb).

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Removed Local Machine nav item and content panel (project removal available from main screen).
- Default section changed to Appearance.
- Nav items now have icons (SettingsGearIcon removed, SunIcon, PuzzleIcon, ActivityIcon, ServerIcon added).
- Replaced segmented theme control with ThemePreviewSvg cards showing 3-column layout preview per theme.
- Added settings-theme-grid, settings-theme-card, settings-theme-preview, settings-theme-label CSS.
- Added night theme overrides for theme cards, back button, nav border.
- Nav uses border-right separator, back button at top, full-bleed content area.

## Verification
- npm run typecheck passes.

## Notes
- ThemePreviewSvg and card design restored from commit 6aab3cfb.
- ProjectWorkflowPanel and SettingsStatusPanel still exist in code but are no longer rendered in settings.
