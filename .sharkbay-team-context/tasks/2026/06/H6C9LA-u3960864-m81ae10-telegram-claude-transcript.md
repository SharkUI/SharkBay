---
kind: sharkbay_task
taskId: H6C9LA-u3960864-m81ae10
taskTag: H6C9LA
mode: task
title: Optimize Claude Telegram transcript behavior
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f036c-a166-7f71-9a3d-4e3cba8a3e08
branch: main
createdAt: 2026-06-26T10:38:47Z
updatedAt: 2026-06-26T10:41:21Z
completedAt: 2026-06-26T10:41:21Z
---

## Summary
按照 Kiro/Codex 的 Telegram 标准，为 Claude Code 增加干净 transcript 输出支持。Telegram 现在可从 Claude transcript 重建最终答案、显示干净进度，并避免回退到 TUI PTY。

## Files
- src/main/telegram/transcript.ts
- electron/ipc.ts
- tests/telegram-transcript.test.ts

## Work
- 目标聚焦 Claude Code 的 Telegram transcript reader、最终答案和进度表现。
- 假设暂不修改 Claude 提交键序列，除非发现和 Codex 一样的已知提交问题。
- 增加 Claude transcript parser：最终答案取最后一次工具后的 assistant text，纯文本轮保留全文，进度显示干净 text 和工具名。
- IPC transcript reader 支持从 `~/.claude/projects/**/<sessionId>.jsonl` 按 Claude session id 读取记录，并把 Claude 标记为支持 transcript 的 agent，避免回退到 TUI PTY。

## Verification
- `npm test -- tests/telegram-transcript.test.ts`：23 tests passed。
- `npm run typecheck`：renderer + node typecheck passed。
- `npm test -- tests/telegram-*.test.ts`：84 tests / 9 files passed。
- `npm run build`：node compile + Vite production build passed。
- `git diff --check`：passed。

## Notes
- 关联参考任务：K9R2WX、C8D4XM、T8M4QK。
