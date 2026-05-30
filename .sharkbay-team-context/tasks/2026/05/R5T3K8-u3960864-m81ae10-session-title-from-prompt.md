---
kind: sharkbay_task
taskId: R5T3K8-u3960864-m81ae10
taskTag: R5T3K8
mode: task
title: Derive session title from first meaningful prompt
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 358ab2ce-dc3b-4f1d-9a7c-cd4b76b441ae
branch: main
createdAt: 2026-05-30T07:41:30Z
updatedAt: 2026-05-30T07:54:05Z
completedAt: 2026-05-30T07:54:05Z
commits:
  - 382eda24
---

## Summary
Sessions tab now shows the first meaningful user prompt as the title.
Boilerplate protocol preambles are skipped. Falls back to agent display name
(e.g. "Claude Code", "Codex CLI") when no prompt is available. OpenCode
plugin updated to forward prompt text in busy events.

## Files
- src/main/hooks/sessions.ts
- src/main/hooks/connectors/opencode.ts
- src/shared/types.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- tests/opencode-hooks.test.ts

## Work
- Added `title: string | null` field to HookSession and HookSessionViewModel.
- In parseHookSessions, capture the first non-boilerplate prompt per session
  via normalized.prompt. Added `sessionTitleFromPrompt` helper that skips
  known boilerplate prefixes and truncates to 50 chars at word boundary.
- Added `readTranscriptTitle` fallback that reads first 4KB of transcript
  JSONL for sessions where hooks.log didn't capture a usable prompt.
- Updated OpenCode plugin to include user prompt text in session.status.busy
  events (extracted from event.properties.input or status.content).
- Updated renderer fallback chain: title → restore?.label → agentId.
- Updated OpenCode test to verify prompt field.

## Verification
- `npx tsc --noEmit -p tsconfig.node.json` — 0 errors
- `npx tsc --noEmit -p tsconfig.renderer.json` — 0 errors
- `npx vitest run` — 157 tests pass (40 files)
- Runtime test against real hooks.log — meaningful titles appear for all
  sessions with captured prompts; others show agent display name.

## Notes
- OpenCode needs hooks reinstalled (`uninstall` + `install`) to pick up the
  new plugin script that forwards prompt text.
- The boilerplate prefix list (`BOILERPLATE_PREFIXES`) may need updating if
  new agent bootstrap prompts are introduced.
- CodeWhale/Qwen/DeepSeek sessions still fall back to agent name when they
  only have 1 prompt (the protocol preamble) — correct behavior.
