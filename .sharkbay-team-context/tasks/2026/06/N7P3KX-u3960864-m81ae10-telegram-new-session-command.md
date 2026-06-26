---
kind: sharkbay_task
taskId: N7P3KX-u3960864-m81ae10
taskTag: N7P3KX
mode: task
title: Telegram /new 命令（选项目→选 agent→启动新会话并切入）
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: 1ee65bf2-cc08-4040-b4e0-46cb1231006b
branch: main
createdAt: 2026-06-26T10:03:51Z
updatedAt: 2026-06-26T10:15:36Z
completedAt: 2026-06-26T10:15:36Z
commits:
  - af8548d2
---

## Summary
在 Telegram 增加 /new 命令：分步选择项目 → 选择 agent CLI → 在 SharkBay 启动一个全新 agent 会话，并把当前 Telegram 聊天切换到该新会话。

## Files
- src/main/telegram/* / electron/ipc.ts / electron/preload.mts / src/shared/app-events.ts / src/renderer/{App.tsx,types.ts}

## Work
- 关联主实现任务 K9R2WX。
- 渲染层：app-events 加 launchAgentSession；preload onLaunchAgentSession；App.tsx 订阅 → 按 agentId 找 AgentCli → buildAgentLaunchCommand → openAgentSession（无 hookSessionId）。
- service：newWizard 状态机；/new → sendNewProjects（列项目按钮）；callback new:p:<i> → 列 agent；new:a:<i> → startNewSession（提示→快照 currentOpenTerminalIds→launchSession→waitForNewTerminal 20s 取新 terminalId→resolveHookForTerminal→registerChat 切入当前聊天→startTyping）。attach 重构出 registerChat 复用。feedTerminalData 回填 hookSessionId（新会话 id 启动后才生成）。
- ipc deps：listProjects（已配置项目）/listAgents（core listAgentClis）/launchSession（发 app:launchAgentSession）/currentOpenTerminalIds（latestIslandAgentTabs）/resolveHookForTerminal。
- BOT_COMMANDS / 命令菜单 / /help 均加 new。

## Verification
- typecheck 干净；npm run build 全量重编；npm test 282/54 全绿。
- 运行态（真实启动+切入）需手测：/new → 选项目 → 选 agent → SharkBay 开新 tab → Telegram 自动切入新会话。

## Notes
- 复用渲染层 buildAgentLaunchCommand + openAgentSession（新会话无 hookSessionId）。
- 新会话 hookSessionId 由 agent 首次活动后生成，需经 island 上报回填。
