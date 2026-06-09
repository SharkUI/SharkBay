---
kind: sharkbay_task
taskId: X9C5V3-u3960864-m81ae10
taskTag: X9C5V3
mode: task
title: Clarify Sessions semantics
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 9e2de4aa-5299-4c79-bfb6-8a363f3ba64f
branch: fix/node-cpu-codegraph-lifecycle
dependsOn: []
createdAt: 2026-06-09T09:33:03Z
updatedAt: 2026-06-09T15:25:11Z
completedAt: 2026-06-09T15:25:11Z
---

## Summary
Design-only: clarified what "Sessions" means in SharkBay. Code review found
five "session-ish" concepts; the conclusion collapses them into three top-level
concepts — Terminals (containers), Sessions (= agent sessions), and Usage — and
establishes that the Island live-status view and the detail-tab history list are
two views of the SAME agent-session concept, not separate things. No code change.

## Files
- (none — design only; conclusions posted as a comment on issue #15)

## Work
- Audited every "session" usage. Found 5 concepts with distinct data sources:
  1. Terminal session — PTY container (terminal.ts), running/exited.
  2. Browser/editor tab — BrowserView etc. containers.
  3. Live agent status — hookStateManager.getAllStatuses(), working/approval/
     stopped/unknown, shown in the Island overlay.
  4. Historical agent session — parseHookSessions() from .sharkbay/logs/hooks.log,
     restorable, shown in the project detail "Sessions" tab.
  5. Usage history — token-usage.db (the table from Task D).
- Corrected the issue's assumption: the detail "Sessions" tab already shows
  historical, restorable agent sessions (#4) — not open terminal tabs.
- Key insight: #3 and #4 are two VIEWS of one concept (agent session), not two
  concepts. #3 is the live-status view (in-memory), #4 is the history view (log
  replay). So #3 needs no separate name.
- Naming: "Terminals" is the container concept ("Tabs" is only its UI form, not
  a semantic concept); browser/editor are sibling container types. "Sessions"
  is reserved for agent sessions. "Usage" stays as-is.
- Decision: do NOT add a new global Sessions view now; the per-project detail
  tab already is the historical agent-session list. Only its labelling/empty-
  state semantics need tightening (source = hook log, per project, restorable;
  restore does not depend on the live watcher). Those are deferred follow-ups.

## Verification
- Design review only; no code, no tests. Conclusions reviewed with the user and
  posted to issue #15.

## Notes
- Issue: https://github.com/SharkUI/SharkBay/issues/15 (problem 3).
- Aligns with R7K4M9 (rename session STATE values working/approval/stopped/
  unknown): that task named the state machine; this task names the containers/
  concepts. The two are orthogonal layers.
- Deferred follow-up tasks (out of scope here): (a) tighten the detail "Sessions"
  tab title + empty-state copy; (b) optional global historical Sessions view;
  (c) hooks.log retention/rotation policy.
- Final model: Terminals (+Browser/Editor) = containers; Sessions = agent
  sessions (live view in Island + history view in detail tab); Usage = stats.
