---
kind: sharkbay_task
taskId: R3W7K5-u3960864-m81ae10
taskTag: R3W7K5
mode: task
title: Fix Kiro sharkbay agent config to include default tools list
status: completed
completedAt: 2026-05-30T03:56:50Z
commits:
  - 489a89b9
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: b391fb24-23f2-451c-a2b9-2c77593f9e98
branch: main
createdAt: 2026-05-30T03:06:05Z
updatedAt: 2026-05-30T04:19:04Z
---

## Summary
Fixed KiroConnector install() to write `tools: ["*"]` in sharkbay.json, ensuring --agent sharkbay has all tools available (identical to kiro_default). Retains --agent sharkbay injection in App.tsx.

## Files
- src/main/hooks/connectors/kiro.ts
- src/main/hooks/connectors/gemini.ts
- src/renderer/App.tsx

## Work
- Investigated settings.json: confirmed Kiro does NOT read hooks from ~/.kiro/settings.json (manual echo test — no output)
- Investigated kiro_default.json override: hooks fire but Kiro gives empty tool set when no tools field present
- Final Kiro approach: sharkbay.json + --agent sharkbay + `tools: ["*"]` (wildcard includes all tools)
- Validated with `kiro-cli agent validate` — passes
- install() now sets config.tools = ["*"] if not already present
- App.tsx --agent sharkbay injection restored in all 3 locations
- Fixed GeminiConnector install(): Gemini requires nested `{matcher, hooks: [...]}` format, not flat entries
- Prior flat format (`{type, command, timeout}` directly in event array) was silently ignored by Gemini CLI

## Verification
- `npm run typecheck` passes
- `npm test` — 145 tests pass (39 files)
- `kiro-cli agent validate --path ~/.kiro/agents/sharkbay.json` passes
- Manual: Kiro hooks fire and session appears in SharkBay
- Manual: Gemini hooks fire with corrected nested format

## Notes
- Kiro CLI does not read hooks from ~/.kiro/settings.json (only from agent configs)
- Kiro CLI does not inherit built-in tools when an agent config omits the tools field — must be explicit
- `tools: ["*"]` is the wildcard — includes all built-in tools, same as kiro_default's behavior
- Using wildcard avoids maintaining a hardcoded list that could diverge from future Kiro versions
- K96RNZ original approach was correct (--agent sharkbay); the missing piece was the tools field
