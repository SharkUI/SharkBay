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
updatedAt: 2026-06-19T15:51:35Z
completedAt: 2026-06-19T15:51:35Z
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
- .sharkbay/artifacts/H8Q4N2-NB513R.html
- .sharkbay/artifacts/N5S8QA-INDEX0.html
- .sharkbay/artifacts/R2X6Q4-PEB1XU.html
- .sharkbay/artifacts/R5V2K5-GJX6AN.html
- .sharkbay/reviews/RVW7K2-000001.md
- .sharkbay/tasks/T9M4QA-u3960864-m81ae10-generate-task-artifact-example.md
- .sharkbay/tasks/R5V2K5-u3960864-m81ae10-release-v025.md
- .sharkbay/tasks/SHR4K2-u3960864-m81ae10-task-share-artifact-session.md

## Work
- Started task after clarifying that `.sharkbay/site/` is generated output and should not be the persistent source directory for user/agent artifacts.
- Planned storage alignment: use `.sharkbay/artifacts/<taskTag>-<code>.html` and `.sharkbay/reviews/<taskTag>-<code>.md`, with Knowledge Site reading task records to index them.
- Changed artifact prompt fallback and reserved paths from `.sharkbay/site/artifacts/<taskTag>/<code>.html` to `.sharkbay/artifacts/<taskTag>-<code>.html`.
- Kept the artifact opener compatible with old `.sharkbay/site/artifacts/` files while allowing the new `.sharkbay/artifacts/` source directory.
- Reworked Knowledge Site task discovery to use merged task records from `scanTasks`, so locally appended Artifacts/Reviews are visible even when a team-context task copy wins.
- Added generated Tasks sub-pages for Artifacts and Reviews; artifact rows link to persistent HTML files, while review Markdown files render into generated review pages under `.sharkbay/site/tasks/reviews/`.
- Updated tests for the new artifact path convention and Knowledge Site artifact/review navigation.
- Reopened to migrate existing local `.sharkbay` artifact/review files and local task references to the new naming convention.
- Moved existing artifact files from `.sharkbay/site/artifacts/<taskTag>/<name>.html` into `.sharkbay/artifacts/<taskTag>-<code>.html`.
- Renamed the remaining old review report file from `.sharkbay/reviews/RVW7K2-u3960864-m81ae10-001.md` to `.sharkbay/reviews/RVW7K2-000001.md`.
- Updated local task records that pointed at migrated artifact files or described the old artifact directory convention.

## Verification
- `codegraph affected src/main/harness.ts electron/ipc.ts src/main/knowledge-site.ts tests/harness.test.ts tests/knowledge-site.test.ts tests/task-detail-helpers.test.ts tests/tasks.test.ts` identified the four affected test files.
- `npx vitest run tests/harness.test.ts tests/knowledge-site.test.ts tests/task-detail-helpers.test.ts tests/tasks.test.ts` passed: 4 files, 35 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- `git diff --check -- electron/ipc.ts src/main/harness.ts src/main/knowledge-site.ts tests/harness.test.ts tests/knowledge-site.test.ts tests/task-detail-helpers.test.ts tests/tasks.test.ts .sharkbay/tasks/R8A4SV-u3960864-m81ae10-unify-task-artifact-review-site.md` passed.
- `find .sharkbay/site -path '.sharkbay/site/artifacts*' -print` returned no paths after migration.
- Artifact and review filename checks confirmed every file directly under `.sharkbay/artifacts/` and `.sharkbay/reviews/` matches the `<taskTag>-<6 chars>.<ext>` convention.
- `rg -n "\\.sharkbay/site/artifacts|RVW7K2-u3960864-m81ae10-001" .sharkbay/tasks || true` now returns only this task's historical "changed from old to new" notes.

## Notes
- Related team context searched before starting; relevant records include `T9M4QA-u3960864-m81ae10`, `RVW7K2-u3960864-m81ae10`, `H8Q4N2-u3960864-m81ae10`, `K7S4N2-u3960864-m81ae10`, `D3N7QK-u3960864-m81ae10`, `R4W8N2-u3960864-m81ae10`, and `K9V2M4-u3960864-m81ae10`.
- `T9M4QA` referenced a Chinese artifact path, but `.sharkbay/site/artifacts/N5S8QA/index.zh.html` was not present locally at migration time; the local task text was updated to the new convention, but no missing artifact was fabricated.
- Generated Knowledge Site task pages may still render old artifact paths from read-only `.sharkbay/team-context/` historical records; team-context remains intentionally untouched.

## Artifacts
- `.sharkbay/artifacts/R8A4SV-KV3KUB.html` — Showcase of the completed artifact/review storage and Knowledge Site navigation deliverable (2026-06-19T15:37:16Z)

## Reviews
- 通过 — 实现与记录一致,验证已独立复现(35 测试/typecheck/build 全绿),仅少量次要项 — `.sharkbay/reviews/R8A4SV-1H8142.md` (2026-06-19T15:36:27Z)
