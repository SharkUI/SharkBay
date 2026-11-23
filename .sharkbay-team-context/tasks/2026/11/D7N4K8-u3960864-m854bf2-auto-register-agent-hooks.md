---
kind: sharkbay_task
taskId: D7N4K8-u3960864-m854bf2
taskTag: D7N4K8
mode: task
title: 自动注册所有 Agent 的状态 Hooks
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: linux-webui
createdAt: 2026-11-23T04:59:30Z
updatedAt: 2026-11-23T06:43:00Z
commits:
  - 78ce78002457234e82c31d66220bdee667c0b21c
completedAt: 2026-11-23T05:09:23Z
---

## Summary
SharkBay 在启动或恢复八个受支持 Agent 时自动注册状态 Hooks。优先使用会话配置，用户级配置只追加受管条目或独立文件，外部终端不会通过新注册的 Hook 上报。

## Files
- .sharkbay/tasks/D7N4K8-u3960864-m854bf2-auto-register-agent-hooks.md
- docs/product.md
- src/main/hooks/bridge.ts
- src/main/hooks/connectors/kiro.ts
- src/main/hooks/connectors/opencode.ts
- src/main/hooks/connectors/reasonix.ts
- src/main/hooks/session-launch.ts
- src/main/terminal.ts
- src/runtime/application-runtime.ts
- src/shared/session-hooks.ts
- src/renderer/App.tsx
- src/renderer/project-start.tsx
- tests/web-runtime-integration.test.ts
- tests/reasonix-hooks.test.ts

## Work
- 参考 B7Q4M9-u3960864-m854bf2、A8H6Q4-u3960864-m854bf2、A9S4R7-u3960864-m81ae10、R3W7K5-u3960864-m81ae10。
- 只读对照 Orca 的 `src/main/agent-hooks/installation/managed-agent-hook-startup.ts`、Kiro V2/V3 注册与 `src/main/opencode/status-hooks/hook-service.ts`。Kiro 只处理当前选择的 profile，OpenCode 有会话插件就优先复用。Orca 参考版本为 `dfdb4fda52d`。
- 所有受支持 Agent 默认开启，设置按主机保存关闭选择。Runtime 在启动与恢复前自动注册，对支持会话配置的 CLI 继续使用该配置。
- Reasonix 只合并受管 Hook 条目。Kiro V3 用独立文件，V2 只处理所选 profile 或创建 SharkBay 默认 profile。OpenCode 需要全局回退时只写独立插件文件。新注册的用户级 Hooks 校验 SharkBay 启动身份，无关终端事件不回传。
- 解析失败、同名文件冲突和显式 CLI 配置优先保留原配置，注册失败时照常启动 Agent。

## Verification
- `npm test` 通过 701 项，`npm run test:integration` 通过 21 项。覆盖自动注册、重复启动、恢复参数、配置保留和外部终端隔离。
- `npm run typecheck`、`npm run verify:webui` 和 `git diff --check` 通过。
- VM 内 Reasonix v2.61.0 已用隔离配置通过原生 `hook list` 读取自动注册项。OpenCode 1.19.0 实测自动发现用户插件并转发真实 SessionStart。
- Kiro V2/V3 由 Runtime 集成测试验证配置和启动参数。本机 Kiro CLI 2.14.1 可读版本并生成 profile，原生 `agent validate` 要求登录，未完成已登录会话验证。

## Notes
- 当前 worktree 实现，Orca 只读。未生成提交，未部署到 VM。
- 后续通过 P4M7T9-u3960864-m854bf2 一并提交已部署的源码，哈希见 `commits`。
