---
kind: sharkbay_task
taskId: M2P6W4-u3960864-m81ae10
taskTag: M2P6W4
mode: task
title: Migrate Agent CLIs to Settings panel
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 4daee965-1411-4a2e-8683-51b107b1a1ef
branch: main
createdAt: 2026-05-24T05:38:00Z
updatedAt: 2026-05-24T05:38:00Z
completedAt: 2026-05-24T05:38:00Z
commit: bd2c48d9
---

## Summary
Added "Agent CLIs" section to Settings showing installed agent CLIs with icons and paths, plus an Install button that opens the existing InstallAgentDialog.

## Files
- src/renderer/App.tsx

## Work
- Added `agent-clis` to SettingsSection type.
- Added TerminalIcon component for nav.
- Added Agent CLIs nav item between Appearance and Extensions.
- Created AgentClisSettingsPanel: fetches installed CLIs via bridge, renders list with AgentCliIcon + label + executablePath, Install button opens InstallAgentDialog targeting local machine, refreshes list on install complete.

## Verification
- npm run typecheck passes.

## Notes
- Panel is ready for future expansion (uninstall, update, per-agent config).
- InstallAgentDialog reused as-is from existing code.
