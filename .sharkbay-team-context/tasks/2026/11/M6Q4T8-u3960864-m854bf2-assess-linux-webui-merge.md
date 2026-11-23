---
kind: sharkbay_task
taskId: M6Q4T8-u3960864-m854bf2
mode: task
taskTag: M6Q4T8
title: 评估 linux-webui 合并回 main 的准备度
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: linux-webui
createdAt: 2026-11-23T11:09:25Z
updatedAt: 2026-11-23T11:24:50Z
completedAt: 2026-11-23T11:11:13Z
---

## Summary
`linux-webui@78ce780` 对远端 `main@cd9926f` 可快进合并。建议先修复自动维护 Harness 失败时阻止 Agent 启动的回归。

## Files
- .sharkbay/tasks/M6Q4T8-u3960864-m854bf2-assess-linux-webui-merge.md

## Work
- 参考 J8M4P2-u3960864-m854bf2、F6K9R2-u3960864-m81ae10、H7M4A2-u3960864-m854bf2、D7N4K8-u3960864-m854bf2、P4M7T9-u3960864-m854bf2、K4M8Q2-u3960864-m854bf2。
- 先对照 GitHub 最新分支与本地提交，再核对会跟随合并进入 main 的改动和行为风险，最后对照跨平台验证。

- 待合并范围共 3 个提交，包含 WebUI 工作树和分支、Harness 自动维护、团队同步与 Hooks 自动注册。GitHub 上 `origin/linux-webui` 尚未包含本地 78ce780。
- 发现自动 Harness 的错误被 `ApplicationRuntime` 向上传播，普通项目可以打开终端但从 Agent 入口启动会提前失败。`main` 在没有可用 Harness 时跳过注入并继续启动。建议自动维护失败时保留项目文件、跳过协议注入并报告失败，依旧打开 Agent。

## Verification
- `git ls-remote` 确认远端 main 为 cd9926f，`git merge-base --is-ancestor` 与 `git diff --check origin/main...HEAD` 通过。
- macOS `npm run typecheck`、701 项测试与 21 项集成测试通过。Linux ARM64 的同一源码版本已部署并验证 P4M7T9。
- 隔离编译 Runtime 中，含同名 `.sharkbay` 普通文件的项目模拟 Harness 路径冲突。Agent 请求返回 `Could not prepare Task Protocol`，未启动 Agent PTY。普通终端可打开，原文件未变。
- 103 上的现有安装未更新，已登录 Kiro 实例和本次签名桌面安装包不在验证范围内。

## Notes
- 用户要求评估，未合并、推送或变更发布。
- C7M4K9-u3960864-m854bf2 已修复此阻塞项，提交为 `21ef04ae0482d1239f6bc96523ab52e574f1facb`。修复后 macOS、Linux 的集成测试均通过，相对 GitHub main 仍可快进。
- 后续已由 V6M4R9-u3960864-m854bf2 快进合并至 GitHub main，当前指向 21ef04a。
