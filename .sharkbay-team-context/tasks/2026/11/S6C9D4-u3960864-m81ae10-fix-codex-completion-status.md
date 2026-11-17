---
kind: sharkbay_task
taskId: S6C9D4-u3960864-m81ae10
taskTag: S6C9D4
mode: task
title: 对照 Orca 修复 Codex 完成后仍显示 Working
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T10:33:16Z
updatedAt: 2026-11-17T10:45:52Z
completedAt: 2026-11-17T10:45:52Z
---

## Summary
对照 Orca 修复已复现的仲裁遗漏：旧 OSC waiting 可覆盖 hook Done，再由 OSC working 重开完成状态；现与 Orca 一样同时保护两者，仍允许真正的新工作/新 prompt。补充无正文的状态发布诊断，542 tests/类型检查/构建通过；历史截图缺少 OSC 发布记录，未认定为唯一触发点，当前运行实例未重启加载修改。

## Files
- .sharkbay/tasks/S6C9D4-u3960864-m81ae10-fix-codex-completion-status.md
- src/main/hooks/state-manager.ts
- tests/agent-status.test.ts
- docs/agent-status.md

## Work
- 用户要求解决方式先对比 Orca，不独自设计替代机制。已先调用 Orca 工作区 CodeGraph 上下文查询，并定位 SharkBay 的 CodexTurnReader、StateManager、屏幕状态合并链路。
- 已读协议、AGENTS.md、只读团队镜像，参考 O7S4K2-u3960864-m81ae10（状态链路）和 P5C8R1-u3960864-m81ae10（项目颜色优先级）；本次定位单 session 完成事实，不改变已确定的颜色排序。
- 计划：核对 Orca 完成检测/状态仲裁 → 读取本 session 的非文本状态证据与运行构建 → 复现差异并最小修复 → 测试验证。
- Orca 参考 commit 729ee62f379，已逐段读取 server/program-status/hook-precedence.ts、codex-transcript-poll.ts、codex-ended-turn-event.ts 与状态证据时钟。Orca 的 done 防重开保护同时覆盖 waiting 和 working；SharkBay 只保护 working，旧 waiting 可先抢占完成记录，后续 working 因来源变为 OSC 绕过保护。
- 实际回合在 10:24:44 UTC 有同 terminal/session/turn 的 turn_end hook 与 task_complete；无 child 事件，输入 hook 重放能到达 done。运行 App/Runtime 与当前构建一致。历史未记录 OSC 发布结果，不能将推断当作截图唯一根因；补充不含文本/令牌的状态发布诊断，便于核对后续真实来源。
- 新回归复现旧 OSC waiting 覆盖 done；按 Orca 同时保护 waiting/working，且验证完成后真正开始的新工作和新 prompt 仍可更新状态。统一状态发布诊断记录 state/lead/origin/revision/turn/terminal 与子任务数量，不含提示词或工具正文。
- 扩展真实生成 hook CLI → Unix socket → StateManager 集成验证，从 UserPromptSubmit working 到 Stop done，并确认发布诊断含终端/回合/状态/来源、不含 prompt 字段。未向用户终端注入测试消息或伪造实时状态。

## Verification
- 已确认截图回合的完成 hook 和 task_complete；已对照 Orca 的完成防重开与当前回合补偿实现，历史 OSC 发布记录不足以确认截图唯一触发原因。
- 针对性状态/终端归属/前端投影 56 项通过；npm run typecheck、全量 npm test（77 文件 / 542 tests）、npm run build、git diff --check 通过。
- 新增旧 waiting 覆盖完成的回归修复前失败、修复后通过；真正的新程序工作和 UserPromptSubmit 可正常更新。
- 扩展后的 CLI/Unix socket 完成与诊断回归通过（agent-status 21 项），最终类型检查和 diff check 通过。后续只调整测试缩进，未重复无关全量测试。

## Notes
- 保留所有并行工作区修改；不读取或记录私人提示词/回答/令牌，不中断用户 agent，不手工伪造完成状态。
- 团队上下文只读；未授权额外提交发布或应用替换。
- Orca 对照：src/main/agent-hooks/server/program-status/hook-precedence.ts；src/shared/agent-hook-listener/providers/codex/codex-transcript-poll.ts、codex-ended-turn-event.ts。已存在的 MIT NOTICE 保持不变。
- 加载新构建后若复现，应同时检查 hooks.log 的 normalized 输入与 status 发布记录，依据 source/revision/turn/terminal 查证覆盖链路；当前实例未应用本次代码，不将测试通过等同于截图问题已在线验收。
