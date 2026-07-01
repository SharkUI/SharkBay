---
kind: sharkbay_task
taskId: L9V2XQ-u3960864-m81ae10
taskTag: L9V2XQ
mode: task
title: Fix Open Site button
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e3e40-debd-7de2-8e9b-80880584d530
createdAt: 2026-05-19T03:22:50Z
updatedAt: 2026-07-01T14:25:45Z
completedAt: 2026-05-19T03:29:21Z
commit: 6e9f2531
---

## Summary
Fixed Knowledge Site generation for projects with nested docs directories, which caused Veridia's in-app Open Site action to fail during the generate-before-open step. Regenerated Veridia's local site and verified the button now opens it in a browser tab.

## Files
- .sharkbay/tasks/L9V2XQ-u3960864-m81ae10-fix-open-site-button.md
- src/main/knowledge-site.ts
- tests/knowledge-site.test.ts
- ../Veridia/.sharkbay/site/

## Work
- Searched team context and local tasks for prior Open Site work.
- Found related local task Q8D4M2-u3960864-m81ae10 noting the Open Site action can use stale app code until SharkBay is restarted.
- Reproduced the issue in the running SharkBay app with Veridia selected: the Knowledge Site button depresses but does not create a browser tab.
- Confirmed the toolbar browser button can open Veridia's existing `.sharkbay/site/index.html`, narrowing the issue to the generate-before-open path.
- Identified that Veridia has nested `docs/` directories; the generator updates `index.html` but fails before writing `.content-hash` because nested output parents are missing.
- Updated the generator to create parent directories before writing output files, compute correct relative navigation for nested docs, and link nested docs correctly from first-level section indexes.
- Added a regression test for nested Knowledge Site docs.
- Regenerated Veridia's `.sharkbay/site/` with the fixed generator.

## Verification
- `npm test -- tests/knowledge-site.test.ts` passes.
- `npm run typecheck` passes.
- `npm test` passes: 17 files, 63 tests.
- `npm run build` succeeds.
- Generated `/Users/shark/Projects/Veridia/.sharkbay/site/index.html` and `.content-hash` with the fixed build output.
- Verified in the running SharkBay app that Veridia's Open Site button opens a Home browser tab at `file:///Users/shark/Projects/Veridia/.sharkbay/site/index.html`.

## Notes
- Treat `.sharkbay/team-context/` as read-only.
- Committed later in P8M4TY-u3960864-m81ae10.
