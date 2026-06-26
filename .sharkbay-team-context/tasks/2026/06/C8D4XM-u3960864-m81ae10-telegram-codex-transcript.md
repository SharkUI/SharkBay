---
kind: sharkbay_task
taskId: C8D4XM-u3960864-m81ae10
taskTag: C8D4XM
mode: task
title: Optimize Codex Telegram transcript behavior
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
branch: main
createdAt: 2026-06-26T10:18:20Z
updatedAt: 2026-06-26T10:23:33Z
completedAt: 2026-06-26T10:23:33Z
---

## Summary
参考 K9R2WX 的 Kiro Telegram 标准，为 Codex 增加 transcript reader 支持。Telegram 现在可从 Codex rollout jsonl 重建干净最终答案、显示干净进度，并避免回退到 TUI PTY 乱码。

## Files
- src/main/telegram/transcript.ts
- electron/ipc.ts
- tests/telegram-transcript.test.ts

## Work
- 参考任务 K9R2WX，目标聚焦 Codex transcript 支持，不扩展到其他 agent。
- 为 Telegram transcript 增加 Codex 干净答案、实时进度和最近 turn 起点解析。
- IPC transcript reader 支持从 `~/.codex/sessions/**/rollout-*.jsonl` 按 Codex session id 读取记录，并把 Codex 标记为支持 transcript 的 agent，避免回退到 TUI PTY 乱码。

## Verification
- `npm test -- tests/telegram-transcript.test.ts`：17 tests passed。
- `npm run typecheck`：renderer + node typecheck passed。
- `npm test`：288 tests / 54 files passed。
- `npm run build`：node compile + Vite production build passed。

## Notes
- 关联参考任务：K9R2WX。
- team-context 中未找到已完成的 Codex Telegram transcript 实现；K9R2WX 明确记录 Codex 仍待调研路径与格式。
