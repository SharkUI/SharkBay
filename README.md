# SharkBay

SharkBay is a local-first macOS workbench for software projects. It helps you keep a set of local repositories visible, open project-scoped terminals and browser tabs, inspect Git state, and coordinate agent work through local Markdown task records.

## What It Does

- Adds and removes individual project folders selected by the user.
- Shows project icons, branch names, dirty worktree state, dirty files, recent Git activity, and a lazy file tree.
- Opens per-project terminal workspaces backed by xterm and `node-pty`.
- Detects common development services from `package.json` `dev` / `dev:*` scripts and supported Python CLI web commands.
- Opens embedded browser tabs for local or web URLs from the same project workspace.
- Discovers installed agent CLIs such as Codex, Claude Code, Gemini, Kiro, DeepSeek, Qwen, and OpenCode, then launches them in visible project terminals.
- Watches recent Codex and Claude transcript files for short project status snippets.
- Supports SharkBay Teamwork: a project-local `.sharkbay` harness, Markdown task files, read-only team context mirror, knowledge site generation, and optional sync through a GitHub remote branch.
- Provides Settings for configured projects, project status, and day/night/morning appearance themes.

## Documentation

- [Documentation index](docs/index.md)
- [Product notes](docs/product.md)
- [Architecture](docs/architecture.md)
- [Development guide](docs/development.md)
- [Testing](docs/testing.md)
- [Release and packaging](docs/release.md)
- [Teamwork](docs/teamwork.md)
- [Agent guide](docs/agents.md)
- [Roadmap](docs/roadmap.md)

## Project Model

SharkBay treats a project as a local directory selected by the user. Removing a project only removes it from the SharkBay workspace; it does not delete files from disk.

Project metadata is discovered from ordinary repository files and local tools:

- `.git` identifies repository metadata when present.
- Git commands provide branch, remote, reflog, dirty-worktree, and changed-file data.
- `package.json` and selected `pyproject.toml` patterns contribute development service commands.
- Common icon locations and Electron Builder icon fields provide project avatars.
- Teamwork metadata is stored inside the target repository only after Teamwork is explicitly installed for that project.

The app is local-first by default. It reads local files and spawns local shells inside configured project boundaries. Network and remote Git operations are limited to explicit features such as Teamwork install/sync and web content opened in embedded or external browsers.

## Data Directory

SharkBay stores product data in the user's SharkBay home directory:

```text
~/.sharkbay/
```

Current client configuration is stored at:

```text
~/.sharkbay/config.json
```

That file contains manually added projects, appearance theme, and config metadata. Electron may still use its platform `userData` directory for Chromium/runtime state, but SharkBay workspace data should live under `~/.sharkbay`.

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Vitest
- xterm
- node-pty

## Requirements

- macOS for the desktop app workflow
- Node.js `>=20.11`
- npm
- Native build tooling required by Electron native modules, including `node-pty`
- Git for repository metadata
- GitHub CLI `gh` only when using SharkBay Teamwork sync

## Development

Install dependencies:

```bash
npm install
```

Run the development app:

```bash
npm run dev
```

Run checks:

```bash
npm run typecheck
npm test
npm run build
```

`npm run lint` currently delegates to `npm run typecheck`.

If Electron or native terminal dependencies change, rebuild native modules:

```bash
npm run rebuild:native
```

## Packaging

Create an unpacked local macOS app for smoke testing:

```bash
npm run pack
```

Create distributable macOS artifacts:

```bash
npm run dist
```

Outputs are written to `release/`. Local builds use ad-hoc signing unless signing and notarization credentials are configured.

## Runtime Data

- App config is stored in Electron `userData` as `config.json`.
- Resizable column widths are stored in renderer `localStorage`.
- Embedded browser tabs use Electron partition `persist:sharkbay-browser`.
- Teamwork installs repo-local `.sharkbay/` files; supported agent launches receive a SharkBay bootstrap prompt instead of writing project entry files.
- Teamwork sync uses the remote branch `sharkbay-team-context` and mirrors records into `.sharkbay/team-context/`.
- Agent status watching reads recent local Codex and Claude transcript files from the user's home directory.

## Safety Notes

SharkBay keeps project operations scoped to user-configured projects:

- Renderer-provided paths are resolved in the main process against persisted configured projects before filesystem, Git, terminal, file-tree, or Teamwork operations run.
- Project files are exposed through scoped file-tree listing, not arbitrary path reads.
- Terminal sessions are spawned only after the main process resolves the requested cwd inside an allowed project boundary.
- Embedded browser tabs accept only `http:` and `https:` URLs; unsafe schemes fall back to `about:blank`.
- New windows from app and embedded browser content are opened through Electron shell handling instead of privileged app contexts.
- Agent CLIs are not run as hidden background services; when launched, they run in ordinary visible project terminal tabs.
- Teamwork remote operations require an explicit install action, a GitHub origin, authenticated `gh`, and write/admin repository permission.
