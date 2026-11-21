---
kind: sharkbay_task
taskId: J7N4R2-u0-m854bf2
taskTag: J7N4R2
mode: quick
title: 修正 Git 仓库卡片夜间文字对比度
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T07:30:26Z
updatedAt: 2026-11-21T07:32:18Z
completedAt: 2026-11-21T07:32:18Z
---

## Summary

Git 仓库卡片的标签、字段值与 Dirty 状态采用现有的夜间主题文字配色。已部署到测试 VM。

## Files

- src/styles/app.css
- 测试 VM 的对应样式及 WebUI 静态入口与资源。

## Work

- 仓库卡片背景已有夜间主题覆盖，字段标签、值和 Dirty 状态仍使用浅色主题的深色文字。
- 将三类文字纳入现有夜间主题的次要、正文与警示色规则，并按卡片背景核对对比度。

- 部署更新后的前端资源，保留前一版样式及静态入口。

## Verification

- 基于夜间卡片的合成背景计算标签、字段值和 Dirty 提示的对比度，分别为 7.14:1、12.48:1、7.65:1。
- `git diff --check`、`npm run verify:webui` 和 Linux Vite 构建通过。新样式可访问，Runtime PID 仍为 5059。
- Safari 实测 `feature/newton` 与 `main` 的 Repository 卡片。路径、URI、仓库地址、分支和 Clean 状态清晰可读，Dirty 使用浅琥珀色。

## Notes

- 更新测试 VM 静态资源，浏览器核对 Repository 卡片。
