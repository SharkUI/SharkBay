---
kind: sharkbay_task
taskId: C7P9W4-u0-m854bf2
taskTag: C7P9W4
mode: task
title: 提交并推送 Linux WebUI 改动
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T10:45:28Z
updatedAt: 2026-11-21T10:46:52Z
completedAt: 2026-11-21T10:46:52Z
commits:
  - f73e3b2982885427cd29c649c4f9759bb9ebe95a
---

## Summary

将工作树与本地分支管理、侧栏布局及克隆错误提示合并为 `f73e3b2`，已推送到 GitHub 的 linux-webui 分支。

## Files

- docs/current-facts.md
- src/main/scanner.ts
- src/main/worktree.ts
- src/renderer/App.tsx
- src/renderer/bridge/web-bridge.ts
- src/renderer/host-folder-picker.tsx
- src/renderer/project-worktrees.tsx
- src/renderer/types.ts
- src/runtime/application-input.ts
- src/runtime/application-runtime.ts
- src/shared/application-api.ts
- src/shared/types.ts
- src/styles/app.css
- tests/host-folder-picker.test.tsx
- tests/web-runtime-integration.test.ts

## Work

- 核对当前差异，提交已在本轮测试的工作树和分支管理、侧栏样式、克隆错误提示。关联 S4W8B2-u0-m854bf2、T4B7K2-u0-m854bf2、K3V8M5-u0-m854bf2、H4Q7B2-u0-m854bf2 和 N6H4R8-u0-m854bf2。
- 核验候选快照，推送到 origin/linux-webui 并读取远端引用确认提交。

- 提交前比对了候选文件与测试 VM。应用源码相同，宿主克隆回归测试也纳入提交。

- 在 linux-webui 创建提交 `f73e3b2`。

## Verification

- `git diff --check`、类型检查和 690 项单元测试通过。
- macOS 首次并行运行时附件 PTY 用例超出默认 5 秒。单独以 20 秒上限重跑，16 项集成测试通过，整套耗时 4.42 秒。

- 远端 refs/heads/linux-webui 与本地 HEAD 哈希相同，跟踪分支已配置，工作树干净。

## Notes
