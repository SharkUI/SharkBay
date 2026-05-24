---
kind: sharkbay_task
taskId: V3N8W2-u3960864-m81ae10
taskTag: V3N8W2
mode: quick
title: Fix project context menu unstable width
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 6b1bca8e-19da-4f89-a2b7-cc63c69b5161
branch: main
createdAt: 2026-05-24T07:18:44Z
updatedAt: 2026-05-24T07:24:58Z
completedAt: 2026-05-24T07:24:58Z
commits:
  - 8ef86bfd
---

## Summary
Fix the project card context menu width being unstable — too wide when "Uninstall Teamwork" item is shown.

## Files
- src/styles/app.css

## Work
- Menu has `min-width: 178px` but no max-width; "Uninstall Teamwork" text stretches it.
- Add `white-space: nowrap` to menu items and a fixed `width` to the menu container.

## Verification
- `npm run typecheck` passes
- `npm run build` passes

## Notes
- Related: R9T2K6 introduced the context menu, H8K3M7 conditionally shows Uninstall Teamwork.
