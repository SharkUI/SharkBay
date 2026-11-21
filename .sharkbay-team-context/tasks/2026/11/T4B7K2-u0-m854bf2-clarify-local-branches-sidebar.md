---
kind: sharkbay_task
taskId: T4B7K2-u0-m854bf2
taskTag: T4B7K2
mode: quick
title: 明确左栏其他本地分支入口
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T08:08:18Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T10:33:07Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

仓库下方的 Other local branches 默认折叠，展开后可通过英文菜单将已有分支打开为工作树。创建后自动选中新工作树并更新分组。折叠入口使用斜体标题和正体计数，已部署到测试 VM。

## Files

- src/renderer/App.tsx
- src/renderer/project-worktrees.tsx
- src/styles/app.css
- 测试 VM 对应源码及 WebUI 静态入口与资源。

- 测试 VM 的本地 Git 引用 `test/other-local-branches`。

## Work

- 关联 M8K4T2-u0-m854bf2 和 V5C7N2-u0-m854bf2。保留已有本地分支过滤和工作树创建逻辑，明确仓库下的折叠层级。
- 分支行使用同一菜单提供 Open in New Worktree 与 Delete Local Branch，选择打开后更新工作树列表。

- 更新测试 VM 的前端入口并保留前一版；复用已有菜单键盘焦点和 Git 操作。

- 启动测试 VM 并保留一个从 main 创建的未检出本地分支，提供给用户手动测试。

- 按截图调整折叠入口中箭头和计数的间距，保留标签与工作树名称的文字对齐。

- 按最新截图去掉分支折叠入口的箭头，标题用斜体、计数用正体，保留文字对齐和原生折叠操作。

## Verification

- `git diff --check`、`npm run typecheck`、工作树定向集成测试和 Linux Vite 构建通过。新资源可访问，Runtime PID 仍为 5059。
- Safari 实测分组默认折叠且与工作树同级，分支行只打开含两个英文动作的菜单。Escape 回到分支行，Enter 可打开并选中新工作树，已打开的分支从折叠组移出。
- Runtime API 实测移除临时工作树后分支仍可见，随后删除临时分支，原有工作树予以保留。

- VM 重启后服务为 active，并继续提供原部署。Safari 确认 Other local branches 显示计数 1，展开后可见 `test/other-local-branches`，保留未检出状态供用户测试。

- 间距调整通过 `git diff --check` 和 Linux Vite 构建。Safari 确认箭头与标题多出 4 CSS px，计数左侧增加 6 CSS px，标题仍与工作树名称对齐。

- 移除箭头后的 Linux Vite 构建和 `git diff --check` 通过，测试页 JS 和 CSS 完整返回。Safari 实测标题斜体、计数正体、无箭头，点击可展开和收起。

## Notes

- 使用临时测试分支验证折叠、打开、移除和删除，保留现有工作树。
