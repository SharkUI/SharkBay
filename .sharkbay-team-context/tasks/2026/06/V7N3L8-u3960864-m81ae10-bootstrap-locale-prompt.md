---
kind: sharkbay_task
taskId: V7N3L8-u3960864-m81ae10
taskTag: V7N3L8
mode: task
title: Add system locale to bootstrap prompt
status: completed
completedAt: 2026-06-08T01:26:33Z
commits:
  - ef6da863
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: db6819b8-a774-4812-a148-7cbde6f18f8e
branch: feat/island-overlay
createdAt: 2026-06-08T01:21:54Z
updatedAt: 2026-06-08T01:26:33Z
---

## Summary
Detect user's system locale and append a language instruction to the bootstrap prompt so agents respond in the user's language instead of defaulting to English.

## Files
- electron/main.ts
- src/main/harness.ts

## Work
- Set `process.env.SHARKBAY_LOCALE = app.getLocale()` in electron/main.ts before spawning core
- Added `localeLanguageSuffix()` in harness.ts that reads the env var and uses `Intl.DisplayNames` to produce native-language name (e.g. "中文", "日本語", "français")
- bootstrapPrompt() appends "Respond in {language}." for non-English locales
- English locales produce no suffix (prompt is already English)

## Verification
- `tsc -p tsconfig.node.json --noEmit` passes
- `vitest run tests/harness.test.ts` — 16 tests pass
- Manually verified: zh-CN→"Respond in 中文.", ja-JP→"Respond in 日本語.", en-US→skipped

## Notes
- app.getLocale() in Electron main is the most reliable source
- Utility process inherits env from main, so env var is the simplest plumbing
- Skip the instruction for en/en-* locales since the prompt is already English
