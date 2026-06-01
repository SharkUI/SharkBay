---
kind: sharkbay_task
taskId: D1GSIG-u3960864-m81ae10
taskTag: D1GSIG
mode: task
title: Investigate Kiro attention status not working
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: db6b1e83-ad53-4786-9603-0212c4a63361
branch: main
createdAt: 2026-06-01T04:07:03Z
updatedAt: 2026-06-01T04:07:03Z
completedAt: 2026-06-01T04:07:03Z
---

## Summary

Kiro connector hooks produce working/idle states correctly but never trigger
attention status. Root cause: Kiro CLI does not emit a hook event when waiting
for user tool approval. Filed upstream issue to request this.

## Files

(no project files changed — investigation only)

## Work

- Traced the attention state flow: `eventToState` in state-manager.ts maps the
  `"attention"` event kind to the attention state. Claude Code fires
  `PermissionRequest`/`Notification(permission_prompt)`, Gemini fires
  `Notification(ToolPermission)` — both produce `"attention"`.
- KiroConnector's EVENT_MAP only maps 5 events: `agentSpawn`, `userPromptSubmit`,
  `preToolUse`, `postToolUse`, `stop`. None resolves to `"attention"`.
- Confirmed from hook logs: a 381-second gap between `preToolUse(shell)` and
  `postToolUse(shell)` (03:09–03:15 UTC) — user was clearly being prompted for
  approval, but no event fired during that wait.
- Inspected Kiro CLI binary (based on amazon-q-developer-cli). It has approval
  prompts internally but no hook event for the waiting state.
- Filed upstream: https://github.com/aws/amazon-q-developer-cli/issues/3823

## Verification

- Hook log analysis confirmed no attention-type event exists in Kiro's protocol.
- Binary string analysis of Kiro CLI confirmed no undiscovered hook event name.

## Notes

- When upstream adds the event (e.g. `toolApproval` or `permissionPrompt`), the
  fix is minimal: add the mapping in `src/main/hooks/connectors/kiro.ts` EVENT_MAP,
  add `"attention"` to `supportedEvents`, and register the new hook name in
  `HOOK_EVENTS` + `install()`.
- A timeout-based heuristic (preToolUse without postToolUse for >10s → attention)
  was considered but rejected due to false positive risk on slow shell commands.
- Upstream issue: aws/amazon-q-developer-cli#3823
