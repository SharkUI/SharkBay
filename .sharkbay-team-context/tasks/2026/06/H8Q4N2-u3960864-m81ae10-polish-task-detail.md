---
kind: sharkbay_task
taskId: H8Q4N2-u3960864-m81ae10
taskTag: H8Q4N2
mode: task
title: Polish task detail readability
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019eddf4-0159-7690-ac93-b9460f14d3eb
branch: main
createdAt: 2026-06-19T07:28:45Z
updatedAt: 2026-06-19T10:59:13Z
completedAt: 2026-06-19T10:59:13Z
---

## Summary
Improved the project detail task view so task records are easier to scan and read. The detail pane now shows structured metadata, Summary, Files, timeline-style Work, Verification, Commits, Notes, source details, and a collapsible raw record, with file rows opening the appropriate diff or editor target.

## Files
- .sharkbay/tasks/H8Q4N2-u3960864-m81ae10-polish-task-detail.md
- src/main/tasks.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/types.ts
- src/styles/app.css
- tests/tasks.test.ts

## Work
- Started task detail readability polish.
- Searched team context for related task detail and task panel work.
- Replaced the selected task raw markdown view with structured detail sections backed by existing `TaskViewModel` fields.
- Added compact task metadata, file chips, section lists, source/path details, and a collapsible raw task record.
- Added light and night theme styles for the new task detail layout.
- Reopened task to address follow-up readability feedback about fixed header, labels, bullets, item counts, and section splitting.
- Fixed task section extraction so multi-line Files, Work, Verification, and Notes sections no longer truncate after the first line.
- Kept the detail header fixed above the scrollable body, removed section item counts and decorative red dots, and made metadata labels regular weight.
- Added renderer `commits` typing so commit lists can render in task detail.
- Reopened task to move Summary out of the fixed header and make Work read closer to the task artifact mockup.
- Moved Summary into the scrollable detail body and changed the fixed header to an unboxed identity bar.
- Reworked Work into a step timeline instead of a plain list, with night-theme colors adjusted.
- Reopened task to simplify the fixed header and move task identity/status into metadata.
- Reduced the fixed header to back button, smaller avatar, and full wrapping title.
- Moved task ID, status, source, and mode into the metadata grid.
- Reopened task to wire task files to git diff double-click behavior, remove unhelpful Work step labels, and fix horizontal overflow.
- Changed Work timeline labels from `Step N` to compact numeric markers.
- Wired task detail file rows to open Git diff on double-click via the existing `onOpenGitDiff` path.
- Added width constraints to the task detail layout and rows to prevent horizontal overflow.
- Reopened task to tighten Work number spacing, support team task file diff opening, and investigate slower task list loading.
- Tightened Work timeline number spacing from a wide step label to a compact numeric column.
- Changed task file diff opening to use recorded task commits when present, so team-context completed tasks can open historical file diffs with `git show`.
- Replaced repeated task section regex extraction with one linear body section parse to reduce task scan work after fixing multi-line sections.
- Reopened task to fix old local tasks that record `commit:` while `commits` is an empty array.
- Fixed task detail commit selection to fall back from an empty `commits` array to the legacy single `commit` field.
- Reopened task to speed up task list display when switching projects by decoupling task loading from status loading.
- Decoupled task list state updates from protocol status loading so project switches can render tasks as soon as `getTasks` returns.
- Reopened task to fix duplicate React keys in Git history rendering.
- Made Git history row keys unique by appending the row index when selector/hash/date collide.
- Added `commits` to shared task view typing and added renderer fallback parsing from raw task markdown so tasks with only a `commits:` frontmatter list can still open historical diffs.
- Reopened task to preserve local commit metadata when a synced team-context task lacks commits.
- Changed task merge logic to prefer a local completed task over its team-context mirror when the local record has commit metadata and the mirror does not.
- Added a regression test using the Veridia `X4K7R2` shape: team mirror without commits plus local task with `commits: 8831eda2`.
- Reopened task to open new/untracked task files in the editor instead of an empty diff.
- Updated task file double-click behavior: recorded commits open historical diff; dirty tracked files open working diff; new/untracked or no-diff files open in the editor.
- Reopened task to fix task file rows whose recorded paths include trailing status annotations such as `(new)`.
- Normalized task file action paths by stripping trailing status annotations before opening a diff or editor, and treated `(new)`/`(added)` rows as editor targets.

## Verification
- Parsed `N5S8QA` locally and confirmed Files, Work, and Verification now return all recorded lines.
- Verified `git show --stat --patch` outputs for local tasks using legacy `commit:`, `commits:` list, short hashes, and full hashes.
- Confirmed `X4R7M2` raw task markdown resolves commit `7335eae8`, and `git show --stat --patch 7335eae8 -- src/island/island.html` outputs the expected diff.
- Confirmed Veridia `X4K7R2` local task has `commits: 8831eda2`, the team-context mirror lacks commits, and `git show --stat --patch 8831eda2 -- packages/server/src/routes/social.ts packages/web/src/pages/PostDetailPage.tsx` outputs the expected diff.
- `npm test -- tests/tasks.test.ts` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- `git diff --check -- src/main/tasks.ts tests/tasks.test.ts src/shared/types.ts src/renderer/types.ts src/renderer/App.tsx src/styles/app.css .sharkbay/tasks/H8Q4N2-u3960864-m81ae10-polish-task-detail.md` passed.
- Confirmed `packages/server/src/middleware/proxy-secret.ts (new)` normalizes to `packages/server/src/middleware/proxy-secret.ts` and that the Veridia file exists.
- `npm run typecheck` passed after action-path normalization.
- `npm run build` passed after action-path normalization.
- `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/H8Q4N2-u3960864-m81ae10-polish-task-detail.md` passed.

## Notes
- Related team context: `T5R8K2-u3960864-m81ae10` fixed task detail refresh; `R6T4W2-u3960864-m81ae10` cached task avatars; `RVW7K2-u3960864-m81ae10` added task review menu. Keep behavior unchanged.
