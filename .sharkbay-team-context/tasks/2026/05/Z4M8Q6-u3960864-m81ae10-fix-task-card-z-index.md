---
kind: sharkbay_task
taskId: Z4M8Q6-u3960864-m81ae10
taskTag: Z4M8Q6
mode: quick
title: Fix task card stacking
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e4e2f-0789-7e72-84bd-f2c2d62e3366
branch: main
createdAt: 2026-05-22T05:51:20Z
updatedAt: 2026-05-22T05:53:19Z
completedAt: 2026-05-22T05:53:19Z
---

## Summary
Fixed the right sidebar Teamwork task card stacking so cards no longer cover the sticky top tabs during scroll. Also reduced the restore session card indent by 5px.

## Files
- src/styles/app.css
- .sharkbay/tasks/Z4M8Q6-u3960864-m81ae10-fix-task-card-z-index.md

## Work
- Searched team context for related right sidebar, task card, z-index, and tab work.
- Started local task tracking before project changes.
- Identified matching `z-index: 2` values on sticky detail tabs and task queue items; raised the tab container above task cards.
- Reduced the restore session card left indent by 5px.

## Verification
- `git diff --check`
- `npm run typecheck`

## Notes
- Related team context candidates: R7S4M2-u3960864-m81ae10 and PDF1PX-u3960864-m81ae10.
