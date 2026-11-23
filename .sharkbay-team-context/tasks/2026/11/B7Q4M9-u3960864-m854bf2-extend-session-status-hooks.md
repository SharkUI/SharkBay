---
kind: sharkbay_task
taskId: B7Q4M9-u3960864-m854bf2
taskTag: B7Q4M9
mode: task
title: 扩展 Agent 会话级状态 Hooks 默认启用
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: linux-webui
createdAt: 2026-11-23T04:36:13Z
updatedAt: 2026-11-23T06:43:00Z
commits:
  - 78ce78002457234e82c31d66220bdee667c0b21c
completedAt: 2026-11-23T04:50:41Z
---

## Summary
Gemini CLI、Qwen Code 和 Cursor CLI 的 SharkBay 会话默认启用状态 Hooks，OpenCode 1.x 在已有匹配的本地依赖时自动接通。Kiro CLI 和 Reasonix 保留手动入口。

## Files
- .sharkbay/tasks/B7Q4M9-u3960864-m854bf2-extend-session-status-hooks.md
- docs/product.md
- src/main/hooks/bridge.ts
- src/main/hooks/connectors/claude-family.ts
- src/main/hooks/connectors/cursor.ts
- src/main/hooks/connectors/gemini.ts
- src/main/hooks/connectors/opencode.ts
- src/main/hooks/session-launch.ts
- src/main/terminal.ts
- src/renderer/App.tsx
- src/runtime/agent-runtime.ts
- src/runtime/application-runtime.ts
- src/shared/session-hooks.ts
- src/shared/types.ts
- tests/web-runtime-integration.test.ts

## Work
- 参考 A8H6Q4-u3960864-m854bf2、KWHNQ5-u3960864-m81ae10、R3W7K5-u3960864-m81ae10、P4K7V9-u3960864-m81ae10 和 R9X4K7-u3960864-m81ae10。
- 分别确认 CLI 能否只为 Runtime 启动的会话加 Hooks，并保留原有权限、信任、全局配置和恢复功能。
- Cursor CLI 使用启动插件，OpenCode 使用当次进程的插件配置，Gemini CLI 和 Qwen Code 使用低优先级默认设置层。保留 CLI 自身的 Hooks 开关、项目与用户设置和权限。
- Cursor 默认插件使用观察事件，未加入控制 Shell、文件读取或 MCP 的权限 Hook。Runtime 将启动环境变量限制在 Agent 命令上，保留手动安装的旧 OpenCode 插件的按会话关闭。
- Kiro 现行启动入口选择 Agent profile，Reasonix 当前从项目或用户配置读取 Hooks。两者继续使用手动入口。
- OpenCode 1.x 加载任一本地插件前会等待自己的 SDK 安装。Runtime 启动前确认匹配版本的本地依赖已就绪，缺失时正常启动 CLI。

## Verification
- `npm run test:integration` 通过 20 项，覆盖四种新增启动方式、恢复参数、显式配置、开关与后续 shell 命令的环境隔离。
- `npm test` 通过 700 项。`npm run typecheck`、`npm run verify:webui`、`git diff --check` 通过。
- 本机 Gemini CLI 0.50.0、Qwen Code 0.19.9 配置加载器已验证会话 Hooks 与原有 Hooks 合并，原生禁用设置得到保留。
- 本机 OpenCode 1.19.0 使用隔离配置验证冷启动跳过插件，准备好依赖后原生 `SessionStart` 发送至本地 Hook socket。
- 本机 Cursor CLI 2026.07.09 接受 `--plugin-dir`，其安装包确认插件扫描 `hooks/hooks.json`。未实测登录后的端到端事件。

## Notes
- 在当前 worktree 实现。未生成提交或部署到 VM。
- 后续通过 P4M7T9-u3960864-m854bf2 一并提交已部署的源码，哈希见 `commits`。
