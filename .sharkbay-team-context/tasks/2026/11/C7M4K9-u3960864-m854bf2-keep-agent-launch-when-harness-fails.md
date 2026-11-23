---
kind: sharkbay_task
taskId: C7M4K9-u3960864-m854bf2
mode: task
taskTag: C7M4K9
title: Harness 自动维护失败时继续启动 Agent
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: linux-webui
createdAt: 2026-11-23T11:17:07Z
updatedAt: 2026-11-23T11:19:30Z
completedAt: 2026-11-23T11:19:30Z
commits:
  - 21ef04ae0482d1239f6bc96523ab52e574f1facb
---

## Summary
已修复合并评估中发现的 Agent 启动回归。Harness 自动维护失败时继续启动，跳过协议注入，并向发起端提示原因。

## Files
- .sharkbay/tasks/C7M4K9-u3960864-m854bf2-keep-agent-launch-when-harness-fails.md
- src/main/harness.ts
- src/main/terminal.ts
- src/runtime/application-runtime.ts
- src/shared/types.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- tests/web-runtime-integration.test.ts

## Work
- 参考 M6Q4T8-u3960864-m854bf2、H7M4A2-u3960864-m854bf2、F6K9R2-u3960864-m81ae10。
- 先用隔离项目补 WebUI 与桌面控制接口回归，确认能够启动且不注入损坏协议。复用终端创建结果和界面提示，保持手动安装错误可见。

- 自动维护失败时返回启动提示并跳过协议引导。提示只随终端创建结果返回，界面复用现有提示组件。显式安装仍报告原错误。
- 验证通过后单独提交至 linux-webui，方便随分支合并。

## Verification
- 新增端到端用例在修复前复现启动失败。修复后两条客户端路径均成功启动，分别覆盖同名 `.sharkbay` 文件和现有 Harness 的辅助文件冲突。未注入协议，原文件保留。
- Linux ARM64 隔离构建的 22 项集成测试通过。macOS `npm run verify:webui` 通过。

- macOS 类型检查、701 项测试及 22 项集成测试通过。提交后整分支 `git diff --check` 通过，四个提交相对 GitHub main 可快进。

## Notes
- 已在当前分支提交。未合并、推送或更新部署。
