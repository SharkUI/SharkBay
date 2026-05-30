---
kind: sharkbay_task
taskId: M8Q2R6-u3960864-m81ae10
taskTag: M8Q2R6
mode: quick
title: Focus input on tab switch
status: completed
completedAt: 2026-05-30T12:52:21Z
commits:
  - c239fb0ae6de5168560d8a34c4ef51067d28aef8
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e786b-776c-7f91-bc22-f380d87b55df
branch: main
createdAt: 2026-05-30T12:50:14Z
updatedAt: 2026-05-30T12:55:35Z
---

## Summary
Switching terminal tabs now places focus in the bottom prompt input by default.

## Files
- .sharkbay/tasks/M8Q2R6-u3960864-m81ae10-focus-input-on-tab-switch.md
- src/renderer/App.tsx

## Work
- Reviewed related team context tasks `W2R6K8-u3960864-m81ae10` and `F4C8R2-u3960864-m81ae10`.
- Passed terminal tab focus requests through to the bottom prompt input.
- Focused the prompt textarea after terminal tab activation while preserving browser tab activation behavior.

## Verification
- `codegraph affected src/renderer/App.tsx`
- `npm run typecheck`
- `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/M8Q2R6-u3960864-m81ae10-focus-input-on-tab-switch.md`

## Notes
- Preserve the bottom input bar behavior added by `W2R6K8-u3960864-m81ae10`.
- This supersedes the previous terminal-focus default from `F4C8R2-u3960864-m81ae10` for tab switches.
