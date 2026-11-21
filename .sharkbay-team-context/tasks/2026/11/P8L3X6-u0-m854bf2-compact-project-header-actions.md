---
kind: sharkbay_task
taskId: P8L3X6-u0-m854bf2
taskTag: P8L3X6
mode: quick
title: 收紧左栏添加和设置按钮
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T07:11:20Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T07:24:48Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

收紧左栏添加项目和设置按钮的间距，悬停时与工作树行使用同一无边框底色。项目名称行悬停时底色不变。

## Files

- src/styles/app.css
- 测试 VM 对应样式源码及 WebUI 静态入口和资源。

## Work

- 关联 U4P8M2-u0-m854bf2。将 WebUI 左栏顶部间距从 6 px 收到 2 px，保持点击区域。
- 夜间主题默认使用透明背景和边框，沿用悬停与键盘焦点样式。
- 按追加要求移除项目树行的悬停边框和工作树行的选中边框，沿用背景色、对齐与键盘焦点。

- 部署到测试 VM，保留上一版的样式源码和静态入口。

- 按最新反馈，取消项目名称行的悬停底色，添加和设置按钮悬停时共用工作树行底色并移除边框。
- 重新部署测试 VM，保留更新前的静态入口和样式。

## Verification

- `git diff --check`、`npm run verify:webui` 和 Linux Vite 构建通过。新 CSS 可访问，Runtime PID 仍为 5059。
- Safari 的 Night 主题实测加号和设置按钮默认只显示图标，悬停加号显示外框。两按钮均打开原入口。项目行悬停和工作树选中仅改变背景色。

- 调整后 `git diff --check`、`npm run verify:webui` 和 Linux Vite 构建通过，新 CSS 可访问，Runtime PID 仍为 5059。Safari 夜间主题确认项目名称在指针下保持原底色，加号悬停时只显示底色。设置按钮与加号共用同一条悬停规则。

## Notes

- 更新测试 VM 的 WebUI 静态资源。
