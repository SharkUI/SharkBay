---
kind: sharkbay_task
taskId: Q4M7K2-u0-m666b54
taskTag: Q4M7K2
mode: task
title: Review GitHub PRs 19 through 22
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 666b54
agent: Codex GPT-6
sessionId: 01a21155-b110-7cf0-8fe8-e3226c74a53b
branch: main
createdAt: 2026-11-25T07:08:37Z
updatedAt: 2026-11-25T07:30:52Z
completedAt: 2026-11-25T07:18:24Z
---

## Summary
Recommend merging #21, fixing #22 and #20 before merging, and replacing #19 with a targeted patch if needed. No PRs were merged or updated.

## Files
- No source edits planned.

## Work
- Started read-only merge assessment for four open PRs.

- #19 conflicts with the current Island status and throttled animation implementation.
- #20 conflicts in both socket files and keeps protocol v1 despite expanding the response from 4 MiB to 32 MiB, so old desktop clients may still disconnect with a new Runtime.
- #21 is a standalone CSS fix. #22 works in the normal two-client flow, but a disconnected controller click hides its live terminal through reconnect.

## Verification
- Fetched PR heads and confirmed current GitHub main at fc1c6e0. GitHub reported #19/#20 conflicting and #21/#22 mergeable. No check results were listed. Local git merge-tree agreed.
- #21 on current main passed a Chromium tall-observer assertion and Electron/WebUI shared Runtime flow. The background element filled 1070 px versus 684 px without the rule.
- #21 and #22 on current main passed npm run typecheck and npm run verify:shared. A second Chromium run reproduced #22 hiding the controller tab after an induced WebSocket disconnect while the same PTY remained alive after reconnect.
- #19 and #20 reviewed statically and not executed due to unresolved branch conflicts. Repository working tree remains clean.

## Notes
- Related observer colors task C8R4N7-u3960864-m81ae10.
