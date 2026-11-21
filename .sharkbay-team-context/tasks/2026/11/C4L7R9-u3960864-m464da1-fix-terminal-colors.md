---
kind: sharkbay_task
taskId: C4L7R9-u3960864-m464da1
taskTag: C4L7R9
mode: quick
title: 修复 WebUI 终端继承宿主禁色环境
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-14T03:04:01Z
updatedAt: 2026-11-14T03:05:17Z
completedAt: 2026-11-14T03:05:17Z
---

## Summary
确认 WebUI 沿用 xterm.js/PTY，黑白输出由宿主 NO_COLOR=1 被继承导致。已限定子终端移除禁色环境并声明实际 xterm/truecolor 能力，真实 PTY 与全量测试通过；当前实例尚未重启，保留用户进行中的 Codex 会话。

## Files
- src/main/terminal.ts
- tests/terminal.test.ts

## Work
- 承接 Q8R5N2/P7T2M6；CodeGraph 定位 TerminalPane/TerminalManager，对照原 Electron 版本确认渲染仍使用 xterm.js、真实 PTY 及彩色主题。
- 已检索只读团队上下文；宿主启动环境实际含 NO_COLOR=1，resolveLaunchSpec 原样继承。计划：真实 PTY 复现颜色探测失败 → 限定子终端环境修复 → 回归并提供运行版本。

- PTY 子进程环境删除 NO_COLOR，固定 TERM=xterm-256color 与 COLORTERM=truecolor；不强制改变 CLI 在管道中的行为。
- CUA 观察到用户正在另一个项目使用 Codex，因此本轮只构建修复，不重启当前运行实例，也不向其任务发送输入。修复在下一次服务重启后对新建终端生效。

## Verification
- 新回归在 NO_COLOR=1/TERM=dumb 宿主环境启动真实 PTY 内 Node CLI：修复前输出 color-disabled，修复后检测到颜色并产生红色 ANSI 序列。
- npm run typecheck、npm test（53 文件/298 项）、npm run build、git diff --check 全部退出 0。
- 当前浏览器仍为旧运行进程，未宣称已在线恢复颜色；未创建提交。

## Notes
- 不改用户 shell 配置或系统环境；不读取终端私密历史。
