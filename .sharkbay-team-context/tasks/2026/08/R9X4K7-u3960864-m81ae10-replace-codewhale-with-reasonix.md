---
kind: sharkbay_task
taskId: R9X4K7-u3960864-m81ae10
taskTag: R9X4K7
mode: task
title: Replace CodeWhale with Reasonix
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.6
sessionId: 01a01de3-9a94-7851-8987-56a12a3b7352
branch: codex/replace-codewhale-with-reasonix
createdAt: 2026-08-20T06:51:02Z
updatedAt: 2026-08-20T07:05:01Z
completedAt: 2026-08-20T07:05:01Z
---

## Summary

Hard-replaced SharkBay's CodeWhale integration with Reasonix across CLI detection and installation, product UI, launch/bootstrap behavior, hooks, session restore, documentation, and tests. Active code and current documentation contain no CodeWhale/DeepSeek compatibility paths; only immutable historical release notes remain in `CHANGELOG.md`.

## Files

- README.md
- electron/ipc.ts
- src/core/core-service.ts
- src/main/agent-clis.ts
- src/main/harness.ts
- src/main/hooks/bridge.ts
- src/main/hooks/connectors/codewhale.ts
- src/main/hooks/connectors/reasonix.ts
- src/main/terminal.ts
- src/plugins/bundled/agent-detector.ts
- src/renderer/App.tsx
- src/shared/agent-session-restore.ts
- tests/agent-session-restore.test.ts
- tests/codewhale-hooks.test.ts
- tests/reasonix-hooks.test.ts
- tests/harness.test.ts
- tests/install-tool.test.ts
- tests/review-runs.test.ts
- tests/terminal-bootstrap.test.ts
- .gitignore
- .deepseek/instructions.md (untracked legacy residue removed)
- docs/execution-target-profiles.md
- docs/tasks.md

## Work

- User explicitly chose a hard replacement: remove all CodeWhale code, documentation, icons, tests, historical compatibility, and hook cleanup behavior.
- Reviewed prior Reasonix work `R7X2K1-u3960864-m81ae10` and the later support-surface task `AC6R2M-u3960864-m81ae10`; the prior implementation was never committed and its CLI assumptions require updating for current Reasonix.
- Research confirmed Reasonix uses stdin JSON hooks in `<Reasonix home>/settings.json`, supports `--yolo`, and requires post-launch prompt injection for an interactive TUI.
- Replaced CLI detection, labels, launch options, official product icons, Review selection, and active documentation with Reasonix equivalents.
- Added a native Reasonix hook connector that preserves user hooks, maps lifecycle/tool/attention events, and receives a SharkBay launch-scoped session id from the shared hook bridge.
- Added Reasonix bootstrap and restore handling: prompt injection waits for the TUI, new launches export `SHARKBAY_SESSION_ID`, and restore opens Reasonix's native `--resume` picker.
- Removed the CodeWhale connector, env-based bridge script, audit-log session lookup, tests, `.deepseek/` ignore rule, and the previously ignored local `.deepseek/instructions.md` residue.

## Verification

- Targeted tests: `npx vitest run tests/reasonix-hooks.test.ts tests/harness.test.ts tests/terminal-bootstrap.test.ts tests/agent-session-restore.test.ts tests/install-tool.test.ts tests/review-runs.test.ts` (58 passed).
- TypeScript: `npm run typecheck` (passed).
- Full suite: `npm test` (60 files, 343 tests passed).
- Production build: `npm run build` (passed).
- Whitespace: `git diff --check` (passed).
- CodeGraph residual audit: `codegraph query CodeWhale --limit 100` (no results).
- Active-tree residual audit: `rg -i 'codewhale|deepseek'` excluding `.sharkbay/`, dependencies, build output, and historical `CHANGELOG.md` (no matches); filename scan also returned no matches.

## Notes

- Task was created on `main` before switching branches, as required by the SharkBay protocol.
- Implementation branch: `codex/replace-codewhale-with-reasonix`.
- Current local Reasonix is v1.17.9; do not upgrade global tooling without separate authorization.
- The implementation remains uncommitted on the feature branch; only the user's pre-existing changes were committed as explicitly requested.
