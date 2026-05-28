# Development Guide

## Requirements

- macOS
- Node.js `>=20.11`
- npm
- Git
- Native build tooling for Electron native modules
- GitHub CLI `gh` only for protocol install/sync flows

## Setup

```bash
npm install
```

## Run The App

```bash
npm run dev
```

The dev command runs Vite on `127.0.0.1:5173`, watches the Electron/main TypeScript build, waits for both outputs, and starts Electron.

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

The PTY layer (`@lydell/node-pty` for Node/Electron, `bun-pty` for Bun) ships N-API prebuilt binaries, so no rebuild step is required after Electron or Node upgrades — a plain `npm install` is enough.

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

- Electron userData `config.json` for configured projects and theme.
- BrowserView partition data for embedded browser tabs.
- Codex/Claude transcript reads from the user's home directory.

When protocol is installed for a project, SharkBay writes repo-local `.sharkbay/` and a local `.git/info/exclude` entry for `/.sharkbay/`. Supported agent launches receive a first-message bootstrap prompt; SharkBay does not generate or repair per-agent entry files during launch.

## Verification Guidance

- For main-process service changes, run targeted unit tests plus `npm run typecheck`.
- For IPC contract changes, update `src/shared/ipc-channels.ts`, preload types, renderer bridge use, and `tests/ipc-channels.test.ts` together.
- For renderer workflow helper changes, update `tests/renderer-workflow.test.ts`.
- For packaging changes, run `npm run build`; use `npm run pack` when native modules, resources, or Electron Builder config changed.
- For protocol changes, run the protocol harness/sync/task tests and inspect generated local files in a temporary repository.
