# Release And Packaging

SharkBay distributes Runtime and WebUI together as an npm package. The optional Electron desktop client is packaged separately for macOS 13 Ventura or later on Apple Silicon (arm64). The [current facts table](current-facts.md) summarizes current behavior.

## Runtime and WebUI

`npm run pack:runtime` creates `release/sharkbay-runtime-<version>.tgz` using the repository version and locked direct runtime dependencies. The archive contains the compiled Node service, CLI, and WebUI assets. It targets Node.js 22.12+ in the 22.x series on macOS and Linux x64/arm64. Install the tarball in an isolated npm prefix for release validation before publishing it. For 1.0.0, attach it to the GitHub Release so npm can install it directly from the release URL.

Serve the installed WebUI with `sharkbay serve`. The default address is `http://127.0.0.1:17777/`. `sharkbay service enable` starts it with a macOS LaunchAgent or a Linux systemd user service. `sharkbay service disable` stops the process and disables login startup. On macOS, enabling it again uses the saved profile, executable, port, and LAN settings. New services use the current user's default profile and the Node executable used at registration. `--lan` explicitly enables trusted LAN access. `SHARKBAY_RUNTIME_PORT` can set the initial service port.

After finishing active sessions, disable a registered service before updating Node or uninstalling the package. On Linux, re-enable it from the desired Node environment to register its executable again. Linux hosts that need to serve the WebUI before login can enable systemd lingering for their service user.

## Commands

Build TypeScript and renderer assets:

```bash
npm run build
```

Create an unpacked app for local smoke testing:

```bash
npm run pack
```

Create distributable macOS artifacts:

```bash
npm run dist
```

## Outputs

Electron Builder writes outputs to `release/`. The macOS config targets DMG and zip artifacts, and unpacked packs include a local app bundle under `release/mac-*`.

## Automatic Updates

Installed builds use `electron-updater` with the public `SharkUI/SharkBay`
GitHub Releases feed configured in `package.json`. The app checks at startup
and every four hours, downloads newer stable versions in the background, and
offers **Restart to update** or **Later**. Later defers installation until a
normal application quit; closing the macOS window only hides it. Explicit
update restarts disconnect the desktop client before invoking the installer;
the shared Node runtime and its terminals keep running. Stop that runtime
explicitly before activating an incompatible runtime upgrade. Development builds do not check or install updates.

**Check for Updates...** is available in the macOS app menu (File on other
platforms). It also brings a previously dismissed ready update back into view.
Failed downloads can be retried from the update message or at the next check.

For each release:

1. Increase the application version and run the release checks below.
2. Produce Developer ID signed, notarized and stapled artifacts. The ZIP must
   contain the final signed app; if any artifact changes, regenerate its
   blockmap and update manifest so sizes and checksums match.
3. Upload the DMG, ZIP, their generated blockmaps, and the release's update
   manifest to the same GitHub Release. For 1.x, use `desktop-mac.yml`.
   Include an architecture-compatible ZIP for each
   supported Mac architecture. The current release ships arm64.
4. Verify all assets before publishing the release as a stable, non-draft
   release. A commit or tag alone does not deliver an application update.

Use `npx electron-builder --mac --publish never` for local distributable
verification without uploading. The packaged app must include
`Contents/Resources/app-update.yml` pointing to `SharkUI/SharkBay` and the
`desktop` update channel for 1.x.
Keep publishing credentials on the build machine; public update clients do
not need a GitHub token.

Before the first updater-enabled public release, test an installed signed
version against a higher signed test version using an isolated test feed.
Verify automatic download, failed-download retry, normal-quit installation,
explicit restart after terminal cleanup, signature rejection, and retention
of app configuration. Do not exercise installation against a working user's
application or publish a test version to the production feed.

Versions shipped before this updater need one manual installation of an
updater-enabled release. Subsequent releases can update automatically.

### macOS 0.3.14 Migration And 1.x Release

Publish 0.3.14 and 1.x in `SharkUI/SharkBay`. The bridge and 1.x use the
`desktop` update channel in the same repository. For 1.0, the maintainer
approved shortening the initial two-week migration window. Keep the manual
bridge installation available for clients that miss the automatic update.

Build the self-contained archive on an arm64 Mac with Node 22:

```bash
npm run pack:runtime:migration
npm run pack:desktop:migration -- bridge migration-inputs.json release/v0.3.13/SharkBay-0.3.13-arm64-mac.zip
npm run pack:desktop:migration -- 1.0 migration-inputs.json
```

The production input file uses `owner` set to `SharkUI` and `repo` set to
`SharkBay`. Its `runtime` object contains `version` (`1.0.0`), the archive's
HTTPS `url` and the `sha256` printed by the Runtime build. Host the archive as
the `sharkbay-runtime-1.0.0-macos-arm64.tar.gz` asset of v0.3.14 so the bridge
can download it during the transition. The bridge is built from the v0.3.13 tag and uses
the original signed ZIP's bundled Runtime. Check the legacy Runtime manifest
and run against the final signed assets. The commands build local artifacts.

1. Publish v0.3.14 as the latest stable release with its notarized DMG, ZIP,
   blockmaps, Runtime archive, and both `latest-mac.yml` and `desktop-mac.yml`.
   The two manifests are identical and describe the bridge.
2. After the migration window and release verification, publish v1.0.0 as the latest
   stable release with its notarized desktop assets and `desktop-mac.yml`.
   Omit `latest-mac.yml` from v1.0.0 and all later releases. The legacy updater
   only looks for that file and cannot automatically download a 1.x package.
3. Keep the v0.3.14 assets downloadable and link directly to its release page
   from the v1.0.0 upgrade notes. Users still on 0.3.13 or earlier can manually
   install 0.3.14, complete the Runtime migration, and then update to 1.x.

The bridge stages the Runtime while the old process is serving existing
terminals. Once that process has exited, opening the bridge starts the new
service. When it is ready, the bridge offers 1.x through the new feed. The
Runtime binds to loopback by default. An existing trusted-LAN user can set
`SHARKBAY_MIGRATION_LAN=1` on the bridge's first launch to retain LAN access.
The bridge stores the effective profile, config and port for the replacement
service and 1.0 Desktop. If an existing 1.0.0 Runtime already runs the same
profile through its verified LaunchAgent, the bridge keeps that Runtime and
its terminals running and uses it for the 1.0 update checks.

For signed upgrade QA, use a fixture repository and add a `qa` object with
an isolated `name`, `appId`, `serviceLabel` and numeric Runtime `port`. Build
`legacy-qa`, `bridge` and `1.0` with the same input file. The `legacy-qa` command
takes the same signed legacy ZIP as `bridge`. The optional QA-only `host`
(`127.0.0.1:PORT`) runs the GitHub provider against a loopback fixture. These
local QA builds use Developer ID signatures without notarization. They exercise
the native update client across the change in which release GitHub marks latest.
Run the loopback acceptance chain with
`node scripts/verify-macos-migration.mjs migration-inputs.json` after building the three ZIPs.
Add `--adopt-standalone` to test an existing Runtime, its custom configuration,
and disabling and re-enabling its LaunchAgent.

Candidate probes hold the canonical profile locks and use a SQLite backup.
They leave the live data untouched before committing the handoff. If the
bridge cancels the candidate before commit, 0.3.14 reopens the live profile
with its bundled Runtime. Keep the pre-migration snapshot for inspection. The
bridge verifies the installed LaunchAgent and its login settings before
offering 1.0. If the job is unloaded, 1.0 can register the verified plist at
`~/Library/LaunchAgents/xyz.sharkbay.runtime.plist`. For service failures,
check `runtime.log` in the recorded profile.

### Signed Update Acceptance

On 2026-09-16, the current updater passed installation acceptance on a separate
arm64 Mac running macOS 26.3.1. Two Developer ID signed, notarized and stapled
test builds, 0.3.3 and 0.3.4, used the independent name `SharkBay Update QA`,
app ID `xyz.sharkbay.updateqa`, user data/config directories, and a loopback
HTTP feed. These version numbers were test fixtures, not public releases.

Verified behaviors:

- Startup discovers and downloads the newer version automatically.
- A failed download (HTTP 503) exposes Retry; restoring the feed succeeds.
- A ZIP with matching download checksums but a modified app signature is
  rejected, leaving the installed version unchanged.
- Later hides the prompt; a manual check restores it. Closing the window
  leaves the current version running.
- Restart to update installs 0.3.4 and reopens the app after terminating the
  old terminal shell and its child process.
- Normal quit installs 0.3.4 without reopening the app.
- Configuration, renderer local storage, and project files survive both paths.
  The installed result passes Gatekeeper and strict code signature checks.

This exercises signed installation through an isolated generic feed. The
production GitHub feed was checked separately; publishing a new production
release still requires verifying its uploaded ZIP and update metadata.
Task `N6T8V2-u3960864-m81ae10` records the acceptance environment and results.

## Package Inputs

The Electron Builder config in `package.json` includes:

- `dist/renderer/**/*`
- `dist-electron/**/*`, with explicit exclusions for compiled tests, source maps, declarations and build metadata
- `package.json`
- `resources/` as extra resources

The package entry is `dist-electron/electron/main.js`.

## Native Modules

The npm runtime loads `@lydell/node-pty` and `better-sqlite3` under ordinary Node. Validate installation and a real PTY on every advertised platform and Node ABI. The desktop package loads the existing runtime over the same-user control endpoint.

## Resources

Desktop icons are read from `resources/` in development and from `process.resourcesPath/resources` in packaged builds. Current app themes use day, night, and morning icon variants.

## macOS Signing

Electron Builder signs the macOS app with `build/entitlements.mac.plist` and child bundles with `build/entitlements.mac.inherit.plist`.

The main app entitlement includes `com.apple.security.automation.apple-events` so terminal-launched local tools can request macOS Automation access through SharkBay. Keep the Electron code-signing entitlements in both files; removing them can break arm64 Electron builds.

## Developer ID Signing And Notarization

The macOS config enables `hardenedRuntime` and `notarize`, so `npm run dist`
signs with a Developer ID Application certificate and notarizes with Apple.

Prerequisites:

- Active Apple Developer Program membership.
- A "Developer ID Application" certificate installed in the login keychain
  (Xcode → Settings → Accounts → Manage Certificates → +, or developer.apple.com).
- An app-specific password created at appleid.apple.com.
- The 10-character Team ID from developer.apple.com → Membership.

Provide credentials via environment variables when running `npm run dist`:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
# Signing cert: omit when the Developer ID cert is in the login keychain.
# For CI, supply the exported .p12 instead:
# export CSC_LINK="base64-or-path-to-cert.p12"
# export CSC_KEY_PASSWORD="cert-password"
```

Verify a signed, notarized, stapled build:

```bash
spctl --assess --verbose --type exec "release/mac-arm64/SharkBay.app"  # → accepted, source=Notarized Developer ID
xcrun stapler validate "release/mac-arm64/SharkBay.app"                 # → The validate action worked!
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/SharkBay.app"
```

Keep all Apple credentials out of the repo; pass them through the environment
(or CI secrets) only.

On the configured release Mac, the existing notarytool keychain profile is
`sharkbay-release`. Select it explicitly; an unset environment variable does
not mean the stored credentials are missing:

```bash
xcrun notarytool history --keychain-profile sharkbay-release
APPLE_KEYCHAIN_PROFILE=sharkbay-release npm run dist -- --publish never
```

The profile name is configuration, not the password. Keep the credential itself
in the keychain.

## Release Checks

Before producing distributable artifacts:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run pack`
5. `npm run pack:runtime`, then install the tarball and start it with a temporary runtime profile
6. Start the unpacked desktop app against the installed runtime and verify WebUI, PTY, and desktop exit
7. `npm run dist`

Local builds use ad-hoc signing unless signing and notarization credentials are configured.

## Known Packaging Note

`tsconfig.node.json` includes tests for compilation and checking, while Electron Builder explicitly excludes `dist-electron/tests/**/*`, source maps, declarations and build metadata from the desktop package. Check the actual artifact manifest for release acceptance; TypeScript include patterns alone do not describe shipped contents.

## Desktop migration

Make the Runtime npm tarball available with the first desktop-only update. Verify the tarball and include the installation and startup steps in the release notes.

Finish active sessions and quit the old desktop app before stopping its bundled Runtime. Start the independently installed Runtime with the same profile to reuse the existing configuration, then launch the new desktop client. Closing or updating the desktop client leaves the Runtime and its sessions running. Keep the runtime and desktop versions on the same release when the control protocol changes.

After packaging, run `node scripts/verify-packaged-runtime.mjs <app-path> <installed-cli-path>` to verify desktop attachment to the installed Runtime with an isolated profile. Set `SHARKBAY_TEST_NODE` to the Node executable used to install the CLI.
