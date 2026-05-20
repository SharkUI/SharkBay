---
kind: sharkbay_task
taskId: M8T4Q6-u3960864-m81ae10
taskTag: M8T4Q6
mode: quick
title: Keep agent CLI buttons during refresh
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
createdAt: 2026-05-20T01:20:23Z
updatedAt: 2026-05-20T01:21:51Z
completedAt: 2026-05-20T01:21:51Z
---

## Summary
Kept existing agent CLI shortcut buttons visible while project switches trigger a background availability refresh. The refreshed list replaces the stale buttons once `listClis` resolves.

## Files
- .sharkbay/tasks/M8T4Q6-u3960864-m81ae10-stale-agent-cli-buttons.md
- src/renderer/App.tsx

## Work
- Started from related context `N4P7KQ-u3960864-m81ae10`, which made local agent CLI listing force-refresh MachineProfile data to avoid stale packaged app detection.
- Updating the renderer to keep last-known agent CLI buttons visible and replace them only after the background `listClis` call resolves.
- Added a per-target renderer cache so switching back to a previously seen local/remote target can show that target's last-known CLI buttons immediately.

## Verification
- `npm test -- tests/core-agent-list.test.ts tests/renderer-workflow.test.ts`
- `npm run typecheck`
- `git diff --check`

## Notes
- `.sharkbay/team-context/` was searched and treated as read-only.
