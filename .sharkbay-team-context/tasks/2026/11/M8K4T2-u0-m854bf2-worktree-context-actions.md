---
kind: sharkbay_task
taskId: M8K4T2-u0-m854bf2
taskTag: M8K4T2
mode: task
title: 整理左栏工作树操作菜单
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T06:13:19Z
updatedAt: 2026-11-21T06:20:52Z
completedAt: 2026-11-21T06:20:52Z
---

## Summary

仓库行菜单集中放置新建和刷新。工作树与分支的删除收进行菜单，选中工作树的菜单仍在原位并标明删除受限。

## Files

- src/renderer/App.tsx
- src/renderer/project-worktrees.tsx
- src/styles/app.css

- VM 上对应的三处源码、dist/renderer 静态入口和新增哈希资源。

## Work

- 参考 S4W8B2-u0-m854bf2、F7W2P4-u0-m854bf2、H7P4K9-u3960864-m81ae10 和 M7W2K9-u3960864-m81ae10。截图指出直接删除符号和列表底部工具布局跳变，统一使用现有行上下文菜单。
- 验收鼠标、键盘和窄屏，以及从对象菜单打开正确的动作。

- 仓库菜单入口固定展示。工作树与分支的菜单入口占位固定，精确指针在悬停和聚焦时显示，触屏常显。
- 复用项目弹出菜单和现有删除确认。打开菜单时聚焦首项，Escape 后焦点回到该行。
- 通过 Linux 隔离构建切换前端入口并保留旧资源，未重启服务。

## Verification

- npm run typecheck、npm run verify:webui、Linux Vite 构建和 git diff --check 通过。宿主新静态资源 HTTP 200，VM Runtime PID 5059 未变。
- Safari 真实 VM 页面验证仓库菜单、键盘打开新建弹窗、对应工作树删除入口、当前工作树的禁用提示、Escape 焦点返回和窄屏菜单刷新。保留用户的 feature/newton。未产生提交。

## Notes

- 只更新测试 VM 前端，不需要重启 Runtime。
