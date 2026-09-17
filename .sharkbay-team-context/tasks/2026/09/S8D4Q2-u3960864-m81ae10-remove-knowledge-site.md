---
kind: sharkbay_task
taskId: S8D4Q2-u3960864-m81ae10
taskTag: S8D4Q2
mode: task
title: Remove Knowledge Site feature
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a0ae8b-74cf-7132-97b0-3651af9b8f75
branch: main
createdAt: 2026-09-17T09:05:07Z
updatedAt: 2026-09-17T09:09:52Z
completedAt: 2026-09-17T09:09:52Z
---

## Summary
Removed Knowledge Site UI, static generation, automatic post-sync generation, IPC/bridge/types, exclusive marked dependency, and Site-specific tests/documentation. Artifact, Review, sharing, browser behavior, task management, team synchronization, existing Site output, and legacy Artifact path support remain intact.

## Files
- src/renderer/App.tsx
- src/main/knowledge-site.ts (delete)
- src/main/teamwork-sync.ts
- electron/ipc.ts
- electron/preload.mts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/renderer/types.ts
- package.json
- package-lock.json
- tests/knowledge-site.test.ts (delete)
- tests/ipc-channels.test.ts
- README.md
- docs/tasks.md
- .sharkbay/tasks/S8D4Q2-u3960864-m81ae10-remove-knowledge-site.md
- dist-electron/src/main/knowledge-site.{js,js.map,d.ts,d.ts.map} (remove stale ignored build output)
- dist-electron/tests/knowledge-site.test.{js,js.map,d.ts,d.ts.map} (remove stale ignored build output)

## Work
- Confirmed scope with the user: remove Site UI, generator, post-sync generation, IPC/bridge/types, exclusive marked dependency, Site tests, and current documentation references.
- Searched team context and inspected the implementation with CodeGraph before targeted searches. Relevant prior records: K7S4N2-u3960864-m81ae10, R8A4SV-u3960864-m81ae10, V8T2QK-u3960864-m81ae10, and 3YGNE7-u3960864-m81ae10.
- Initial Git worktree is clean on main. Current browser defaults already use the service URL or about:blank and need no change.
- Plan: remove Site-only code and dependency; inspect the diff and preserved boundaries; run typecheck, build, and relevant regression tests.
- Removed the Site card/open action/busy state, generator, automatic post-sync generation, two IPC channels, preload bridge, and Site-only types.
- Removed the sole marked dependency and its standalone lockfile entry; removed Site generation tests and their IPC channel expectations; updated README and the harness-update prompt location description.
- Reviewed the full non-generated diff: exactly the 14 planned project files changed. Shared Artifact/Review/browser/sharing behavior, historical records, and existing generated site files are preserved.
- TypeScript build retains compiled files for deleted sources; cleaning only the eight stale Site generator/test build outputs so they cannot be included by a later package build.
- Removed all eight stale ignored Site build outputs; completed the scoped removal without a commit or replacing the installed app.

## Verification
- CodeGraph affected-file lookup returned no test mappings; selected regression suites explicitly for IPC, renderer workflow, browser, harness, task/artifact/review helpers, review orchestration, and team sync.
- git diff --check passed after implementation.
- Recorded content digests before changes for existing site output (50 files), artifacts (8), reviews (17), and team context (303) for preservation verification.
- npm run typecheck passed.
- npm test -- tests/ipc-channels.test.ts tests/ipc-protocol-install.test.ts tests/renderer-workflow.test.ts tests/browser-tabs.test.ts tests/harness.test.ts tests/task-detail-helpers.test.ts tests/tasks.test.ts tests/review-runs.test.ts tests/review-control-server.test.ts tests/teamwork-sync.test.ts tests/build-config.test.ts passed: 11 files, 71 tests.
- npm run build passed.
- Source search found no remaining Knowledge Site implementation/API/UI references. Remaining .sharkbay/site references are the intentionally retained legacy Artifact path and file:// URL test.
- Dependency/lockfile assertions passed: root dependencies match, and marked is absent from both the manifest and lockfile package entries.
- Artifacts, reviews, and read-only team context match their pre-change content digests. The initial full preservation assertion failed for existing Site output: all 50 files remain, but the already-running installed app regenerated pages at 17:07:53 local time and included this new task. Tests use temporary repositories; this task did not invoke the generator or remove Site output.
- Final diff boundary assertion passed: exactly the 14 approved tracked files changed. AST comparisons confirm openBrowserProjectTab, BrowserSurface, and tryHandleArtifactMessage are unchanged. Sharing, harness, task scanning, browser engine, task helpers, and historical CHANGELOG have no diff.
- After cleanup, compiled output search found no remaining Knowledge Site implementation/API/UI references; git diff --check passed. The installed app was not relaunched or visually revalidated against these source changes.

## Notes
- Keep .sharkbay/team-context/ read-only. Do not delete existing .sharkbay/site/ output or source docs, tasks, artifacts, or reviews.
- Preserve file:// browser support and legacy .sharkbay/site/artifacts/ compatibility.
- Preserve historical CHANGELOG and task records. No commit requested.
- The running installed SharkBay version still has its old Site generator. Source/build changes do not replace the installed app; its background regeneration may continue until an updated app is run.
