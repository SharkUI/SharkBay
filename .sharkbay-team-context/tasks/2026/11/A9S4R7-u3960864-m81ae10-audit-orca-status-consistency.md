---
kind: sharkbay_task
taskId: A9S4R7-u3960864-m81ae10
taskTag: A9S4R7
mode: task
title: 再审 Orca 与 SharkBay 状态处理一致性
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T10:51:28Z
updatedAt: 2026-11-17T11:07:36Z
completedAt: 2026-11-17T11:07:36Z
---

## Summary
逐段对照本机 Orca，修复 OSC 结果与会话边界、来源仲裁、provider 回合保持、等待合并、rollout 追读及前端版本排序遗漏，并记录九组来源依据。新增 22 项回归，全量 564 tests、类型检查与构建通过；保留用户指定的项目五色优先级及既有产品范围。

## Files
- .sharkbay/tasks/A9S4R7-u3960864-m81ae10-audit-orca-status-consistency.md
- src/main/hooks/program-status.ts
- src/main/hooks/state-manager.ts
- src/main/hooks/codex-turn-reader.ts
- src/renderer/hook-snapshots.ts
- src/renderer/App.tsx
- tests/agent-status.test.ts
- tests/hook-snapshots.test.ts
- docs/agent-status.md
- src/main/hooks/connectors/claude-family.ts

## Work
- 已读协议、AGENTS.md、只读团队镜像，参考 O7S4K2-u3960864-m81ae10、S6C9D4-u3960864-m81ae10 与 P5C8R1-u3960864-m81ae10。
- 计划：对照 hook/OSC 仲裁与传输 → 完成回合/子任务/等待生命周期 → 归属、时钟、未读及聚合 → 复现确定差异并最小修复 → 定向及整体验证。
- Orca 参考为本机 /Users/shark/Projects/orca 的 729ee62f379；不把可复现漏洞、产品范围差异和未知现象混为一谈，不自动引入云/SSH/tmux/账号体系。
- 已逐段确认：OSC 完成后 idle 的结果保持/启动空闲、9999 工作时钟、新工作 waiting 立即接管、子任务保持的跨源隔离、OSC 接管后的 turn/transcript 身份、主任务阻塞优先、混合异常回答逐项处理、同 authority revision 排序与 rollout 增量读取均有需回归的差异。先补失败测试，再最小修复。
- 首轮 13 个失败用例已复现并修复，定向 98 tests 通过。进一步检查会话边界：补充 OSC 133 / RIS 的 invocation 重置、OpenCode 跨标签广播保护、各 connector 新会话 idle 及 Claude compact SessionStart 不得结束当前回合。
- 第二轮 5 个边界失败用例及 OSC 9999 原生结果丢失已复现并修复；补齐 provider 已结束标记，避免旧 rollout/重复 Stop 在 OSC 新工作中再次结束旧回合。shell 控制符仅作用于本协议已报告的记录，不凭空产生完成证据。文档记录逐项 Orca 来源、兼容差异及现场验证范围。
- 收尾复核补充 async wait 聚合态仲裁失败回归：不得只对比 working 主任务而永远阻止新的 OSC working 恢复等待；改用组合执行态，同时保留旧 working 的等待保护。
- 已检查终端归属、屏幕/hook 合并、已读、项目聚合与 Island 消费状态的路径；维持项目红 > 黄 > 蓝 > 绿 > 灰及 Island 既有通知顺序。全部改动限定于 Files 清单，没有修改其他并行功能。

## Verification
- 待完成逐项对照与回归验证。
- 首轮 npx vitest run tests/agent-status.test.ts：修复前 13 failed / 21 passed，修复后 34 passed；前端和归属等六个文件定向 98 passed。首轮 npm run typecheck 通过。
- 第二轮边界回归修复前 5 failed，原生 9999 及组合等待仲裁各复现 1 failed；均修复。全量首轮 77 files / 563 tests、类型检查及 diff --check 通过；最后新增仲裁用例后定向 42 tests 通过，待最终重跑及构建。
- 最终 npm test：77 files / 564 tests 全通过；npm run typecheck、npm run build（含 RUNTIME_IMPORTS_OK）、git diff --check 均通过。Vite 保留既有大包体积提示。
- 对照基准 Orca 729ee62f379；未逐一启动每种 CLI 做现场验收，也未重启或加载当前运行实例。不宣称截图历史触发原因已被唯一证实。

## Notes
- 保留工作区所有并行修改；不发布、安装、重启或操作用户正在运行的 agent。
- 团队上下文只读，不记录私人提示词、回答或令牌。
- 本任务未提交、推送、发布或安装；无新增 commit。打包输出仍留在忽略的构建目录，当前运行 App 尚未加载本次修复。
