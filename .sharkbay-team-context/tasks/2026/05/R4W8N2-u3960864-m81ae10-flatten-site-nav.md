---
kind: sharkbay_task
taskId: R4W8N2-u3960864-m81ae10
taskTag: R4W8N2
mode: quick
title: Flatten knowledge site sidebar navigation
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Sonnet 4
createdAt: 2026-05-18T11:44:00+08:00
updatedAt: 2026-05-18T11:44:00+08:00
---

## Summary
Remove categorized nav-section/nav-label wrappers from knowledge site sidebar; output flat nav-link list instead.

## Files
- src/main/knowledge-site.ts

## Work
- Replace buildNav() to emit flat links without section grouping.
- Remove .nav-section and .nav-label CSS rules; adjust .site-nav gap.

## Verification
- npm run typecheck
- npm test

## Notes
- Each category only had 1-2 links, making the grouping pointless.
