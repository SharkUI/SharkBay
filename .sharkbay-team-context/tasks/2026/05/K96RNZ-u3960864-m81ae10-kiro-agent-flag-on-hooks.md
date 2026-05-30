---
kind: sharkbay_task
taskId: K96RNZ-u3960864-m81ae10
taskTag: K96RNZ
mode: quick
title: Add --agent sharkbay flag to Kiro launch when hooks enabled
status: completed
completedAt: 2026-05-30T02:53:33Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro
sessionId: 960360dc-901f-46ae-8e6a-4069368dce43
branch: main
createdAt: 2026-05-30T02:51:13Z
updatedAt: 2026-05-30T02:53:33Z
---

## Summary
When launching Kiro from the agent button, sessions panel, or tasks panel with status hooks enabled, automatically add `--agent sharkbay` to the launch command.

## Files
- src/renderer/App.tsx

## Work
- Add `--agent sharkbay` flag to Kiro launch command in `openAgentProjectTab` when hooks are enabled.
- Add same flag to sessions panel restore (`buildAgentSessionRestoreCommand` call).
- Add same flag to tasks panel restore (`taskRestoreCommand`).

## Verification
- `npm run typecheck` passes.

## Notes
- Without this flag, Kiro uses kiro_default agent and the sharkbay.json hooks config is never loaded.
