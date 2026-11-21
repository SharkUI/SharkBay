---
kind: sharkbay_task
taskId: V5C7N2-u0-m854bf2
taskTag: V5C7N2
mode: quick
title: 左移项目树为工作树名称腾出空间
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T06:54:36Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T06:55:47Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

项目名和工作树名对齐左移 12 CSS px，工作树名称可用宽度增加 20 CSS px。测试 VM 的默认栏宽下能同时完整显示 `feature/newton` 和状态胶囊。

## Files

- src/styles/app.css
- 测试 VM 对应样式源码及 WebUI 静态入口和资源。

## Work

- 关联 F6W9K4-u0-m854bf2。保持项目名和工作树名对齐，将图标、引导线和行起点左移。
- 收紧名称与状态胶囊之间的留白，以相同栏宽验证 `feature/newton` 与状态胶囊的显示。

- 在测试 VM 构建并更新静态资源，保留旧样式和入口以便回滚。

## Verification

- `git diff --check`、`npm run verify:webui` 和 Linux Vite 构建通过。新 CSS 通过 HTTP 获取，Runtime PID 仍为 5059。
- Safari 实测原栏宽、默认状态下 `SharkBay`、`main` 与 `feature/newton` 对齐，完整分支名和 `Unknown` 同时显示。

## Notes

- 更新测试 VM 的 WebUI 静态资源。
