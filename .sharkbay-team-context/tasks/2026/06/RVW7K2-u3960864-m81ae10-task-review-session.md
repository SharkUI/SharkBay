---
kind: sharkbay_task
taskId: RVW7K2-u3960864-m81ae10
taskTag: RVW7K2
mode: task
title: Task Review / Review with... read-only review session
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 764e1d75-741e-4cf5-bbbc-ecc1d2453f15
branch: main
createdAt: 2026-06-18T05:21:18Z
updatedAt: 2026-06-18T08:25:06Z
completedAt: 2026-06-18T08:25:06Z
commits:
  - a0e1c847
---

## Summary
Right-clicking a task offers "Review" (same agent as the task) and "Review with..." (pick another installed agent). Either launches a new, strictly read-only agent session with an injected review prompt that replaces the standard SharkBay bootstrap prompt.

## Files
- .sharkbay/tasks/RVW7K2-u3960864-m81ae10-task-review-session.md
- src/shared/types.ts
- src/renderer/types.ts
- src/main/harness.ts
- src/main/terminal.ts
- src/renderer/App.tsx
- src/styles/app.css
- tests/harness.test.ts

## Work
- Design confirmed with user: review prompt REPLACES bootstrap (they conflict — bootstrap tells agents to create tasks/commit). Read-only is prompt-enforced only. "Review" disabled when the task's inferred agent is not installed (rare). Status-derived focus (plan/spec, code, completion).
- shared/types.ts + renderer/types.ts: added optional `review:{taskId,status,sourcePath?,agentLabel?}` to TerminalCreateInput.
- harness.ts: added `ReviewPromptInput`, `reviewPrompt()` (status-specific focus via `reviewFocusLine()`, reuses CodeGraph line + locale suffix); `prepareAgentLaunch` now takes an optional `reviewPrompt` override that replaces the bootstrap prompt while reusing the same per-agent injection machinery.
- terminal.ts: when `input.review` is present, builds the review prompt and passes it as the override.
- core-service.ts: unchanged — already spreads `...input`, so `review` flows through.
- App.tsx: added module-level `buildAgentLaunchCommand` (refactored `openAgentProjectTab` to use it); `TerminalPaneHandle.openReviewSession` builds the launch command and passes the review payload; `createTerminal`/`openProjectTab` Picks gained `review`; `ProjectDetailPane`/`TasksDetailTab` gained `onReviewTask`; task card `onContextMenu` opens a Review menu (Review default-agent item, disabled when that agent is not installed, + expandable "Review with..." listing installed agents).
- app.css: added `.project-context-menu-item:disabled` and `.project-context-menu-subitem`.
- tests: harness.test.ts gains 3 cases (status-specific review prompt content, review override replaces bootstrap, core-service passes review payload through). terminal.ts review wiring is thin glue over a pty spawn (not unit-testable in isolation); the core logic it relies on is covered at the harness/core-service level.

## Adjustments (round 2, user feedback)
- (1) Review prompt no longer references `.sharkbay/harness/protocol.md` or `AGENTS.md` and drops the "Task Protocol mode" framing, so a review session is not pulled into being a harness/protocol task. It still describes the environment factually (task records under `.sharkbay/tasks/`, team records read-only).
- (2) Context menu: "Review" item is now plain text (no agent name in parens). "Review with…" now opens a real OS-style flyout submenu to the right (hover/click), instead of expanding inline. New CSS: `.project-context-submenu-anchor/-caret/.project-context-submenu`; removed the now-unused `.project-context-menu-subitem`.
- (3) The review now writes its report to `.sharkbay/reviews/{taskId}-{uuid}.md`. The renderer generates the uuid/path (`globalThis.crypto.randomUUID()`), passes it via `review.reviewPath`; the prompt instructs the reviewer that this is the ONLY file it may write (create the dir if needed) and to report the path when done. `reviewPath` added to the `review` payload type and `ReviewPromptInput`. `.sharkbay/` is already git-excluded so reviews stay local for viewing/forwarding. No launch toast (per user) — the path reaches the user via the injected prompt / the reviewer reporting it.

## Adjustments (round 3, self-review follow-up)
- A real review session of this task flagged that `prepareAgentLaunch` skips injection when `.sharkbay/harness/protocol.md` is absent (`isHarnessInstalled` gate), so a Review launched in a project without the protocol would start a plain, unconstrained agent with no review prompt and no error.
- User decision: do NOT relax the injection gate. Rationale: without protocol installed the SharkBay task feature is incomplete, so the task context menu should not appear at all in that case.
- Fix: gate the task card `onContextMenu` on `status?.installed` (which equals `harnessInstalled`/`isHarnessInstalled` per electron/ipc.ts) — when the protocol is not installed, right-clicking a task no longer opens the Review menu, so the silent-degradation path is unreachable from the UI. Single-line renderer guard; injection logic unchanged.

## Adjustments (round 4, user feedback)
- Review report filenames shortened from `{taskId}-{uuid}.md` to sequential `{taskId}-001.md`, `{taskId}-002.md`, incrementing per launch.
- Path allocation moved from the renderer (uuid) to the main process: new `reserveReviewPath(repoPath, taskId)` in harness.ts scans `.sharkbay/reviews/` for existing `{taskId}-NNN.md`, returns max+1 (zero-padded to 3 digits), creates `.sharkbay/reviews/` and reserves the path with an empty file (avoids same-number collisions on rapid launches and guarantees the dir exists). terminal.ts computes the path on review launch and feeds it into `reviewPrompt`. Renderer `launchReview` no longer sets `reviewPath`.
- Test: harness.test.ts gains a `reserveReviewPath` case (sequential -001/-002, files created, per-task independent numbering). Suite now 197.

## Adjustments (round 5, user feedback + self-review M1/m1)
- A review of the round-4 output flagged a TOCTOU race in the sequential `{taskId}-NNN.md` allocation (two rapid launches could read the same max and return the same path).
- User decision: drop sequential numbering; use the task tag (first taskId segment) + a short random code, e.g. `RVW7K2-N3T2AC.md`. Reviews are local-only so the tag alone is unique enough across this user/machine.
- `reserveReviewPath` now generates a 6-char `[A-Z0-9]` code and creates the file atomically with `wx`, retrying with a fresh code on the (negligible) collision — this also removes the race. Dropped the directory scan (`readdir` import removed).
- Also removed the now-redundant `reviewPath` from `TerminalCreateInput.review` (renderer never set it; main fills it) — kept on `ReviewPromptInput` only.
- Updated the path test to assert the `RVW7K2-XXXXXX.md` shape and uniqueness.

## Verification
- `npm run typecheck` — passes.
- `npm test` — 197/197 across 45 files (harness.test.ts 20).
- `npm run build` — succeeds.
- Committed and pushed to origin/main as a0e1c847 (7 files: harness.ts, terminal.ts, App.tsx, renderer/types.ts, shared/types.ts, app.css, harness.test.ts). The task/review files under `.sharkbay/` are git-excluded and not part of the commit.

## Notes
- Related prior tasks: Q8M2L6 (bootstrap agent prompts), V7N3L8 (bootstrap locale suffix), K4H7T2 (require protocol for bootstrap), B4N2KP (bootstrap reads AGENTS.md), W3K8F2 (project context menu pattern).
- core-service.createTerminal already spreads `...input`, so the `review` field passes through without changes there.
- Review prompt reuses agentBootstrapArgs injection (positional for codex/claude/kiro/cursor, `-i` for gemini/qwen, delayed-write for codewhale/opencode) and the locale suffix.
