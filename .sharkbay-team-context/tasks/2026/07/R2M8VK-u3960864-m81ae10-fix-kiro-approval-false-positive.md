---
kind: sharkbay_task
taskId: R2M8VK-u3960864-m81ae10
taskTag: R2M8VK
mode: task
title: Fix false-positive Kiro approval detection
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: 76040e16-8786-4b0e-b4a0-cc7f401b158b
branch: main
createdAt: 2026-07-05T08:33:06Z
updatedAt: 2026-07-05T09:20:16Z
completedAt: 2026-07-05T09:20:16Z
---

## Summary
Tighten the Kiro terminal approval-prompt signature so incidental terminal text
containing "ESC to close" no longer triggers a synthetic approval state.

## Files
- src/main/hooks/terminal-approval-detector.ts
- tests/terminal-approval-detector.test.ts

## Work
- Root cause (evidence in .sharkbay/logs/hooks.log): detector matched the bare
  substring "ESC to close" anywhere in a 256-char window and injected a
  `kiro:synthetic` attention event → approval. Any output that merely mentions
  the string (grep patterns, prose, source reading) trips it. Wiring lives in
  electron/ipc.ts (track/feed/setCallback→injectEvent).
- First attempt (insufficient): tightened the signature to `ESC to close | Enter`.
  User repackaged/restarted and opening the Kiro tab still showed approval,
  because session resume/replay reprints history that legitimately contains the
  full footer (our own discussion of it), and that flows through terminalData →
  feed().
- Real fix: a live approval prompt blocks waiting for a keypress, so its footer
  is the LAST rendered line and no more output follows. Detector now (a) debounces
  evaluation until output is silent for SETTLE_MS (400ms), and (b) only fires when
  the footer is the last non-empty line of the settled tail. Replayed history and
  incidental mentions settle on the live input prompt as the last line, so they no
  longer fire.

## Files
- src/main/hooks/terminal-approval-detector.ts
- tests/terminal-approval-detector.test.ts

## Verification
- npm test: 308/308 passed (56 files); detector suite 10/10 including new
  "does not fire when the footer is only in replayed scrollback (regression)"
  and "does not fire on incidental mentions".
- npm run typecheck: passed.
- npm run build: passed.
- Note: main-process change; the running dev/packaged app must be restarted to
  load it. A currently-stuck red badge clears on the next hook event, the 5-min
  timeout, or clicking/typing to acknowledge.

## Notes
- Residual limitation is inherent to output scanning: if a real live prompt were
  ever NOT the last line, or if genuine output settled with the footer as the last
  line for a non-approval reason, detection could differ. Distinguishing further
  would require the actual TUI/prompt protocol, which Kiro does not expose.
- "Last non-empty line contains the footer" (not whole-line equality) is used so
  box-drawing borders and trailing text like "to see more options" still match.
