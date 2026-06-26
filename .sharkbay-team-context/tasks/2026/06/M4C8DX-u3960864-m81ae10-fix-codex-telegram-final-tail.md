---
kind: sharkbay_task
taskId: M4C8DX-u3960864-m81ae10
taskTag: M4C8DX
mode: quick
title: Fix Codex Telegram final answer tail truncation
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f036c-a166-7f71-9a3d-4e3cba8a3e08
branch: main
createdAt: 2026-06-26T12:28:10Z
updatedAt: 2026-06-26T12:45:25Z
completedAt: 2026-06-26T12:30:00Z
commits:
  - 22a3a48c
---

## Summary
修复 Codex Telegram 最终答案疑似从尾部截断的问题。Codex final answer 现在优先使用完整 assistant transcript 文本，仅在没有 assistant text 时才回退到 `task_complete.last_agent_message`。

## Files
- src/main/telegram/transcript.ts
- tests/telegram-transcript.test.ts

## Work
- 用户反馈 CommonTasks 项目中的 Codex turn 最终 result 疑似只显示尾部。
- 初步判断：`task_complete.last_agent_message` 可能是 Codex 的尾部摘要，不应优先于完整 assistant `response_item` 文本。
- 调整 Codex final answer 优先级：assistant `response_item` 文本优先，`task_complete.last_agent_message` 仅在没有 assistant text 时兜底。
- 增加回归测试，覆盖 `task_complete` 为尾部摘要时不覆盖完整 assistant transcript。

## Verification
- `npm test -- tests/telegram-transcript.test.ts`：26 tests passed。
- `npm run typecheck`：renderer + node typecheck passed。
- `npm test -- tests/telegram-*.test.ts`：88 tests / 9 files passed。
- `git diff --check`：passed。

## Notes
- 关联任务：C8D4XM。
