---
kind: sharkbay_task
taskId: K9V2M4-u3960864-m81ae10
taskTag: K9V2M4
mode: task
title: Knowledge site docs nav and multi-format support
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: kiro
createdAt: 2026-05-17T10:20:00Z
updatedAt: 2026-05-17T10:23:00Z
---

## Summary
Updated knowledge site generation to show Docs nav with /docs link and subdirectory items, and support .md/.txt/.htm/.html files in docs/.

## Files
- src/main/knowledge-site.ts

## Work
- Updated discoverDocs to walk docs/ collecting .md, .txt, .htm, .html files with a kind field.
- Updated buildNav to show "Docs" link pointing to /docs and subdirectory links beneath.
- HTML files are copied as-is to the site output; txt files are rendered like md.
- Subdirectory folders are created in site output with their own index pages.
- Replaced task card layout with thin-line-separated rows using details/summary for expand/collapse.
- Added createdAt date display in task meta.
- Task title is clickable; expanding shows full task body rendered as markdown with refined typography.
- Bumped template version to v3 to force regeneration.

## Verification
- npm run typecheck: passes
- npm test: 56 tests pass across 16 test files

## Notes
- The docs/shared/ subdirectory contains .html files (teamwork-design.html, teamwork-ui-mockup.html) which will now be included.
- Only one level of subdirectory nesting is shown in nav; deeper nesting is supported in output but not in nav links.
