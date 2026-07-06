---
kind: sharkbay_task
taskId: RM2W1D-u3960864-m81ae10
taskTag: RM2W1D
mode: quick
title: Trim signing/notarization sentence from README Install
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: f7f05bd3-9836-42a8-a9b7-77e24d160917
branch: main
createdAt: 2026-07-06T08:54:23Z
updatedAt: 2026-07-06T08:57:08Z
completedAt: 2026-07-06T08:57:08Z
commits:
  - 4a90c032
---

## Summary
Per user request, remove the sentence "SharkBay is signed with a Developer ID
certificate and notarized by Apple, so it launches without Gatekeeper warnings."
from the README Install section.

## Files
- README.md

## Work
- Deleted the signing/notarization sentence added earlier in commit 5b9399f6 (task BR3WK8).

## Verification
- Confirmed README Install section now reads "macOS on Apple Silicon (arm64)." with the signing/notarization sentence removed.
- Committed 4a90c032 and pushed to origin/main (5b9399f6..4a90c032).

## Notes
- Follow-up wording tweak to the Homebrew install work (task BR3WK8).
