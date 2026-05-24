---
kind: sharkbay_task
taskId: T3J8R5-u3960864-m81ae10
taskTag: T3J8R5
mode: task
title: Agent CLIs settings with detail panel and launch options
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 4daee965-1411-4a2e-8683-51b107b1a1ef
branch: main
createdAt: 2026-05-24T05:47:00Z
updatedAt: 2026-05-24T05:47:00Z
completedAt: 2026-05-24T05:47:00Z
commit: 4d438b36
---

## Summary
Redesigned Agent CLIs settings panel: lists all 7 agents with installed/not-installed badges, clicking shows detail panel with launch options (installed) or install prompt (not installed).

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Defined allAgentCliDefinitions (static list of all 7 agents) and agentLaunchOptions record with practical CLI flags per agent.
- AgentClisSettingsPanel: left list of all agents with badges, right detail panel.
- AgentCliDetailInstalled: shows executable path + launch options (flag, label, description, choices).
- AgentCliDetailNotInstalled: shows install prompt with button opening InstallAgentDialog.
- Added CSS: agent-clis-layout (grid 200px+1fr), list items, badges, detail header, options rows with code flags.

## Verification
- npm run typecheck passes.

## Notes
- Launch options are informational for now (display only). Future: toggle options to persist as default launch flags.
- Options per agent: Claude (skip-permissions, model, continue), Codex (approval, model, search), Gemini (approval-mode, model, sandbox), Kiro (tui, agent), DeepSeek (approval, model, provider), Qwen/OpenCode (none yet).
