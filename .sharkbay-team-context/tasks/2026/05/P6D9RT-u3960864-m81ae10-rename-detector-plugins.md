---
kind: sharkbay_task
taskId: P6D9RT-u3960864-m81ae10
taskTag: P6D9RT
mode: quick
title: Rename detector plugins
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e633b-10c4-7561-a52f-e660da21a851
branch: main
createdAt: 2026-05-26T11:29:05Z
updatedAt: 2026-05-26T11:29:38Z
completedAt: 2026-05-26T11:29:38Z
---

## Summary
Renamed bundled detector plugin display names so Settings communicates detection behavior rather than broad language support.

## Files
- .sharkbay/tasks/P6D9RT-u3960864-m81ae10-rename-detector-plugins.md
- src/plugins/bundled/core-detectors.ts
- src/plugins/bundled/node-detector.ts
- src/plugins/bundled/python-detector.ts
- src/plugins/bundled/go-detector.ts
- src/plugins/bundled/rust-detector.ts
- src/plugins/bundled/java-detector.ts

## Work
- Searched team task context for related Settings and Extensions work before editing.
- Changed the Core display name to environment detection and language display names to project detection.
- Left button labels unchanged because future extensions may not be detection-only.

## Verification
- `rg -n "name: \".*(Support|Detectors|Detection)\"" src/plugins/bundled`
- `npm run typecheck`
- `git diff --check`

## Notes
- No commit was produced.
