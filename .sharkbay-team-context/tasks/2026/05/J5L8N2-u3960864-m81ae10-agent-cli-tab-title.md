---
kind: sharkbay_task
taskId: J5L8N2-u3960864-m81ae10
taskTag: J5L8N2
mode: quick
title: Keep agent CLI tab title while running
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e35fd-dd20-76a1-bcf4-d5a7edf86bdd
createdAt: 2026-05-17T13:10:39Z
updatedAt: 2026-07-01T14:25:45Z
completedAt: 2026-05-17T13:13:28Z
commit: 04086bf5
---

## Summary
Kept terminal tabs launched from agent CLI shortcut buttons named after the CLI while that initial CLI process is active, then returned to normal terminal title behavior.

## Files
- src/shared/types.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/main/terminal.ts
- tests/terminal.test.ts

## Work
- Reviewed terminal title refresh and agent CLI shortcut launch paths.
- Related context: `H6V2K9-u3960864-m81ae10` touched agent CLI path resolution, but not tab title behavior.
- Planned a transient initial-command title that clears when terminal foreground returns to the shell or the command becomes stale.
- Added `initialCommandTitle` to terminal creation and wired agent shortcut buttons to pass the agent CLI label.
- Updated terminal title derivation so the transient title has priority while the initial command is tracked, but services still keep their existing title behavior.

## Verification
- `npm test -- tests/terminal.test.ts tests/agent-clis.test.ts`
- `npm run typecheck`
- `npm test`

## Notes
- User requested CLI client terminal tabs keep the CLI name, but stop doing so after the CLI exits via Ctrl-C or similar.
