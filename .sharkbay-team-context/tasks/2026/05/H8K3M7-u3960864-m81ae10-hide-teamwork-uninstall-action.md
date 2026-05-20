---
kind: sharkbay_task
taskId: H8K3M7-u3960864-m81ae10
taskTag: H8K3M7
mode: quick
title: Hide unavailable Teamwork uninstall action
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
createdAt: 2026-05-20T00:54:53Z
updatedAt: 2026-05-20T00:55:39Z
completedAt: 2026-05-20T00:55:39Z
---

## Summary
Hid the project context-menu Teamwork uninstall action for projects where the local Teamwork harness is not installed.

## Files
- .sharkbay/tasks/H8K3M7-u3960864-m81ae10-hide-teamwork-uninstall-action.md
- src/renderer/App.tsx

## Work
- Checked related task context for project context-menu behavior.
- Started a scoped fix for the Uninstall Teamwork menu visibility.
- Changed the project context menu to load `teamwork.getStatus` for local projects and only render Uninstall Teamwork when `harnessInstalled` is true.

## Verification
- `npm run typecheck`
- `npm test -- tests/renderer-workflow.test.ts tests/terminal.test.ts`
- `git diff --check`

## Notes
- Builds on the uncommitted selected regression restore changes.
- No commit was produced.
