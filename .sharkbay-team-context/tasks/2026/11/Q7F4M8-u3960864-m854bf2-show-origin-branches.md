---
kind: sharkbay_task
taskId: Q7F4M8-u3960864-m854bf2
taskTag: Q7F4M8
mode: task
title: 在侧栏显示本地与 origin 分支
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T11:00:20Z
updatedAt: 2026-11-21T11:28:56Z
completedAt: 2026-11-21T11:07:07Z
commits:
  - c51e4ea54e46aa2ebf1ff9ca73703cf2405df082
---

## Summary

侧栏 Other branches 合并当前未检出的本地和 origin 分支，隐藏两边的 sharkbay-team-context。Refresh Git 可更新单分支克隆的远端列表，打开远端分支会创建可跟踪上游的本地工作树。已部署测试 VM。

## Files

- docs/current-facts.md
- src/main/worktree.ts
- src/shared/types.ts
- src/shared/application-api.ts
- src/runtime/application-input.ts
- src/runtime/application-runtime.ts
- src/renderer/types.ts
- src/renderer/bridge/web-bridge.ts
- src/renderer/App.tsx
- src/renderer/project-worktrees.tsx
- src/styles/app.css
- tests/web-runtime-integration.test.ts

- 测试 VM 的对应源码、Runtime 和静态资源。

## Work

- 关联 T4B7K2-u0-m854bf2、K3V8M5-u0-m854bf2 和 H6V4P8-u0-m854bf2。合并本地与 origin 未检出分支，同名取本地，两边过滤 sharkbay-team-context。
- 初始读取本地引用，使用项目菜单 Refresh Git 更新 origin 的引用。打开仅远端存在的分支时才创建跟踪分支和独立工作树。
- 以临时 Git 仓库验证刷新、过滤、上游跟踪，并在浏览器验证同一折叠入口和工作树切换。

- 通过 Git 的跟踪分支创建选项打开 origin 分支，远端行只显示打开操作。测试 VM 无活动终端，先隔离构建，再以原测试配置切换。

- Chrome 的临时仓库验证通过。真实测试仓库的单分支 fetch 映射暴露边界，改用明确的 origin 引用范围，并在打开分支时补齐所需的跟踪映射。

- 仅在打开未由已有 fetch 映射覆盖的远端分支时增加该分支的映射，刷新列表保持原有映射配置。

## Verification

- `git diff --check`、`npm run typecheck` 及 17 项 WebUI 集成测试通过。验证两侧过滤、跳过 origin/HEAD、刷新新增分支及清除过期引用、创建分支时设置上游。

- 最终版本通过类型检查、690 项单元测试、17 项集成测试和测试 VM 的 Linux 构建及编译 Runtime 冒烟验证。
- Chrome 临时仓库确认同名只显示一次、已检出分支不重复、远端只提供打开操作，并验证打开后选中新工作树和上游配置。已从测试 VM 应用配置移除临时项目。
- Chrome 实测测试 VM 的 SharkBay 单分支克隆，Refresh Git 从 GitHub 获取两个可见的 origin 分支并滤除 team context。计数悬停显示展开提示。测试 VM 的应用配置与部署前一致。

## Notes

- 测试 VM 的回退快照位于 `~/.sharkbay/deployments/Q7F4M8/previous/`。
