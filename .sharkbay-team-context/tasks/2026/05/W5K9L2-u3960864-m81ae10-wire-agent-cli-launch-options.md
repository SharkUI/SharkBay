---
kind: sharkbay_task
taskId: W5K9L2-u3960864-m81ae10
taskTag: W5K9L2
mode: task
title: Wire agent CLI launch options end-to-end
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 4daee965-1411-4a2e-8683-51b107b1a1ef
branch: main
createdAt: 2026-05-24T05:57:00Z
updatedAt: 2026-05-24T05:57:00Z
completedAt: 2026-05-24T05:57:00Z
commits:
  - de679b09
  - 7b376823
  - 431254f8
  - f691452a
  - abb75573
  - a173b4bb
---

## Summary
Wired download button to open settings Agent CLIs section, removed InstallAgentDialog from TerminalPane, made launch options checkable with localStorage persistence, wired selections into agent launch command, fixed settings fluid width.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Download button in terminal header now opens Settings → Agent CLIs (via onOpenAgentCliSettings prop chain).
- Removed InstallAgentDialog state and rendering from TerminalPane.
- Added settingsSection state + initialSection prop to SettingsView with useEffect sync.
- Launch options are now checkboxes; selections persisted to localStorage (key: sharkbay:agent-launch-flags:<agentId>).
- openAgentProjectTab reads persisted flags and appends them to the launch command.
- Removed max-width: 720px from settings-section-panel for fluid layout.
- Added checkbox CSS styling for option rows.

## Verification
- npm run typecheck passes.

## Notes
- Builds on T3J8R5 (agent CLIs detail panel).
- InstallAgentDialog still exists in code (used by AgentCliDetailNotInstalled in settings).
