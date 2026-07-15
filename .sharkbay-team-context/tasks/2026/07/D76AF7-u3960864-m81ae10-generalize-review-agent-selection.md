---
kind: sharkbay_task
taskId: D76AF7-u3960864-m81ae10
taskTag: D76AF7
mode: task
title: Generalize Review agent selection
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f5a41-2f28-75b2-8f70-3a2a31cbf82d
branch: codex/agent-review-orchestration
createdAt: 2026-07-14T02:42:40Z
updatedAt: 2026-07-15T10:54:31Z
completedAt: 2026-07-15T10:54:31Z
commits:
  - 20fa3d0a
---

## Summary

Review now accepts any installed supported agent as parent or reviewer, defaults agent-started runs to the parent agent, and reports GUI-started completion to the task's precisely mapped live or restored owner Terminal. The implementation does not change hooks, MCP, or agent configuration and never guesses a parent by vendor or recency; restart/resume, Gemini review, completion, and Codex callback were verified live.

## Files

- `.sharkbay/tasks/D76AF7-u3960864-m81ae10-generalize-review-agent-selection.md`
- `.sharkbay/harness/protocol.md`
- `.sharkbay/specs/agent-review-orchestration/design.md`
- `src/shared/types.ts`
- `src/renderer/types.ts`
- `src/main/harness.ts`
- `src/main/review-runs.ts`
- `src/main/review-control-server.ts`
- `electron/ipc.ts`
- `tests/harness.test.ts`
- `tests/review-runs.test.ts`
- `tests/review-control-server.test.ts`

## Work

- Reused the completed Review orchestration from task `9NOEQ2-u3960864-m81ae10` rather than creating a parallel control path.
- Fixed scope: optional reviewer selection defaults to the authenticated parent agent; explicit selection accepts any installed supported AgentCli; parent is no longer Codex-only.
- Preserve the no-intrusion boundary: no hooks, MCP, or agent configuration changes. Recover missing Terminal identity from the caller's process ancestry so vendor shell tools do not require new bootstrap credentials.
- Implemented the generalized input contract, parent-agent fallback, installed-agent validation, control-client ancestry recovery, protocol text, design follow-up, and focused regression coverage.
- Assessed `.sharkbay/reviews/D76AF7-YRU1I4.md`: accepted the UI error-message and ancestor-read robustness findings; treated cross-vendor live coverage as an explicit verification gap rather than a code defect.
- Corrected the UI missing-agent error and made each ancestor environment read independent from parent-pid discovery, so a failed environment read can still continue along the known ancestor chain.
- Kept the existing 64-level fallback bound and did not add a non-ancestor process test: the implementation only traverses `ppid` and never enumerates or selects unrelated processes.
- Follow-up: resolve a GUI-started Review's parent Terminal from the task's native agent `sessionId` through SharkBay's existing live hook-session mapping, without guessing by agent vendor or recency.
- Implemented GUI owner resolution inside ReviewRunManager, including running-state and same-project validation; missing or stale mappings remain notification-free instead of selecting another Terminal.
- Investigating live GUI Review `D76AF7-P1OI7B`: reviewer completion and report validation succeeded, but the owner Terminal did not receive the completion prompt.
- Root cause: after application restart, a restored owner tab can retain the exact native session association while `hookSessionToTerminal` remains empty until the first new hook event; the affected run therefore started without a parent.
- Added an exact restored-tab fallback keyed by the task `sessionId` and tab `hookSessionId`, while retaining running-state and same-project validation in ReviewRunManager.
- Assessed `.sharkbay/reviews/D76AF7-P9MAEL.md`: its pass verdict is accepted; this review run itself closes the claimed live gap for restored GUI owner callback and a Gemini reviewer, while non-Codex parent timing remains residual risk.
- Preparing the verified generalized Review and restored-owner callback changes for commit.
- Committed the verified implementation as `20fa3d0a` (`feat: generalize review agents and owner callbacks`).
- Preparing to merge `codex/agent-review-orchestration` into local `main` as requested.
- Fast-forwarded local `main` from `ec21ee5e` to `20fa3d0a`, incorporating both Review orchestration commits without creating a merge commit.
- Deleted the fully merged local branch `codex/agent-review-orchestration`; the task frontmatter retains its original creation branch as required by the protocol.

## Verification

- `npx vitest run tests/review-runs.test.ts tests/review-control-server.test.ts tests/harness.test.ts` (30 tests passed).
- `npm run typecheck` passed for renderer and Node TypeScript configurations.
- `npm test` passed (60 files, 331 tests).
- `npm run build` passed.
- `git diff --check` passed; `git diff --name-only -- src/main/hooks` returned no changes.
- Searched the implementation, tests, harness, and specs for the removed vendor/parent restrictions; no stale restriction text remains.
- Review `.sharkbay/reviews/D76AF7-YRU1I4.md` passed the implementation and independently reproduced all automated verification; its accepted follow-up findings were addressed.
- Post-review: `npx vitest run tests/review-runs.test.ts tests/review-control-server.test.ts` passed (6 tests); `npm run typecheck` passed.
- Live validation remaining after this task: a non-Codex parent, especially a slower TUI, has not yet been exercised.
- Post-review: `npm test` passed (60 files, 332 tests); `npm run build`, `git diff --check`, and the hooks-boundary check passed.
- GUI callback focused verification: `npx vitest run tests/review-runs.test.ts tests/review-control-server.test.ts tests/harness.test.ts` passed (33 tests); `npm run typecheck` passed.
- GUI owner callback final verification: `npm test` passed (60 files, 335 tests); `npm run build`, `git diff --check`, and the hooks-boundary check passed.
- Live GUI owner callback `.sharkbay/reviews/D76AF7-P1OI7B.md` reproduced the missing restored-tab binding and led to the fallback fix.
- Restored-tab fallback focused verification: `npx vitest run tests/review-runs.test.ts tests/renderer-workflow.test.ts tests/ipc-channels.test.ts` passed (17 tests); `npm run typecheck` passed.
- Failure diagnosis: task/current restored agent session both resolve to `019f5a41-2f28-75b2-8f70-3a2a31cbf82d`, while parent-side status for run `review-ea50929b-3bba-411e-bfb2-a9473c6eabb7` returned `Terminal session does not own this Review run`, confirming the run started without the restored owner binding.
- Restored-tab fallback full verification: `npm test` passed (60 files, 335 tests); `npm run build`, `git diff --check`, and the hooks-boundary check passed.
- Live GUI Review `review-f1213ca7-bfbd-48b3-84ea-b0927c92eb8b` passed after packaging and restart: a restored Codex owner launched Gemini from the GUI, Gemini completed `.sharkbay/reviews/D76AF7-P9MAEL.md`, and SharkBay automatically submitted the completion prompt to the owner.
- Commit `20fa3d0a` created after all automated and live verification passed.
- Merge verification: `main` and `codex/agent-review-orchestration` resolved to `20fa3d0ac4e4c462071c852fa8badd3775a63c4a`; the worktree was clean and local `main` was initially two commits ahead. `origin/main` was subsequently observed at the same commit without a push command from this task.
- Branch cleanup verification: `git branch -d codex/agent-review-orchestration` completed successfully at `20fa3d0a`.

## Notes

- Parent implementation task and commit: `9NOEQ2-u3960864-m81ae10`, `ae73711c`.
- This task's implementation commit: `20fa3d0a`.

## Reviews

- 通过：实现与设计第22节 follow-up 吻合、改动精确、四项 Verification 全部复现(30/331/typecheck/build)、hooks 零侵入；Major 为新 agent 组合无 live 验证(通知沿用固定提交延迟)，余 4 项 Minor — `.sharkbay/reviews/D76AF7-YRU1I4.md` (2026-07-14T03:14:31Z)
- 通过：实现与设计第22/23节 follow-up 一致、改动精确、四项 Verification 独立复现(聚焦34/全量335/typecheck/build)、hooks 零侵入且 terminal.ts 未改；重点复审前评审未覆盖的第23节 GUI-owner 回报(hookSessionToTerminal 精确解析+running/同项目校验+三条降级用例)。Major：新 agent 组合与 GUI-owner 路径均无 live 验证，且完成通 知 Enter 固定30ms(ipc 从不传 submitDelayMs)与 CodeWhale bootstrap 250ms 不一致，慢 TUI 父可能过早提交；可 经 status fallback 恢复故非 Blocker — `.sharkbay/reviews/D76AF7-P1OI7B.md` (2026-07-14T03:48:58Z)
- 通过：实现与设计第 22/23 节 follow-up 完美一致，成功修复应用重启后 GUI-owner 关联失效 Bug（新增 restored-tab fallback 且带同项目与 running 状态检验）。四项验证完全复现（34/335/typecheck/build），hooks 零侵入。主要缺口（Major）依然在于新 Agent 组合及 GUI-owner 路径暂无实机真机端到端验证，且 30ms 自动提交通知时延对慢 TUI 存在潜在时序风险。 — `.sharkbay/reviews/D76AF7-P9MAEL.md` (2026-07-15T04:15:51Z)
