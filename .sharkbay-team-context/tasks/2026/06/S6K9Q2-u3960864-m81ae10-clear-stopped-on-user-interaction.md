---
kind: sharkbay_task
taskId: S6K9Q2-u3960864-m81ae10
taskTag: S6K9Q2
mode: quick
title: Clear stopped state on user interaction
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019eb627-4f9c-7573-8bd2-b6929629d616
branch: main
createdAt: 2026-06-11T10:36:00Z
updatedAt: 2026-06-11T10:37:55Z
completedAt: 2026-06-11T10:37:55Z
---

## Summary
Stopped agent tab lights now clear to unknown when the user explicitly interacts with the stopped session through the prompt bar or terminal input. Approval handling remains on the existing input/timeout path to avoid clearing approval on light focus-style interactions.

## Files
- src/renderer/App.tsx

## Work
- Reviewed related team-context tasks K8V2N5, Q7K4N8, and P7Q3K9 to avoid reintroducing focus-based premature clearing.
- Planned to clear only `stopped` agent tab state on explicit user interaction, leaving `approval` handling unchanged.
- Added stopped-only acknowledge handling for prompt pointer/key interaction and direct xterm input.
- Kept actual prompt text input clearing both `stopped` and `approval`, matching the previous behavior.

## Verification
- `npm run typecheck`
- `git diff --check`
- `codegraph affected src/renderer/App.tsx` reported no affected test files.

## Notes
- `.sharkbay/team-context/` is read-only.
