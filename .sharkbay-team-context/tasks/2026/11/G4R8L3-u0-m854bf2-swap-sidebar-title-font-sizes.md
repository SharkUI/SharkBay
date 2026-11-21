---
kind: sharkbay_task
taskId: G4R8L3-u0-m854bf2
taskTag: G4R8L3
mode: quick
title: 对调左栏项目名与工作树名字号
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T07:06:30Z
updatedAt: 2026-11-21T07:07:45Z
completedAt: 2026-11-21T07:07:45Z
---

## Summary

WebUI 左栏项目名使用 14 px，工作树名使用 12 px。已部署到测试 VM。

## Files

- src/styles/app.css
- 测试 VM 对应样式源码及 WebUI 静态入口和资源。

## Work

- 关联 V5C7N2-u0-m854bf2。项目名由 12 px 改为 14 px，工作树名由 14 px 改为 12 px，沿用原有对齐和字重。

- 更新测试 VM 静态资源并保留旧入口和样式。

## Verification

- `git diff --check`、`npm run verify:webui` 和 Linux Vite 构建通过。部署后 HTTP 返回新资源，Runtime PID 仍为 5059。
- Safari 实测项目名比工作树名大，名称继续左对齐，`feature/newton` 和状态胶囊同时完整显示。

## Notes

- 更新测试 VM 的 WebUI 静态资源。
