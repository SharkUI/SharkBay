---
kind: sharkbay_task
taskId: U7P4Q9-u3960864-m81ae10
taskTag: U7P4Q9
mode: task
title: Fix token usage layout
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e5f88-ae0c-7e71-bb57-4a85430a96d3
branch: main
createdAt: 2026-05-25T14:28:42Z
updatedAt: 2026-05-25T14:37:13Z
completedAt: 2026-05-25T14:35:24Z
commits:
  - 64c2433bd2c67aa4ca23fb14ffd6989b14001096
---

## Summary
Improved the token usage detail window layout so the summary and chart form a compact top overview. The breakdown tables now use full-width rows at the default window size, avoiding cramped columns and horizontal clipping.

## Files
- src/usage-window/UsageReport.tsx
- src/usage-window/usage-window.css
- .sharkbay/tasks/U7P4Q9-u3960864-m81ae10-fix-token-usage-layout.md

## Work
- Searched team context for prior token usage layout work and found relevant tasks T8M3X5 and R4W7K2.
- Reviewed the existing mockup and found prior dirty changes in the usage window files from an earlier session.
- Reworked the usage detail layout so the summary and chart share a compact top overview, while breakdown tables use full-width rows at the default detail-window width.

## Verification
- `npm run typecheck` passed.
- `npm run build` passed.
- Launched `npm run dev` and visually inspected the Token Usage window in Electron.
- `git diff --check -- src/usage-window/UsageReport.tsx src/usage-window/usage-window.css .sharkbay/tasks/U7P4Q9-u3960864-m81ae10-fix-token-usage-layout.md` passed.
- Committed as `64c2433bd2c67aa4ca23fb14ffd6989b14001096`.

## Notes
- Review the existing usage detail mockup before editing the implementation.
- Preserve the pre-existing dirty changes in `src/usage-window/UsageReport.tsx` and `src/usage-window/usage-window.css` while correcting the layout.
