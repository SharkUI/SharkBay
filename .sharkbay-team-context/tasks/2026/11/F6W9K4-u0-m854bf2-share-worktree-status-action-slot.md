---
kind: sharkbay_task
taskId: F6W9K4-u0-m854bf2
taskTag: F6W9K4
mode: quick
title: 工作树状态与菜单共用位置
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T06:35:19Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T06:47:57Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

工作树状态和菜单在右侧交替显示，各自按所需宽度占位。项目名和工作树分支名左对齐。已部署到测试 VM。

## Files

- src/renderer/project-worktrees.tsx
- src/styles/app.css
- 测试 VM 的两处对应源码及 WebUI 静态入口和资源。

## Work

- 关联 U4P8M2-u0-m854bf2、M8K4T2-u0-m854bf2 与 F7W2P4-u0-m854bf2。按截图核对状态和菜单占宽。
- 无操作时显示状态，悬停、聚焦或打开菜单时切换为省略号。验证双方交替和菜单可用。
- 加入用户补充要求，将项目和工作树标题的文字起点对齐。保留树形分组。
- 状态和省略号放在同一个按钮的同一个网格单元。稳定占宽，并保留可访问的状态描述。

- 在测试 VM 构建并替换前端静态资源，保留上个版本的入口供回滚。
- 后续反馈指出菜单态仍占胶囊的宽度。修正 src/styles/app.css，让隐藏内容退出布局，菜单态恢复图标按钮宽度。
- 重新部署静态资源，保留修正前的样式和入口。

## Verification

- 类型检查、`git diff --check`、`verify:webui` 和 Linux Vite 构建通过。前端入口和新资源返回 HTTP 200，Runtime PID 仍为 5059。
- Safari 实测项目名与工作树分支名左对齐，默认只显示 Unknown，点击同一位置可展开工作树菜单。
- 未产生提交。
- 宽度修正后 `git diff --check`、`verify:webui` 和 Linux Vite 构建通过。测试 VM 已提供新资源，Runtime PID 仍为 5059。Safari 验证悬停时 `feature/newton` 完整显示，右侧窄按钮可打开原菜单。

## Notes

- 更新当前测试 VM 前端资源。
