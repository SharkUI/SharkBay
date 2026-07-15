---
kind: sharkbay_task
taskId: V3R1Q9-u3960864-m81ae10
taskTag: V3R1Q9
mode: task
title: Prepare release v0.3.1
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f6569-a024-72e2-a5a9-21917e1d0806
branch: main
createdAt: 2026-07-15T11:30:06Z
updatedAt: 2026-07-15T11:34:43Z
completedAt: 2026-07-15T11:34:43Z
---

## Summary
Prepared SharkBay v0.3.1 version metadata, changelog, GitHub release notes, and an inspected unsigned macOS app bundle. All automated checks passed; committing, signing/notarizing, tagging, publishing, and Homebrew updates remain intentionally unperformed.

## Files
- .sharkbay/tasks/V3R1Q9-u3960864-m81ae10-prepare-release-v0-3-1.md
- package.json
- package-lock.json
- CHANGELOG.md
- release/v0.3.1-notes.md
- release/mac-arm64/SharkBay.app

## Work
- Started release preparation from clean main at version 0.3.0 with no existing v0.3.1 tag.
- Related prior release task: R3V300-u3960864-m81ae10.
- Scope stops before commit, tag, push, GitHub Release creation, or Homebrew tap updates.
- Audited all 17 commits since v0.3.0 and their related team-context tasks.
- Confirmed a valid Developer ID certificate is installed, but Apple notarization environment credentials are not available in this shell.
- Bumped package and lockfile root metadata from 0.3.0 to 0.3.1.
- Added v0.3.1 changelog and GitHub release notes covering Review orchestration, caffeinate support, runtime/package improvements, and task/agent UI fixes.
- Generated an unsigned arm64 macOS app bundle with `npm run pack` for release-candidate inspection.
- Reviewed the final diff and confirmed the preparation only changes the three tracked release metadata files; release notes and package artifacts remain ignored under `release/`.

## Verification
- Version consistency check confirmed package.json, package-lock.json, and the lockfile root package are all 0.3.1.
- `git diff --check` passed after the metadata and release-note edits.
- `npm run typecheck` passed.
- `npm test` passed: 60 test files and 337 tests.
- `npm run build` passed.
- `npm run pack` passed and produced `release/mac-arm64/SharkBay.app`.
- The packaged app reports `CFBundleShortVersionString` and `CFBundleVersion` as 0.3.1; its size is 252 MB, with a 17 MB `app.asar` and 12 MB unpacked resources.
- Strict deep code-signature verification passed for the expected ad-hoc local signature.
- Package inspection confirmed the main process, renderer, island, find popover, and better-sqlite3 native module are present while configured tests, maps, tsbuildinfo files, bun-pty, and better-sqlite3 source/deps are absent.
- Packaged better-sqlite3 loaded under Electron and completed an in-memory query successfully.
- Final `git diff --check` passed; HEAD remains aligned with `origin/main`, and no `v0.3.1` tag exists.
- Signed/notarized `npm run dist` was intentionally not run because Apple notarization credentials are unavailable in this shell.

## Notes
- Release preparation should follow the established v0.3.0 signing/notarization-aware workflow.
- Final signed/notarized `npm run dist` must wait for Apple credentials; preparation uses unsigned `npm run pack` for package verification.
- After the distribution build, replace the pending artifact checksums in `release/v0.3.1-notes.md` before publishing.
