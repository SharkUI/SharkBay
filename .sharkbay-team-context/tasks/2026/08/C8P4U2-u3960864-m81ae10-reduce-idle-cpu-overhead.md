---
kind: sharkbay_task
taskId: C8P4U2-u3960864-m81ae10
taskTag: C8P4U2
mode: task
title: Reduce persistent SharkBay CPU and GPU overhead
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.6
sessionId: 01a01005-13c0-7760-9cc3-09dbd93f77cb
branch: main
createdAt: 2026-08-18T10:49:13Z
updatedAt: 2026-08-20T06:50:42Z
completedAt: 2026-08-18T10:59:00Z
commits:
  - 4d8322a8f85ccae410d1a7be56656bd17944d448
---

## Summary
Reduced persistent SharkBay CPU/GPU overhead across Island rendering, project refresh, terminal cwd polling, and teamwork sync. The Island now renders at a measured 12 FPS while retaining time-based movement speed and stopping entirely when not visible.

## Files
- src/island/island.html
- src/renderer/App.tsx
- src/main/terminal.ts
- src/main/teamwork-sync.ts
- electron/ipc.ts
- tests/terminal.test.ts
- tests/teamwork-sync.test.ts
- .sharkbay/tasks/C8P4U2-u3960864-m81ae10-reduce-idle-cpu-overhead.md

## Work
- Diagnosed four overlapping hotspots: unconditional Island animation, five-second full project rescans, per-terminal cwd polling, and retained/overlapping Teamwork Sync instances.
- Preserve Island motion speed while limiting rendering to 12 FPS and pausing work when the animated mark is not visible.
- Related prior tasks: 2YRAM0-u3960864-m81ae10, H7Q2VB-u3960864-m81ae10, and G8K4N2-u3960864-m81ae10.
- Replaced the Island's unconditional 60 FPS loop with a 12 FPS scheduler driven by elapsed time; opening/hiding the Island or having no sessions stops all animation callbacks.
- Kept the five-second selected-project detail refresh, but removed the full configured-project scan from that timer; explicit refresh actions still rescan projects.
- Kept one-second foreground-process/title checks while reducing expensive macOS cwd inspection to at most once every five seconds per idle shell.
- Coalesced overlapping teamwork sync requests and limited periodic sync ownership to the most recently active protocol repository.

## Verification
- `npm run typecheck` passed.
- `npx vitest run tests/terminal.test.ts tests/teamwork-sync.test.ts` passed: 2 files, 17 tests.
- `npm test` passed: 60 files, 342 tests.
- `npm run build` passed after the final Island scheduler change.
- Island inline script parsed successfully with `new Function(...)`.
- Isolated Electron/CDP runtime check: no-session Island produced 0 SVG updates; working state produced 36 updates in 3.001 seconds (11.996 FPS); Island Renderer sampled at 0% idle and approximately 0.4% while animating.
- `codegraph sync .` completed and `codegraph affected ...` identified the terminal and teamwork sync tests.
- `git diff --check` passed.
- `git show --stat --oneline 4d8322a8` confirmed the commit contains exactly the seven implementation and test files listed above.

## Notes
- Success criteria: unchanged perceived animation speed at 12 FPS; no all-project Git scan on the five-second dashboard timer; fewer idle cwd subprocesses; serialized and lifecycle-bounded teamwork sync; regression tests pass.
- User accepted a small delay in idle terminal cwd-title updates; foreground process/status responsiveness remains unchanged.
- Runtime verification used an isolated temporary Electron user-data directory; the running installed application was not interrupted. A rebuilt/restarted application is required to observe the change in `/Applications/SharkBay.app`.
