---
kind: sharkbay_task
taskId: L8Q4Z2-u3960864-m81ae10
taskTag: L8Q4Z2
mode: task
title: Speed up Agent CLIs settings
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e723c-7935-77f2-a1fa-1b2e2e5a0166
branch: main
createdAt: 2026-05-29T10:52:49Z
updatedAt: 2026-05-29T10:57:11Z
completedAt: 2026-05-29T10:57:11Z
---

## Summary
Settings > Agent CLIs now loads from agent detection plugins directly instead of forcing a full machine profile refresh. The built-in agent list skips version probes and command path resolution deduplicates concurrent shell PATH reads.

## Files
- src/core/core-service.ts
- src/main/command-path.ts
- src/plugins/bundled/agent-detector.ts
- tests/core-agent-list.test.ts

## Work
- Investigated the current Agent CLIs settings path and confirmed it calls full machine profile refresh.
- Planned a lightweight agent-list path that runs only agent detection instead of all machine detectors.
- Changed `listAgentClis` to run only enabled `agent:detect` plugins, with a fast built-in path that skips version reads.
- Added in-flight shell PATH request dedupe so concurrent command resolution does not spawn duplicate login shell probes.
- Updated core agent-list tests to cover the agent detection plugin path.
- Related context: `K7W3N9-u3960864-m81ae10`, `N4P7KQ-u3960864-m81ae10`, `M8T4Q6-u3960864-m81ae10`.

## Verification
- `./node_modules/.bin/vitest run tests/agent-detector.test.ts tests/core-agent-list.test.ts tests/agent-clis.test.ts` — 3 files, 8 tests passed.
- `./node_modules/.bin/tsc -p tsconfig.node.json --noEmit` — passed.
- `./node_modules/.bin/tsc -p tsconfig.renderer.json --noEmit` — passed.
- `./node_modules/.bin/vitest run` — 36 files, 135 tests passed.
- Source-path measurement of `core.listAgentClis()` returned 7 agents in about 497 ms, compared with the prior measured full-profile path at about 1.7 s.

## Notes
- Initial timing of current `listAgentClis` from `dist-electron` was about 1.7s, with non-agent machine detectors contributing most of the delay.
