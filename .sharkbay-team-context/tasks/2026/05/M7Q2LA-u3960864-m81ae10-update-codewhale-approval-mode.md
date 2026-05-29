---
kind: sharkbay_task
taskId: M7Q2LA-u3960864-m81ae10
taskTag: M7Q2LA
mode: quick
title: Update CodeWhale approval mode
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e73e2-4c57-7cb2-9d40-e293e9a49e1a
branch: main
createdAt: 2026-05-29T13:20:44Z
updatedAt: 2026-05-29T13:22:34Z
completedAt: 2026-05-29T13:21:20Z
commits:
  - fe609b94a6ac85e4d2e97578b8631eb306658f04
---

## Summary
Updated the CodeWhale Agent CLI launch option from `--approval-policy full-auto` to `--approval-policy auto` after confirming the current CLI rejects `full-auto`.

## Files
- src/renderer/App.tsx

## Work
- Searched team context for related CodeWhale and Agent CLI settings work.
- Used CodeGraph to locate CodeWhale and Agent CLI launch option definitions.
- Confirmed CodeWhale v0.8.47 rejects `--approval-policy full-auto` and accepts `--approval-policy auto`.
- Updated the CodeWhale launch flag in the Agent CLIs settings definition.

## Verification
- `codewhale --version` reports CodeWhale v0.8.47.
- `HOME=$(mktemp -d /private/tmp/codewhale-home.XXXXXX) DEEPSEEK_API_KEY=dummy codewhale --approval-policy full-auto doctor` rejects `full-auto`.
- `HOME=$(mktemp -d /private/tmp/codewhale-home.XXXXXX) DEEPSEEK_API_KEY=dummy codewhale --approval-policy auto doctor` accepts `auto`.
- `codegraph affected src/renderer/App.tsx` reports no affected test files.
- `rg -n "full-auto|--approval-policy auto" src tests electron` finds only the updated `--approval-policy auto` entry.
- `npm run typecheck` passes.

## Notes
- Related team-context tasks: S9H4OK-u3960864-m81ae10, W5K9L2-u3960864-m81ae10, P9R4LX-u3960864-m81ae10.
