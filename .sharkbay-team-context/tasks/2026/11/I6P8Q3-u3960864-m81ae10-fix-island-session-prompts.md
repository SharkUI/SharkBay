---
kind: sharkbay_task
taskId: I6P8Q3-u3960864-m81ae10
taskTag: I6P8Q3
mode: task
title: 修复 Island 同状态会话提示词串用
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e944-e36f-7f03-8201-84fff8c2977a
branch: main
createdAt: 2026-11-17T11:30:13Z
updatedAt: 2026-11-17T11:36:55Z
completedAt: 2026-11-17T11:36:55Z
---

## Summary
确认 Codex 共享 daemon 的 hook 继承首个终端身份，造成其他会话提示词及状态串写。修复入口归属，已确认 provider 绑定与唯一待确认本地输入优先；同为 Done 的会话文案独立，通过失败回归、全量测试及真实渲染检查。

## Files
- src/runtime/agent-runtime.ts
- tests/agent-status-attribution.test.ts
- docs/agent-status.md

## Work
- 已读取协议、AGENTS.md 和团队上下文；参考 O7S4K2-u3960864-m81ae10、A9S4R7-u3960864-m81ae10、EK9656-u3960864-m81ae10。
- 计划：追踪 Island 提示词投影及缓存 → 复现跨会话串用 → 最小修复 → 定向回归及渲染检查。
- 保留已有未提交修改，团队上下文只读；不操作用户的真实 agent 会话。
- 只读 runtime 状态及脱敏 hook 日志确认：多个 Codex provider 会话通过共享 app-server daemon 发送 hook，继承同一个终端身份；该身份不能代表每个会话的真实终端。Island 渲染本身按行消费文案。
- 修复策略：已确认 provider 绑定与本地待确认提示词优先，新 provider 不得无证据覆盖已有 owner；不确定归属保留 PTY OSC 状态。
- 修复入口归属并保留启动令牌校验，待确认提示词在匹配后及终端退出时清理；相同文本无法唯一对应时不建立新绑定。补充持久文档说明共享 daemon 的身份限制。

## Verification
- 待执行。
- 新增共享 daemon 错误身份事件序列，修复前复现 SessionStart 覆盖 A 的 provider、状态和提示词（1 failed / 2 passed）。
- 修复后状态/归属定向 56 tests 通过；全量 77 files / 570 tests 通过；类型检查、构建（含 RUNTIME_IMPORTS_OK）与 diff --check 通过。
- CodeGraph affected 未覆盖 runtime 的相关测试，已直接运行归属回归及全量测试；构建只有既有 bundle 大小提示。
- 独立 Chromium 加载实际构建 renderer 与 Island HTML，验证 working/done 相互切换及两个 done 各自显示不同提示词；截图 /tmp/sharkbay-daemon-isolation-island.png 已检查，无 pageerror。临时服务和浏览器已退出。
- 最后清理及文档补充后 npm run typecheck、git diff --check 均通过。

## Notes
- 用户截图显示两个 Done 会话提示词相同；原因尚未确认。
- 后续现场证据已确认共享 daemon 身份复用；本次未重启、替换已安装 App 或操作真实用户会话，当前运行实例须加载新构建才能生效。
- 原生 CLI 输入若缺少可确认的 provider 绑定，冲突 hook 被忽略并保留自身 PTY OSC 状态；已在 docs/agent-status.md 记录限制。
- 本任务未创建 commit，保留工作区其他修改。
