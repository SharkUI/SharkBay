---
kind: sharkbay_task
taskId: Q7M4K2-u3960864-m81ae10
taskTag: Q7M4K2
mode: task
title: Fix CodeWhale turn-end hook state
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.6
sessionId: 019fc264-00bb-7da1-b0d7-05480064db73
branch: main
createdAt: 2026-08-02T12:18:05Z
updatedAt: 2026-08-02T12:18:31Z
completedAt: 2026-08-02T12:18:31Z
---

## Summary

修复 CodeWhale 更新后使用 `turn_end` 结束回合但 SharkBay 仍显示 `working` 的问题。

## Files

- src/main/hooks/connectors/codewhale.ts
- tests/codewhale-hooks.test.ts

## Work

- 将 CodeWhale 的 `turn_end` hook 注册、解析并映射到 `stopped` 状态。
- 参考既有相关任务 S9H4OK、F3Q8M6，保持旧 hook 行为兼容。
- 保留 `session_end`，让旧版 CodeWhale 配置继续可用。

## Verification

- `npm test -- --run tests/codewhale-hooks.test.ts`：11/11 通过。
- `codegraph affected src/main/hooks/connectors/codewhale.ts tests/codewhale-hooks.test.ts`：识别到 `tests/codewhale-hooks.test.ts`。

## Notes

- 任务开始前已通过 CodeGraph 定位 connector 和 state manager；CodeWhale 当前版本为 v0.8.47。
