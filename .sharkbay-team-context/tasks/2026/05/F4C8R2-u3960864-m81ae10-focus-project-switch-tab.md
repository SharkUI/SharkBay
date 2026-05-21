---
kind: sharkbay_task
taskId: F4C8R2-u3960864-m81ae10
taskTag: F4C8R2
mode: task
title: Focus default tab after project switch
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
branch: main
createdAt: 2026-05-21T02:45:20Z
updatedAt: 2026-05-21T03:04:26Z
completedAt: 2026-05-21T03:04:26Z
commit: c176d5c3d4d9648526438f8eb6885ba0b01ae98e
---

## Summary
Project switches now explicitly request focus for the active terminal or embedded browser tab. Embedded browser views also focus their web contents when activated.

## Files
- .sharkbay/tasks/F4C8R2-u3960864-m81ae10-focus-project-switch-tab.md
- src/renderer/App.tsx
- src/main/browser-tabs.ts

## Work
- Searched team context for project switch, terminal, and embedded browser history.
- Reviewed related task records R9T2K6-u3960864-m81ae10 and 3YGNE7-u3960864-m81ae10 before changing project-switch behavior.
- Added a per-project active-tab focus request when selecting a project or terminal/browser tab.
- Reused the existing terminal focus path and made BrowserView activation focus the browser webContents.
- Preparing a commit for the focused source changes.
- Committed the source changes in `c176d5c3d4d9648526438f8eb6885ba0b01ae98e`.

## Verification
- `npm run typecheck`
- `npm test -- tests/browser-tabs.test.ts tests/renderer-workflow.test.ts`

## Notes
- Keep project detail tabs persistent across project switches per R9T2K6-u3960864-m81ae10.
- Preserve browser home selection behavior from 3YGNE7-u3960864-m81ae10.
