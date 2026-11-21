---
kind: sharkbay_task
taskId: S4W8B2-u0-m854bf2
taskTag: S4W8B2
mode: task
title: 回滚项目大厅并在左栏组织工作树和分支
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T05:18:27Z
updatedAt: 2026-11-21T05:29:21Z
completedAt: 2026-11-21T05:29:21Z
---

## Summary

宿主和 VM 已撤回大厅方案并以 cd9926f 为基线重做左栏。现在启动直接进入三栏，展开当前项目后可访问工作树和本地分支。

## Files

- docs/current-facts.md
- src/main/scanner.ts
- src/main/worktree.ts
- src/renderer/App.tsx
- src/renderer/project-worktrees.tsx
- src/renderer/types.ts
- src/renderer/bridge/web-bridge.ts
- src/runtime/application-input.ts
- src/runtime/application-runtime.ts
- src/shared/application-api.ts
- src/shared/types.ts
- src/styles/app.css
- tests/web-runtime-integration.test.ts

- VM ~/SharkBay 的对应源码、dist-runtime/ 与 dist/。

## Work

- 当前 HEAD cd9926f。宿主与 VM 的未提交差异一致，均为 D8L4V2-u0-m854bf2 已部署的工作结果。用户明确要求回滚全部当前改动。
- 参考 P8L4W6-u0-m854bf2、D8L4V2-u0-m854bf2、W3K8F2-u3960864-m81ae10、M7W2K9-u3960864-m81ae10。先核验回滚，再验证工作树与分支在三栏左侧的显示和操作。

- 逐字节核对旧补丁后，宿主恢复为干净的 cd9926f，VM 反向应用相同补丁并恢复该版本原构建。
- 参考用户截图的项目、工作树、分支与活动层级。保留三栏，使用缩进、选中态和折叠展示，不引入大厅。
- 接入本地 Git 列表、打开工作树、创建及安全删除，分支打开到独立工作树。

- 将新版部署到 sharkbay-linux，切换前检查没有终端会话。保留配置和基线构建，回退材料在 VM ~/.sharkbay/deployments/S4W8B2/previous/。未产生提交。

## Verification

- macOS 类型检查、16 项 WebUI 集成测试、编译 WebUI 冒烟测试通过。

- 689 项单元测试通过。Linux ARM64 类型检查、16 项集成测试和 verify:webui 测试通过。
- Safari 的隔离真实仓库验证两个项目、三个工作树和未检出分支的展示，打开分支生成独立工作树，窄屏可从项目抽屉切换工作目录。
- Safari 刷新 http://127.0.0.1:17877/ 直接进入新版三栏并显示当前工作树。服务 active，静态资源 HTTP 200，VM 配置与切换前逐字节一致。

## Notes

- 既有任务记录保留为历史。
