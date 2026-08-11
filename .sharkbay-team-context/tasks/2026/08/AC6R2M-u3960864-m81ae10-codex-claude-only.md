---
kind: sharkbay_task
taskId: AC6R2M-u3960864-m81ae10
taskTag: AC6R2M
mode: task
title: Limit supported Agent CLIs to Codex and Claude
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.6
sessionId: 019fef64-5118-71c0-9222-d725d62df0e6
branch: codex/codex-claude-only
createdAt: 2026-08-11T09:26:29Z
updatedAt: 2026-08-11T09:41:25Z
completedAt: 2026-08-11T09:41:25Z
---

## Summary

SharkBay 的正式 Agent CLI 支持面已收缩到 Codex CLI 与 Claude Code，为后续 Agent Profile 建立了两套明确的 Runtime 边界；旧 Agent 仅保留历史呈现与 hook 兼容清理。

## Files

- `README.md`
- `electron/ipc.ts`
- `src/main/agent-clis.ts`
- `src/main/harness.ts`
- `src/main/hooks/terminal-approval-detector.ts`（删除）
- `src/main/terminal.ts`
- `src/main/telegram/service.ts`
- `src/main/telegram/transcript.ts`
- `src/plugins/bundled/agent-detector.ts`
- `src/renderer/App.tsx`
- `src/shared/agent-session-restore.ts`
- `tests/agent-detector.test.ts`
- `tests/agent-session-restore.test.ts`
- `tests/harness.test.ts`
- `tests/install-tool.test.ts`
- `tests/telegram-service.test.ts`
- `tests/telegram-transcript.test.ts`
- `tests/terminal-bootstrap.test.ts`（删除）
- `tests/terminal-approval-detector.test.ts`（删除）

## Work

- 新启动、Settings、Review 选择和支持声明只暴露 Codex CLI 与 Claude Code。
- 保留旧 Agent 历史数据显示以及已安装 hook 的兼容清理路径，避免破坏既有数据或遗留配置。
- 相关团队任务：`MYQTYZ-u3960864-m81ae10`、`W5K9L2-u3960864-m81ae10`、`D76AF7-u3960864-m81ae10`。
- CodeGraph 影响分析确认正式支持面分布在 CLI 探测、Harness 启动注入、Settings/启动选项与会话恢复；旧图标和 hook connector 不纳入删除范围。
- 聚焦测试暴露历史身份 `Kiro Claude 4.6` 会被误判成 Claude；恢复识别改为优先拒绝旧 Runtime 前缀，同时允许真正的 Claude Runtime 携带第三方模型名。
- 进一步移除 TerminalManager 中仅服务于 CodeWhale/OpenCode 的延迟 prompt 提交路径及对应测试。
- 移除仅服务于 Kiro 的终端审批检测和 Telegram transcript 解析；旧 hook connector 注册仍保留以支持关闭或清理既有配置。
- 全量测试定位到旧安装器断言；安装 recipe 回归测试同步收缩，并验证旧 Kiro recipe 不再存在。

## Verification

- `codegraph affected --stdin --json`：完成；当前索引未返回额外受影响测试，因此继续执行聚焦与全量回归。
- `npm test -- --run tests/agent-detector.test.ts tests/agent-session-restore.test.ts tests/harness.test.ts tests/agent-clis.test.ts tests/telegram-service.test.ts tests/telegram-transcript.test.ts tests/terminal.test.ts`：67/67 通过。
- `npm test -- --run tests/install-tool.test.ts`：6/6 通过。
- `npm run typecheck`：通过。
- `npm test`：58 个文件、316/316 测试通过。
- `npm run build`：通过。
- `git diff --check`：通过。

## Notes

- 完成本任务并提交后，再从其结果创建独立 Agent Profile 功能分支。

## Commits

- `9376319d9748078c5a37b8173063d35986267f76` — Limit agent runtimes to Codex and Claude
