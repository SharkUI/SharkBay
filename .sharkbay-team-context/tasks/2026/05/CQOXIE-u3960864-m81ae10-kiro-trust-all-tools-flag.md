---
kind: sharkbay_task
taskId: CQOXIE-u3960864-m81ae10
taskTag: CQOXIE
mode: quick
title: Add --trust-all-tools launch option for Kiro CLI
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: ab0be1f2-d7ab-4689-a71a-6e309e12cff5
branch: main
createdAt: 2026-05-28T08:00:57Z
updatedAt: 2026-05-28T08:15:34Z
completedAt: 2026-05-28T08:15:34Z
commits:
  - 8d831ad6
---

## Summary

Add `--trust-all-tools` as a toggleable launch option for Kiro CLI in the Agent CLIs settings panel, matching the pattern used by Codex/Claude/Gemini/DeepSeek.

## Files

- src/renderer/App.tsx
- src/main/harness.ts
- src/shared/agent-session-restore.ts
- tests/harness.test.ts

## Work

- Added `--trust-all-tools` toggle to `agentLaunchOptions.kiro` in App.tsx
- Fixed flag placement: kiro flags must come after `chat` subcommand, not before
- Renderer now builds `kiro-cli chat <flags>` instead of `kiro-cli <flags>`
- Removed `"chat"` from `agentBootstrapArgs` in harness.ts (now in initial command)
- Fixed `restoreCommand` in agent-session-restore.ts to place flags after `chat`
- Updated harness test expectation to match new command structure

## Verification

- `npm run typecheck` passed
- `tests/harness.test.ts` bootstrap test passed
- `tests/agent-session-restore.test.ts` all 4 tests passed
- 2 pre-existing session-id test failures unrelated to this change (environment leak)

## Notes

- `--trust-all-tools` is a `kiro-cli chat` subcommand flag, not a top-level flag
- The renderer now includes `chat` in the base command for kiro so user-selected flags are positioned correctly
- Flags are persisted in localStorage under `sharkbay:agent-launch-flags:kiro`
