---
kind: sharkbay_task
taskId: BR3WK8-u3960864-m81ae10
taskTag: BR3WK8
mode: task
title: Homebrew Cask one-click CLI install
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: f7f05bd3-9836-42a8-a9b7-77e24d160917
branch: main
createdAt: 2026-07-05T12:09:03Z
updatedAt: 2026-07-06T08:47:10Z
completedAt: 2026-07-06T08:47:10Z
commits:
  - ab161104
  - 5b9399f6
---

## Summary
One-line CLI install shipped: `brew install --cask SharkUI/tap/sharkbay`. Enabled
Developer ID signing + Apple notarization in electron-builder, released the first
notarized build (v0.3.0), created the self-hosted tap SharkUI/homebrew-tap with a
verified cask, and documented install in the README.

## Files
- package.json — enabled `mac.hardenedRuntime` + `mac.notarize` (done)
- docs/release.md — documented Developer ID signing/notarization env vars + verify commands (done)
- SharkUI/homebrew-tap : Casks/sharkbay.rb (planned, separate repo) — cask definition

## Work
- Investigated current distribution: repo SharkUI/SharkBay, GitHub Releases through v0.2.9.
- Latest release ships arm64 only: SharkBay-<ver>-arm64.dmg, -arm64-mac.zip, latest-mac.yml. No x64/universal.
- Confirmed signing/notarization was NOT configured; release doc stated builds are ad-hoc signed.
- Decision: use a self-hosted tap (SharkUI/homebrew-tap -> tap name SharkUI/tap) rather than official homebrew/cask, to avoid notability/stability gating for a new app.
- Blocker (now cleared): Homebrew Cask applies quarantine and cannot disable it; un-notarized apps are blocked by Gatekeeper. Smooth `brew install` requires Developer ID signing + notarization.
- Verified against electron-builder official docs (electron.build/docs/notarization): correct config is `mac.notarize: true` + `hardenedRuntime: true`; credentials come from env (APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID), so no Team ID needs to live in the repo.
- Verified existing entitlements already satisfy hardened runtime: allow-jit, allow-unsigned-executable-memory, disable-library-validation (needed for unpacked native modules node-pty/better-sqlite3), apple-events. No entitlement changes required.
- Enabled `hardenedRuntime: true` and `notarize: true` under package.json build.mac and documented the setup in docs/release.md.

## Plan (remaining)
1. DONE — Enable Developer ID signing + notarization in electron-builder config.
2. User-side Apple setup (cannot be automated here): create Developer ID Application cert in login keychain, get 10-char Team ID, create app-specific password.
3. Run a real signed+notarized build: set APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID, `npm run dist`; verify with `spctl --assess`, `xcrun stapler validate`, `codesign --verify`.
4. Decide arch coverage: build universal, or arm64 + x64, so Intel Macs are covered (currently arm64 only).
5. Create repo SharkUI/homebrew-tap with Casks/sharkbay.rb (version, sha256 of dmg, url, app "SharkBay.app", depends_on arch/macos, zap trash).
6. Verify `brew install --cask SharkUI/tap/sharkbay` launches without Gatekeeper prompt; `brew audit --cask` / `brew style` pass.
7. Add release automation to bump cask version+sha256 on each GitHub release; document install command in README + docs/release.md.

## Verification
- package.json parses as valid JSON; `build.mac.hardenedRuntime === true` and `build.mac.notarize === true` confirmed via `node -e`.
- Developer ID signing smoke test passed via `npm run pack` (--dir, no Apple creds needed):
  - electron-builder signed with `Developer ID Application: Qi Chen (P43Y97XG4F)` (hash BCF2BA81FA1707074F1C5B59C7FD228CE2FE513F); notarization correctly skipped (no creds in this run).
  - `codesign --verify --deep --strict`: valid on disk, satisfies Designated Requirement.
  - Authority chain: Developer ID Application → Developer ID Certification Authority → Apple Root CA; TeamIdentifier=P43Y97XG4F; `flags=0x10000(runtime)` (hardened runtime on).
  - `spctl --assess`: rejected / source=Unnotarized Developer ID (expected — notarization pending).
- Full notarized build DONE via `npm run dist`: electron-builder reported `notarization successful`; produced release/SharkBay-0.2.9-arm64.dmg (+ zip, blockmaps, latest-mac.yml).
  - `spctl --assess --type exec`: accepted / source=Notarized Developer ID.
  - `xcrun stapler validate`: "The validate action worked!".
  - Notarized dmg sha256 = dee2e2e7a174cdd646252f6643583e20da5e6e26fc78492d04088c7f734fb078 (for the cask).
- Homebrew tap + cask (v0.3.0):
  - Created public repo SharkUI/homebrew-tap with Casks/sharkbay.rb (version 0.3.0, dmg sha256 5e854ec1...151b, url to the v0.3.0 GitHub release).
  - `brew style SharkUI/tap/sharkbay` — no offenses; `brew audit --cask` — exit 0 (clean).
  - `brew fetch --cask SharkUI/tap/sharkbay` — downloaded dmg; sha256 matched our notarized dmg exactly.
  - Mounted the brew-cached dmg and ran `spctl --assess` on SharkBay.app inside — accepted / source=Notarized Developer ID; `xcrun stapler validate` — worked. Proves the artifact brew installs is notarized and Gatekeeper-accepted.
  - Verified Homebrew 6.0 tap-trust behavior: fully-qualified `brew install --cask SharkUI/tap/sharkbay` auto-trusts the single cask (works directly); short-name form needs `brew trust` first (documented in tap README).
  - README updated with the install command (commit 5b9399f6).
- NOT done: literal copy into /Applications via `brew install` — skipped because the user already has /Applications/SharkBay.app and overwriting it is destructive; equivalence proven via the mounted-dmg spctl check above.

## Notes
- The Developer ID signing + notarization config (package.json build.mac + docs/release.md) shipped in commit ab161104 as part of release v0.3.0 (task R3V300-u3960864-m81ae10).
- Apple Team ID = P43Y97XG4F (from the cert subject; not secret). Developer ID Application cert is installed in the login keychain and valid for codesigning; Developer ID G2 intermediate was installed to complete the chain.
- Remaining Apple credential: an app-specific password (created at appleid.apple.com) — the ONE secret; keep it out of the repo and chat, pass via APPLE_APP_SPECIFIC_PASSWORD env at build time only.
- appId is `xyz.sharkbay.app`, productName `SharkBay`; dmg artifactName pattern `${productName}-${version}-${arch}.${ext}`.
- Packaged app path for verification is `release/mac-arm64/SharkBay.app`.
- Homebrew tap repo MUST be named `homebrew-tap` so the tap resolves as `SharkUI/tap`.
- App Store Connect API key auth (APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER) is the recommended alternative for CI (no 2FA, no expiry).

