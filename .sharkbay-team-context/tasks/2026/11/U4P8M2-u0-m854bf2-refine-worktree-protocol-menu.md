---
kind: sharkbay_task
taskId: U4P8M2-u0-m854bf2
taskTag: U4P8M2
mode: quick
title: 修正工作树协议菜单和侧栏按钮间距
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T06:23:39Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T06:28:25Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

已将 WebUI Git 项目的 Uninstall Protocol 移到工作树菜单，删掉菜单副标题，并给侧栏顶部按钮增加 6px 间距。

## Files

- src/renderer/App.tsx
- src/renderer/project-worktrees.tsx
- src/styles/app.css

- VM 的上述三处源码和 WebUI 静态构建。

## Work

- 参考 M8K4T2-u0-m854bf2、S4W8B2-u0-m854bf2 与用户截图。按工作树目录核对协议状态并打开现有确认流程。
- 每次打开工作树菜单时读取该目录的协议状态，给主工作树同样的入口。工作树卸载确认仅作用于本地目录。
- 移除禁用项的可见副标题，保留提示属性。仅替换 VM 前端，保留原构建入口。

## Verification

- 类型检查、git diff --check、编译 WebUI 冒烟、Linux Vite 构建通过。新资源 HTTP 200，Runtime PID 5059 未改变。
- Safari 验证仓库菜单无卸载、main 与 feature/newton 的卸载项位于各自菜单。只打开确认，未实际卸载。验证当前目录的删除菜单无副标题，窄屏截图中添加和设置有可见间距。未产生提交。

## Notes

- 更新当前测试 VM 前端资源。
