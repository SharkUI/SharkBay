---
kind: sharkbay_task
taskId: R8A4SV-u3960864-m81ae10
taskTag: R8A4SV
mode: task
title: Unify artifact review storage and site navigation
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019ee069-6e90-7cf2-be9f-3853f631443c
branch: main
createdAt: 2026-06-19T15:26:31Z
updatedAt: 2026-06-19T15:31:21Z
completedAt: 2026-06-19T15:31:21Z
---

## Summary
Task artifact storage now matches review storage: new artifacts are reserved under `.sharkbay/artifacts/<taskTag>-<code>.html`, while reviews remain under `.sharkbay/reviews/<taskTag>-<code>.md`. Knowledge Site now exposes Artifacts and Reviews as Tasks sub-pages without treating `.sharkbay/site/` as the persistent source directory.

## Files
- .sharkbay/tasks/R8A4SV-u3960864-m81ae10-unify-task-artifact-review-site.md
- electron/ipc.ts
- src/main/harness.ts
- src/main/knowledge-site.ts
- tests/harness.test.ts
- tests/knowledge-site.test.ts
- tests/task-detail-helpers.test.ts
- tests/tasks.test.ts

## Work
- Started task after clarifying that `.sharkbay/site/` is generated output and should not be the persistent source directory for user/agent artifacts.
- Planned storage alignment: use `.sharkbay/artifacts/<taskTag>-<code>.html` and `.sharkbay/reviews/<taskTag>-<code>.md`, with Knowledge Site reading task records to index them.
- Changed artifact prompt fallback and reserved paths from `.sharkbay/site/artifacts/<taskTag>/<code>.html` to `.sharkbay/artifacts/<taskTag>-<code>.html`.
- Kept the artifact opener compatible with old `.sharkbay/site/artifacts/` files while allowing the new `.sharkbay/artifacts/` source directory.
- Reworked Knowledge Site task discovery to use merged task records from `scanTasks`, so locally appended Artifacts/Reviews are visible even when a team-context task copy wins.
- Added generated Tasks sub-pages for Artifacts and Reviews; artifact rows link to persistent HTML files, while review Markdown files render into generated review pages under `.sharkbay/site/tasks/reviews/`.
- Updated tests for the new artifact path convention and Knowledge Site artifact/review navigation.

## Verification
- `codegraph affected src/main/harness.ts electron/ipc.ts src/main/knowledge-site.ts tests/harness.test.ts tests/knowledge-site.test.ts tests/task-detail-helpers.test.ts tests/tasks.test.ts` identified the four affected test files.
- `npx vitest run tests/harness.test.ts tests/knowledge-site.test.ts tests/task-detail-helpers.test.ts tests/tasks.test.ts` passed: 4 files, 35 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- `git diff --check -- electron/ipc.ts src/main/harness.ts src/main/knowledge-site.ts tests/harness.test.ts tests/knowledge-site.test.ts tests/task-detail-helpers.test.ts tests/tasks.test.ts .sharkbay/tasks/R8A4SV-u3960864-m81ae10-unify-task-artifact-review-site.md` passed.

## Notes
- Related team context searched before starting; relevant records include `T9M4QA-u3960864-m81ae10`, `RVW7K2-u3960864-m81ae10`, `H8Q4N2-u3960864-m81ae10`, `K7S4N2-u3960864-m81ae10`, `D3N7QK-u3960864-m81ae10`, `R4W8N2-u3960864-m81ae10`, and `K9V2M4-u3960864-m81ae10`.
