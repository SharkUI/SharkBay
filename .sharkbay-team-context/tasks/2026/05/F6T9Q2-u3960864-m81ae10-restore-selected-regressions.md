---
kind: sharkbay_task
taskId: F6T9Q2-u3960864-m81ae10
taskTag: F6T9Q2
mode: task
title: Restore selected regressions
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e42cc-41db-7920-9c0f-b2fc3ba04731
createdAt: 2026-05-20T00:46:35Z
updatedAt: 2026-07-01T14:25:45Z
completedAt: 2026-05-20T00:51:42Z
commit: 55dc6e26
---

## Summary
Restored the three requested post-pull regressions only: agent CLI tabs keep the CLI label, Git tabs show dirty-file count badges again, and repo owners can choose to clean the team context branch when uninstalling Teamwork.

## Files
- .sharkbay/tasks/F6T9Q2-u3960864-m81ae10-restore-selected-regressions.md
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/types.ts
- src/main/terminal.ts
- src/styles/app.css
- tests/terminal.test.ts

## Work
- Checked related task context for prior agent CLI title, dirty badge, and Teamwork uninstall behavior.
- Started scoped implementation for only the three requested behaviors.
- Planned localized changes to restore the previous terminal title field, tab badge markup/style, and owner-gated Teamwork context cleanup UI.
- Added `initialCommandTitle` back through shared/renderer types and terminal title derivation, while preserving service title priority.
- Added the Git dirty count badge to the project detail Git tab.
- Restored owner-gated Teamwork context cleanup UI by checking the project GitHub owner against the resolved GitHub identity before showing the cleanup checkbox.

## Verification
- `npm test -- tests/terminal.test.ts`
- `npm run typecheck`
- `npm test`
- `git diff --check`

## Notes
- User explicitly asked not to restore other reviewed behavior changes.
- No commit was produced.
