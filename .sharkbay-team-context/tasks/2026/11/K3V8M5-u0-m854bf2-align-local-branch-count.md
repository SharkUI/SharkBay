---
kind: sharkbay_task
taskId: K3V8M5-u0-m854bf2
taskTag: K3V8M5
mode: quick
title: 对齐左栏其他本地分支计数和展开提示
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T10:37:24Z
updatedAt: 2026-11-21T10:39:57Z
completedAt: 2026-11-21T10:39:57Z
---

## Summary

Other local branches 的计数移至最右，与工作树操作按钮的省略号居中对齐。鼠标悬停和键盘聚焦时原位显示 `>`，已部署到测试 VM。

## Files

- src/renderer/project-worktrees.tsx
- src/styles/app.css

- 测试 VM 中对应的前端源码和 WebUI 静态入口及资源。

## Work

- 关联 T4B7K2-u0-m854bf2 和 H4Q7B2-u0-m854bf2。让分支组计数和工作树操作按钮共用右侧对齐位置，悬停时在原位显示展开提示。

- 计数和展开符号共用右侧位置。悬停或键盘聚焦时显示展开符号，继续使用原生展开操作。

## Verification

- `git diff --check` 和 `npm run typecheck` 通过。

- 测试 VM 的 Linux Vite 构建通过，静态资源非空，Runtime PID 仍为 856。
- Chrome 桌面和窄屏触摸视口确认计数与工作树菜单的中心对齐。验证悬停时切换符号、底色保持原样、鼠标移开后恢复计数，以及鼠标、触摸和键盘展开收起。

## Notes
