---
kind: sharkbay_task
taskId: T8M4QK-u3960864-m81ae10
taskTag: T8M4QK
mode: quick
title: Fix Telegram Codex message submit
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f036c-a166-7f71-9a3d-4e3cba8a3e08
branch: main
createdAt: 2026-06-26T10:30:29Z
updatedAt: 2026-06-26T10:32:40Z
completedAt: 2026-06-26T10:32:40Z
---

## Summary
修复 Telegram 向 Codex 会话发送消息时只填入终端输入框但未提交的问题。Codex 现在复用 SharkBay 输入栏已验证的提交方式：先写文本，再延迟 30ms 写回车。

## Files
- src/main/telegram/service.ts
- tests/telegram-service.test.ts

## Work
- 用户反馈：Telegram 发给 Codex session 的消息进入 SharkBay terminal 输入框，但没有回车提交；Telegram 同时显示 working。
- 假设问题集中在 Codex TUI 需要不同的提交输入序列，而非会话映射失败。
- 参考 W2R6K8 的已验证行为，Codex Telegram 输入改为先写文本、再 30ms 后写 `\r`，避免 TUI paste-mode 吞掉提交。
- 保持非 Codex agent 的原有单次 `text + \r` 写入行为不变。

## Verification
- `npm test -- tests/telegram-service.test.ts`：2 tests passed。
- `npm run typecheck`：renderer + node typecheck passed。
- `npm test -- tests/telegram-*.test.ts`：78 tests / 9 files passed。
- `npm run build`：node compile + Vite production build passed。
- `git diff --check`：passed。

## Notes
- 关联前置任务：C8D4XM、K9R2WX。
- 关联上下文任务：W2R6K8 记录 Codex 需拆分文本和 30ms 延迟回车才能稳定提交。
