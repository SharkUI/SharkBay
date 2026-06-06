---
kind: sharkbay_task
taskId: H4T2R8-u3960864-m81ae10
taskTag: H4T2R8
mode: task
title: Repack v0.2.2 hotfix
status: completed
completedAt: 2026-06-06T06:30:21Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e958c-f4d3-7170-8d20-26ef225bb46d
branch: main
createdAt: 2026-06-05T03:03:54Z
updatedAt: 2026-06-06T06:30:21Z
---

## Summary
Rebuilt and published replacement v0.2.2 artifacts after the orphaned hook-session idle-pill hotfix, keeping the version number unchanged. `main`, the `v0.2.2` tag, GitHub Release notes, and release assets now point to the hotfix build.

## Files
- .sharkbay/tasks/H4T2R8-u3960864-m81ae10-repack-v022-hotfix.md
- release/SharkBay-0.2.2-arm64.dmg
- release/SharkBay-0.2.2-arm64.dmg.blockmap
- release/SharkBay-0.2.2-arm64-mac.zip
- release/SharkBay-0.2.2-arm64-mac.zip.blockmap
- release/latest-mac.yml
- release/mac-arm64/SharkBay.app
- release/v0.2.2-notes.md

## Work
- Started hotfix repack task after detecting `main` is one commit ahead of `origin/main` and tag `v0.2.2`.
- Current HEAD is `c6c4f3cf`, while `v0.2.2` still points to `45f01a38`.
- Related bugfix task: `V8KR2T-u3960864-m81ae10-fix-orphaned-idle-pill`.
- Plan: rebuild artifacts from current HEAD with version `0.2.2`, push `main`, move `v0.2.2` to the hotfix commit, and replace GitHub Release assets.
- Updated `release/v0.2.2-notes.md` with the orphaned external hook-session idle-pill fix.
- Rebuilt v0.2.2 artifacts from hotfix HEAD while keeping version metadata unchanged.
- Pushed `main` from `45f01a38` to `c6c4f3cf`.
- Moved local tag `v0.2.2` from `45f01a38` to `c6c4f3cf` and force-pushed the tag to `origin`.
- Attempted to update GitHub Release notes and replace assets with `gh`; failed at API connection.
- User manually updated the GitHub Release notes and replaced the DMG/ZIP assets.

## Verification
- Confirmed `package.json`, `package-lock.json`, and root lock package version all remain `0.2.2`.
- `npm run typecheck`: passed.
- `npm test`: passed, 158 tests across 40 files.
- `npm run dist`: passed and regenerated the v0.2.2 DMG/ZIP artifacts.
- `plutil -extract CFBundleShortVersionString raw -o - release/mac-arm64/SharkBay.app/Contents/Info.plist`: `0.2.2`.
- `codesign --verify --deep --strict release/mac-arm64/SharkBay.app`: passed.
- `shasum -a 256 release/SharkBay-0.2.2-arm64.dmg release/SharkBay-0.2.2-arm64-mac.zip`: `70d6c5296af9264690b2abed37615de254cc6a2f900b1de1d213323e867f321f` and `d5b5f1b701459dbd543779d56ae3117de13aa9b034f5124875a15fd870dcfd62`.
- `git push origin main`: passed.
- `git tag -f v0.2.2 HEAD && git push --force origin v0.2.2`: passed.
- `gh release edit v0.2.2 --notes-file release/v0.2.2-notes.md && gh release upload v0.2.2 ... --clobber`: failed with `error connecting to api.github.com`.
- `git status --short --branch`: `## main...origin/main`.
- `git rev-parse --short HEAD` and `git rev-parse --short v0.2.2`: both `c6c4f3cf`.
- User confirmed GitHub Release update and asset replacement completed.

## Notes
- Version number intentionally remains `0.2.2`.
- Because this is a same-version hotfix republish, the release tag should be updated to the hotfix commit so the GitHub Release does not point at stale source.
- GitHub Release update was completed outside this shell because local `gh` API access was unavailable.
