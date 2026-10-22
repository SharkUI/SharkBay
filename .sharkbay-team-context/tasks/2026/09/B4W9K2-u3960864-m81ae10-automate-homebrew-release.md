---
kind: sharkbay_task
taskId: B4W9K2-u3960864-m81ae10
taskTag: B4W9K2
mode: task
title: Update and automate Homebrew release
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 01a0c81a-f2be-7680-b65b-5632ad822348
branch: main
createdAt: 2026-09-22T07:55:34Z
updatedAt: 2026-09-22T08:23:13Z
completedAt: 2026-09-22T08:23:13Z
commits:
  - f5cb2222e3483bb3290c3148e165a2bce8d6d686
  - d05b9856345dc67843bb19848fed223acecbec33
  - cec61aa41891e3545c69c43ceb0487f0ebe63fba
  - 176b345fbbfe245805a7eb459a4fa288ed9c1848
---

## Summary
Updated the Homebrew cask to SharkBay v0.3.4 and added an hourly GitHub Actions sync from the latest stable release. A live workflow run validated and committed the cask update end to end.

## Files
- .sharkbay/tasks/B4W9K2-u3960864-m81ae10-automate-homebrew-release.md
- SharkUI/homebrew-tap/Casks/sharkbay.rb
- SharkUI/homebrew-tap/.github/workflows/update-sharkbay-cask.yml
- SharkUI/homebrew-tap/README.md

## Work
- Reviewed existing Homebrew and release task context before implementation.
- Plan: update the current cask, connect official releases to an automatic tap update, and verify both paths.
- Chose tap-local hourly synchronization so future updates require no personal token and do not depend on the manual release procedure.
- Added stable-release discovery, GitHub asset SHA-256 consumption with a download fallback, Homebrew style/audit gates, and bot commits to the tap workflow.
- Removed the deprecated cask URL `verified` parameter and documented automatic synchronization in the tap README.
- Corrected workflow lint and authenticated online audit failures found by live test runs, then reran the complete update successfully.
- The successful workflow created bot commit `176b345fbbfe245805a7eb459a4fa288ed9c1848`, updating the cask from v0.3.1 to v0.3.4.

## Verification
- `ruby -c Casks/sharkbay.rb` — passed.
- Workflow YAML parsing and `git diff --check` — passed.
- GitHub Actions run `35704074882` — passed update discovery, `brew style`, authenticated `brew audit --cask --online`, and automatic commit/push.
- Remote cask reports v0.3.4 with SHA-256 `3605c2484d82992551cb6ee9da99cfa1c3c1e0bf261f6d8cb3831e38b5dfea0a`.
- `brew update` and `brew info --cask SharkUI/tap/sharkbay` — resolved v0.3.4.
- `brew fetch --cask --force SharkUI/tap/sharkbay` — passed; cached DMG SHA-256 matches the cask and GitHub release digest.

## Notes
- Related prior tasks: `BR3WK8-u3960864-m81ae10`, `R31PUB-u3960864-m81ae10`, `R6U3P8-u3960864-m81ae10`.
- The worktree already had a user-owned `AGENTS.md` modification and was one commit ahead of `origin/main`; leave both untouched.
- The sync targets GitHub's latest stable release and runs at minute 17 of every hour; it can also be dispatched manually from the tap's Actions page.
