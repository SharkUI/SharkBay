---
kind: sharkbay_task
taskId: M7Q4N6-u3960864-m81ae10
taskTag: M7Q4N6
mode: quick
title: Remove agent download button
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e7681-b658-71a2-a8ae-a5eb20ee0b39
branch: main
createdAt: 2026-05-30T01:33:01Z
updatedAt: 2026-05-30T01:36:33Z
completedAt: 2026-05-30T01:34:36Z
commits:
  - 515363a0
---

## Summary
Removed the download/settings shortcut button shown beside agent launch buttons in the terminal toolbar. The regular settings entry remains available elsewhere.

## Files
- .sharkbay/tasks/M7Q4N6-u3960864-m81ae10-remove-agent-download-button.md
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Searched team context for related agent/settings button work.
- Found related task W5K9L2-u3960864-m81ae10, which originally wired the download button to open Settings > Agent CLIs.
- Located the terminal toolbar rendering path with CodeGraph and targeted the agent settings shortcut removal.
- Removed both toolbar render instances, the now-unused callback prop chain, the DownloadIcon helper, and obsolete CSS selector references.

## Verification
- `rg -n "onOpenAgentCliSettings|DownloadIcon|terminal-agent-install-button" src` returned no matches.
- `codegraph affected src/renderer/App.tsx src/styles/app.css` reported no affected test files.
- `npm run typecheck` passed.

## Notes
- Keep .sharkbay/team-context/ read-only.
