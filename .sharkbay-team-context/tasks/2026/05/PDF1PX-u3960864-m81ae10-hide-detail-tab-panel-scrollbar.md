---
kind: sharkbay_task
taskId: PDF1PX-u3960864-m81ae10
taskTag: PDF1PX
mode: quick
title: Hide detail-tab-panel scrollbar
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Sonnet 4
createdAt: 2026-05-17T13:39:00Z
updatedAt: 2026-05-17T13:39:00Z
completedAt: 2026-05-17T13:39:00Z
---

## Summary
Added scrollbar-hiding styles to `.detail-tab-panel` so the right-side detail panel scrolls without showing a visible scrollbar.

## Files
- src/styles/app.css

## Work
- Identified `.detail-tab-panel` had `overflow: auto` without scrollbar-hiding rules.
- Added `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`.
- Confirmed left sidebar `.project-sections` already hides its scrollbar correctly.

## Verification
- Visual inspection of CSS rules; pattern matches existing `.project-sections` and `.detail-layout` scrollbar hiding.

## Notes
- This is a recurring issue—any new container with `overflow: auto` needs both `scrollbar-width: none` (Firefox/standard) and `::-webkit-scrollbar { display: none }` (Chromium/Electron).
