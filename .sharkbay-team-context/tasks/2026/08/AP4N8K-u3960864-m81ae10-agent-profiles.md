---
kind: sharkbay_task
taskId: AP4N8K-u3960864-m81ae10
taskTag: AP4N8K
mode: task
title: Add global Agent Profiles
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.6
branch: codex/agent-profiles
createdAt: 2026-08-11T09:41:50Z
updatedAt: 2026-08-11T10:15:15Z
completedAt: 2026-08-11T10:15:15Z
commits:
  - 0d6a4787e22ef56dfedea4610bddb0df311801cb
  - 427f1361e5dfc3b801190837a8892dbd1394766c
  - 229e7285b3609c1efb1cbc0bbdb3f77dbfa1d6f5
---

## Summary

已在 Codex CLI 与 Claude Code 两套 Runtime 之上实现 SharkBay 全局 Agent Profile。Profile 可组合 Runtime、Inference Provider 与 Model，分别绑定主 Agent/Review Agent，并覆盖安全启动、异步 Review、恢复和用量归因。

## Files

- `src/shared/types.ts`
- `src/renderer/types.ts`
- `src/main/config.ts`
- `src/main/agent-profiles.ts`
- `src/shared/ipc-channels.ts`
- `electron/preload.mts`
- `electron/ipc.ts`
- `src/main/terminal.ts`
- `src/main/review-runs.ts`
- `src/main/review-control-server.ts`
- `src/main/harness.ts`
- `src/main/token-usage-db.ts`
- `src/main/telegram/types.ts`
- `src/renderer/App.tsx`
- `src/styles/app.css`
- `tests/agent-profiles.test.ts`
- `tests/terminal.test.ts`
- `tests/config-migration.test.ts`
- `tests/review-runs.test.ts`
- `tests/review-control-server.test.ts`
- `tests/harness.test.ts`
- `tests/ipc-channels.test.ts`

## Work

- 假设 Profile 属于整个 SharkBay 应用，而非单个项目；项目启动和 Review 都引用同一套全局 Profile。
- Profile 的 Runtime 只允许 `codex` 或 `claude`；Provider 与 Model 是独立配置维度，启动时按 Runtime 生成进程级配置，不修改用户的全局 CLI 配置。
- 主 Agent 与 Review Agent 分别绑定 Profile；Review 默认可选择另一 Profile，并保持现有未配置用户的启动行为兼容。
- Provider 暂不拆成独立资源库，而是作为 Profile 的字段；这是满足当前组合场景的最小模型，后续若出现大量共享 Provider 再单独抽取。
- `existing` 凭据模式沿用 CLI 当前登录状态；自定义端点可选择 API Key / Auth Token，密钥仅存 macOS Keychain。Codex 自定义端点要求兼容 Responses API，Claude 自定义端点要求兼容 Anthropic API。
- 首个实现优先覆盖本地桌面端配置、启动、Review 继承/选择、会话恢复和用量归因；不在本任务引入云同步或远端执行。
- `.sharkbay/harness/agent-session-id.sh "Codex GPT-5.6"` 未能解析当前父进程 transcript，因此按协议省略 `sessionId`。
- CodeGraph 已定位配置、Terminal、Review 与 Settings 的主要入口；第一步先实现 Profile 配置、Keychain 与启动解析的可测试核心。
- 已完成第一步提交 `0d6a4787e22ef56dfedea4610bddb0df311801cb`：Profile 配置、Keychain 边界与 Runtime 启动解析。
- 第二步已接入 Profile CRUD IPC 与 Terminal：renderer 只传 Profile ID，Terminal 在核心进程解析凭据，并仅把非敏感 Profile 元数据返回给 session。
- 已完成第二步提交 `427f1361e5dfc3b801190837a8892dbd1394766c`：Profile IPC、Terminal 内部解析、进程环境注入与 session 元数据。
- 第三步已接入 Settings 管理页、主 Agent/Review Agent 绑定、Profile 快捷启动、异步 Review 默认/显式 Profile、会话恢复和 Telegram 恢复归因。
- 用量数据库新增 agent session → Profile 归因表和 Profile 过滤/分组；归因在 hook session 与 Terminal 匹配后写入，历史 token event 无需包含密钥或重复 Profile 元数据。

## Verification

- 计划运行 CodeGraph 影响分析、聚焦测试、typecheck、全量测试与生产构建。
- `npm run typecheck`：通过。
- Profile/Terminal/Review/Harness/Usage Collector 聚焦测试：59/59 通过。
- 直接实例化 SQLite 的临时测试因本机 Node 24 ABI 137 与 Electron rebuild 的 `better-sqlite3` ABI 121 不匹配而无法运行；未重编依赖，保留原有纯函数测试并由后续 Electron 构建验证集成边界。
- `npm test -- --run`：59 个测试文件、323 个测试全部通过。
- `npm run build`：TypeScript 主进程构建与 Vite renderer 生产构建通过。
- CodeGraph `sync` 完成；`affected` 未返回额外聚焦测试，因此执行了全量测试。
- 按 React best-practices 检查新增 UI：组件保持顶层定义，effect 均有取消/清理路径，列表使用稳定 Profile ID，表单控件均有可访问标签，未把凭据回传到 view/session。

## Notes

- 前置提交：`9376319d9748078c5a37b8173063d35986267f76`。
