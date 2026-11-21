---
kind: sharkbay_task
taskId: B6K2Q7-u0-m854bf2
taskTag: B6K2Q7
mode: quick
title: 去掉右栏有底色元素的描边
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T07:49:04Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T07:51:00Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

WebUI 右栏的卡片、列表项和有底色的控件去掉描边，使用底色区分。已部署到测试 VM。

## Files

- src/styles/app.css
- 测试 VM 对应样式及 WebUI 静态入口与资源。

## Work

- 关联 J7N4R2-u0-m854bf2 与 P8L3X6-u0-m854bf2。检查 Git、Files、Tasks 和 Sessions 使用的卡片、列表项和状态标签。
- 用右栏范围内的规则去掉有底色元素的描边与卡片投影，任务和会话列表通过底色显示悬停，保留键盘焦点与标签页下划线。

- 更新测试 VM 静态资源并备份旧入口和样式。

## Verification

- `git diff --check`、`npm run verify:webui` 和 Linux Vite 构建通过。新资源 HTTP 可访问，Runtime PID 仍为 5059。
- Safari 夜间主题确认 Repository 和 Dirty Files 卡片只使用底色，仓库文字清晰。Git、Sessions、Tasks 和 Files 标签切换正常。

## Notes

- 更新测试 VM 的静态资源。
