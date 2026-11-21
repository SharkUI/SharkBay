---
kind: sharkbay_task
taskId: F7W2P4-u0-m854bf2
taskTag: F7W2P4
mode: quick
title: 精简左栏工作树标签
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T06:06:09Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T06:09:27Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

左栏项目行显示仓库名，工作树默认仅显示分支名。测试 VM 已更新，Safari 确认 SharkBay 下仅显示 main。

## Files

- src/renderer/project-worktrees.tsx
- src/styles/app.css

- VM 的同两处源码及 dist/renderer 中的入口和静态资源。

## Work

- 参考 S4W8B2-u0-m854bf2 和用户截图。项目行呈现仓库名，工作树以分支为主，只在需要区分时显示目录。
- 使用截图与浏览器核对选中、焦点和点击行为。

- detached HEAD 和同名分支仍显示必要的目录或提交标识；完整路径可悬停查看。将键盘焦点样式与选中边框区分。
- 在客体隔离构建后发布前端资源，原入口备份在 ~/.sharkbay/deployments/F7W2P4/previous/。

## Verification

- 类型检查、git diff --check 和 Linux Vite 构建通过。新版入口和 JS 可访问，Runtime PID 5059 未改变。
- Safari 刷新后确认 SharkBay 主行和单行 main 工作树，点击仍可选择，截图无旧的重复标签及蓝色鼠标点击焦点。未产生提交。

## Notes

- 沿用当前 VM 测试链接。
