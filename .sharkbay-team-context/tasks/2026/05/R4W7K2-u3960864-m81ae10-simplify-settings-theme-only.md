---
kind: sharkbay_task
taskId: R4W7K2-u3960864-m81ae10
taskTag: R4W7K2
mode: quick
title: Simplify Settings to theme-only
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
createdAt: 2026-05-17T11:28:00Z
updatedAt: 2026-05-17T11:30:00Z
completedAt: 2026-05-17T11:30:00Z
---

## Summary
Simplified the Settings view to only show the theme picker, removing the sidebar navigation, project management panel, and status panel.

## Files
- src/renderer/App.tsx

## Work
- Removed SettingsSection type and settingsSections constant.
- Replaced SettingsView with a minimal version: back button, heading, and AppearanceSettingsPanel only.
- Removed ProjectWorkflowPanel, SettingsStatusPanel, Fact components.
- Removed unused formatScanTime helper.
- Simplified SettingsView call site props.

## Verification
- npm run typecheck passes.
- npm test passes (57 tests).

## Notes
- Project add/remove is still available from the dashboard project panel header and context menu.
