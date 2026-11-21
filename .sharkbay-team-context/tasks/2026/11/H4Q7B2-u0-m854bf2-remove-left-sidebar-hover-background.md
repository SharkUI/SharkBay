---
kind: sharkbay_task
taskId: H4Q7B2-u0-m854bf2
taskTag: H4Q7B2
mode: quick
title: 去掉 WebUI 左栏悬停底色
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T10:27:12Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T10:29:23Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

WebUI 左栏项目、工作树、分支及操作按钮在鼠标悬停时保持原有底色。已部署到测试 VM。

## Files

- src/styles/app.css
- 测试 VM 对应样式及 WebUI 静态入口和资源。

## Work

- 关联 P8L3X6-u0-m854bf2、T4B7K2-u0-m854bf2。覆盖项目行、工作树、分支组、行内按钮及左栏操作菜单。
- 保留选中和键盘焦点反馈，悬停仍可显示工作树菜单入口。
- 构建部署后验证真实 Chrome 的选中行、未选中行和顶部按钮的悬停状态，并核对资源非空。

- 核对 Chrome 时它正在进行其他操作，改在 Safari 独立标签验证并恢复原项目。部署时检查产物非空并同步磁盘。

## Verification

- `git diff --check`、`npm run verify:webui` 和 Linux Vite 构建通过。校验宿主测试页的 JavaScript 和 CSS 均完整返回。
- Safari 夜间模式确认左栏加号与未选工作树在悬停时无底色，选中的 main 仍有底色，分支组和添加项目入口可正常打开。
