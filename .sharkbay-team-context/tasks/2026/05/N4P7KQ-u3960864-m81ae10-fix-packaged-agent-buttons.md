---
kind: sharkbay_task
taskId: N4P7KQ-u3960864-m81ae10
taskTag: N4P7KQ
mode: quick
title: Fix packaged agent buttons
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
createdAt: 2026-05-19T11:19:21Z
updatedAt: 2026-05-19T11:24:45Z
completedAt: 2026-05-19T11:24:45Z
---

## Summary
Fixed agent CLI shortcut detection so packaged macOS builds and dev sessions refresh local CLI availability instead of trusting stale partial MachineProfile cache data.

## Files
- .sharkbay/tasks/N4P7KQ-u3960864-m81ae10-fix-packaged-agent-buttons.md
- src/core/core-service.ts
- src/main/agent-clis.ts
- src/providers/local/local-provider.ts
- src/plugins/bundled/agent-detector.ts
- tests/core-agent-list.test.ts
- tests/local-provider.test.ts

## Work
- Started investigation from the missing terminal agent shortcut buttons after packaging.
- Related context: `H6V2K9-u3960864-m81ae10` added the shared command path resolver, and `R7W4M2-u3960864-m81ae10` fixed sparse PATH fallback directories for OpenCode.
- Identified that the new MachineProfile agent detector path bypasses the shared fallback resolver.
- Confirmed local commands exist for `claude`, `kiro-cli`, and `opencode`, but the current cached MachineProfile marks them unavailable.
- Routed local machine probe `which` through the shared command path resolver and made local agent listing refresh the MachineProfile before rendering buttons.
- Changed agent version probing to execute the resolved path so found CLIs work even when their directory is not in the app process PATH.
- Verified the compiled core now lists codex, claude, gemini, kiro, deepseek, and opencode on this machine.

## Verification
- `npm test -- tests/core-agent-list.test.ts tests/local-provider.test.ts tests/agent-clis.test.ts tests/agent-detector.test.ts`
- `npm run typecheck`
- `npm run build`
- Compiled core smoke check returned `codex`, `claude`, `gemini`, `kiro`, `deepseek`, and `opencode`.
- `npm run pack`
- `git diff --check`

## Notes
- The suspected failure mode is Finder-launched macOS app PATH sparsity causing `command -v` to miss globally installed agent CLIs.
