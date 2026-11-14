# Development Guide

## Requirements

- macOS
- Node.js `>=20.11`
- npm
- Git
- Native build tooling if Node native module prebuilds are unavailable
- GitHub CLI `gh` only for protocol install/sync flows

## Setup

```bash
npm install
```

## Run The App

```bash
npm run dev
```

The dev command builds the Node runtime, runs Vite on `127.0.0.1:5184`, watches Electron TypeScript and starts Electron. Electron discovers/starts one independent runtime, using ordinary Node during development and the bundled Node in packaged builds.

The File menu's **Open in Browser** action opens a short-lived connection link to the same runtime. Browser refresh and desktop reconnect attach existing terminals.

For standalone browser use:

```bash
npm run build
npm run start:runtime
# Register a host project when starting or connecting:
npm run start:runtime -- --project /absolute/path/to/project
# Explicitly stop the runtime and its terminals:
npm run start:runtime -- --stop
```

Closing Electron leaves the runtime alive. After changing host/runtime code, explicitly stop it, rebuild, then start the client again; an already-running process does not hot-reload compiled modules. Do this only when its Agent sessions can end. A client with an incompatible protocol is refused rather than replacing the active service.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

`npm run lint` is an alias for `npm run typecheck`.

Use `git diff --check` before finishing documentation or whitespace-sensitive changes.

See [Testing](testing.md) for the current test suite and [Release and packaging](release.md) for package verification.

## Native Module Rebuilds

The independent Node runtime loads `@lydell/node-pty` and `better-sqlite3`; Electron loads neither. Install dependencies with the ordinary Node version used to run/build the runtime. The previous Electron ABI postinstall rebuild has been removed.

## Packaging

Unpacked app for local smoke testing:

```bash
npm run pack
```

Distributable macOS artifacts:

```bash
npm run dist
```

Build outputs are written to `release/`.

Release-specific details live in [Release and packaging](release.md).

## Useful Files

- `package.json` - scripts, Electron Builder config, dependencies.
- `vite.config.ts` - renderer dev server and packaged asset path config.
- `vitest.config.ts` - test include pattern and coverage settings.
- `tsconfig.node.json` - main/preload/shared/test compilation.
- `tsconfig.renderer.json` - renderer compilation.
- `scripts/README.md` - conventions for local validation helpers.

## Local Runtime State

During development, SharkBay writes runtime data outside the repository:

- Shared profile `~/.sharkbay/runtime/` for config, usage and helper CLIs. First startup copies `~/.sharkbay/config.json` when available; an explicit config can be selected.
- Electron userData for Chromium/desktop settings, separate from runtime state.
- BrowserView partition data for embedded browser tabs.
- Codex/Claude transcript reads from the user's home directory.

When protocol is installed for a project, SharkBay writes repo-local `.sharkbay/` and a local `.git/info/exclude` entry for `/.sharkbay/`. Supported agent launches receive a first-message bootstrap prompt; SharkBay does not generate or repair per-agent entry files during launch.

## Verification Guidance

- For main-process service changes, run targeted unit tests plus `npm run typecheck`.
- For IPC contract changes, update `src/shared/ipc-channels.ts`, preload types, renderer bridge use, and `tests/ipc-channels.test.ts` together.
- For renderer workflow helper changes, update `tests/renderer-workflow.test.ts`.
- For packaging changes, run `npm run build`; use `npm run pack` when native modules, resources, or Electron Builder config changed.
- For protocol changes, run the protocol harness/sync/task tests and inspect generated local files in a temporary repository.

## Isolated shared-client verification

```bash
npm run verify:webui
npm run verify:shared
```

`verify:shared` uses a temporary profile/config and Git fixture, ordinary Node, an isolated Electron userData directory and Chrome profile. It creates a terminal from the desktop UI, observes/takes control in the browser, reloads without creating a replacement PTY, checks client termination survival, then explicitly stops the runtime. It does not enable global Hooks or send Agent prompts. Chrome defaults to the macOS application path; `SHARKBAY_TEST_CHROME` can select another binary. Screenshots are kept in ignored `.sharkbay/validation/shared-runtime/` for visual inspection.

For manual isolation, set `SHARKBAY_RUNTIME_DATA_DIR` and `SHARKBAY_ELECTRON_DATA_DIR` to separate directories and `SHARKBAY_CONFIG_PATH` to an existing fixture config. Do not point test instances at repositories or Agent settings managed by the daily desktop app.
