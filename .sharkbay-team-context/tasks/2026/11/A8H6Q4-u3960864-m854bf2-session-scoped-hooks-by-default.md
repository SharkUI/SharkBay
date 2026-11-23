---
kind: sharkbay_task
taskId: A8H6Q4-u3960864-m854bf2
taskTag: A8H6Q4
mode: task
title: SharkBay 启动时默认配置会话级 Hooks
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: linux-webui
createdAt: 2026-11-23T04:18:05Z
updatedAt: 2026-11-23T04:27:35Z
completedAt: 2026-11-23T04:27:35Z
---

## Summary
SharkBay 启动 Codex CLI 或 Claude Code 时默认配置会话级状态 Hooks。主机设置可按 Agent 关闭，其他 Agent 保留手动入口，Codex 沿用原生信任流程。

## Files
- .sharkbay/tasks/A8H6Q4-u3960864-m854bf2-session-scoped-hooks-by-default.md
- docs/product.md
- src/main/config.ts
- src/main/hooks/bridge.ts
- src/main/hooks/connectors/claude-family.ts
- src/main/project-setup.ts
- src/main/terminal.ts
- src/renderer/App.tsx
- src/renderer/project-start.tsx
- src/renderer/types.ts
- src/runtime/application-runtime.ts
- src/shared/session-hooks.ts
- src/shared/types.ts
- tests/hooks-connectors.test.ts
- tests/web-runtime-integration.test.ts

## Work
- 参考 C9H4QX-u3960864-m81ae10、Q8R5N2-u3960864-m464da1 和 H7M4A2-u3960864-m854bf2。现有手动批量启用会写各 CLI 的用户级配置。
- 先接入有可核验的会话配置的 Codex CLI 与 Claude Code，保留其他 Agent 的手动入口。Codex 保持自己的 Hooks 审核和信任规则。
- 启动路径只给 Codex 和 Claude 添加该会话的配置。已有面向当前 Runtime 的全局 Hook 时复用，显式配置优先。关闭选择由主机配置保存，兼容既有全局 helper 的外部 CLI 调用。

## Verification
- `npm test` 通过 700 项。`npm run test:integration` 单独运行通过 19 项，覆盖两种启动入口、默认 Hooks 参数和持久化关闭。并行运行时曾出现集成测试超时。
- `npm run typecheck`、`npm run verify:webui` 及 `git diff --check` 通过。
- 使用本机 Codex 0.171.0 的只读 `hooks/list` 验证生成的 8 个 Hook 都来自 `sessionFlags`，状态为 `untrusted`。
- 在隔离 WebUI 中验证两个开关默认开启。关闭 Codex 后设置落盘，重启 Agent 的启动参数不含 SharkBay 的会话 Hooks。

## Notes
- 本轮在当前 worktree 实现和验证，未创建提交或部署至 VM。
