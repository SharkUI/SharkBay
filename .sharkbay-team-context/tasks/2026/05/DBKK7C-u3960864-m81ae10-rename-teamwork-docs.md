---
kind: sharkbay_task
taskId: DBKK7C-u3960864-m81ae10
taskTag: DBKK7C
mode: task
title: Rename Teamwork to Protocol in documentation
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: a7ddbbdb-bc28-4de6-ab36-b57cd200e0e6
branch: main
createdAt: 2026-05-28T08:03:22Z
updatedAt: 2026-05-28T08:06:15Z
completedAt: 2026-05-28T08:06:15Z
commits:
  - 4a529efa
---

## Summary
Renamed doc files and updated all documentation content to reflect TASKS/Protocol naming.

## Files
- docs/tasks.md (renamed from teamwork.md)
- docs/tasks-protocol-helper.md (renamed from teamwork-protocol-helper.md)
- docs/shared/tasks-design.html (renamed from teamwork-design.html)
- docs/shared/tasks-ui-mockup.html (renamed from teamwork-ui-mockup.html)
- docs/product.md
- docs/architecture.md
- docs/roadmap.md
- docs/agents.md
- docs/testing.md
- docs/development.md
- docs/index.md
- docs/shared/README.md
- README.md

## Work
- Renamed 4 doc files via git mv
- Updated all Teamwork → Protocol/Task Protocol references in 10+ doc files
- Updated TEAM → TASKS tab references
- Updated README heading, doc link, and requirements text
- Kept team-context branch references unchanged

## Verification
- All doc links verified consistent with renamed files

## Notes
- Follows commit 48d0150a which renamed source/test files
