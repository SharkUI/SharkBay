---
kind: sharkbay_task
taskId: W6P2D8-u3960864-m81ae10
taskTag: W6P2D8
mode: task
title: 过期状态允许实时 Codex 工作指示兜底
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e944-e36f-7f03-8201-84fff8c2977a
branch: main
createdAt: 2026-11-17T11:55:25Z
updatedAt: 2026-11-17T11:57:32Z
completedAt: 2026-11-17T11:57:32Z
---

## Summary
已修复用户截图中 Codex 仍工作、项目却显示 Done 的过期状态投影问题：unverifiable 证据允许当前屏幕工作/等待指示兜底，项目及 Island 随该终端显示 Working；有效结束事实仍优先。定向 60 tests、类型检查、构建及实际 renderer/xterm/Island 渲染验证通过。

## Files
- src/shared/agent-status.ts
- tests/codex-input-state.test.ts
- docs/agent-status.md

## Work
- 已读取协议、AGENTS.md 与团队状态优先级任务 P5C8R1-u3960864-m81ae10；参考 A9S4R7-u3960864-m81ae10 及 I6P8Q3-u3960864-m81ae10。保留现有未提交修改和团队只读镜像。
- CodeGraph 定位 codexActivityWithHook、mergeAgentScreenState、项目优先级投影；现场只读状态确认该终端 OSC 证据已过期为 unverifiable，另一标签为 done。
- 计划：补充实时 Working 与过期证据的失败回归 → 最小调整过期兜底 → 状态及项目/Island 渲染验证。
- 保持有效 hook 完成/失败/等待的权威性，不因旧屏幕文字重开已结束回合。
- 已增加仅在 unverifiable 下采纳当前 working/waiting 的最小修复，同时保留 idle/done 不解除过期；持久文档已记录规则。

## Verification
- 待执行。
- 新增回归修复前 2 failed / 30 passed，修复后 Codex 输入状态 32 tests 通过；相关四文件 129 passed / 4 failed。
- 4 个失败位于并行新增的 Claude elicitation/OSC 边界生命周期用例，直接调用 StateManager、不经过本次修改的 mergeAgentScreenState；保留其代码，不将本次结果称为全量通过。
- npm run typecheck、npm run build 通过；仅既有 bundle 大小提示。真实渲染待执行。
- 最终定向 Codex 输入状态、renderer workflow、Island 自动展开三个文件 60 tests 通过；git diff --check 通过。
- 实际构建 renderer/xterm 接收 Working 32m 29s 输出及 unverifiable 快照，另一标签为 done；终端灯、项目胶囊、Island 均显示 Working。随后收到有效 done，旧 spinner 不重开回合，项目恢复 Done。无 pageerror，截图 /tmp/sharkbay-stale-working.png 及 /tmp/sharkbay-stale-working-island.png 已检查；临时浏览器与服务退出。

## Notes
- 不操作真实 agent 会话，不替换或重启已安装 App。
- 当前 App 需要加载新构建才能生效；本任务未创建 commit。扩展状态测试的四个并行生命周期失败已如实保留，未宣称全量通过。
