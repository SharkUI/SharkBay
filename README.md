# SharkBay

SharkBay is a local-first macOS workbench for software projects.

It scans user-configured folders for local Git repositories, shows repository status and project files, and opens project-rooted terminal spaces for day-to-day development work.

## What It Does

- Scans only folders configured by the user.
- Discovers Git repositories under those roots.
- Shows each project with local icon candidates, Git branch, dirty files, recent Git activity, and a lazy file tree.
- Opens per-project terminal workspaces backed by xterm and `node-pty`.
- Detects common `package.json` dev scripts and exposes them as service pills.
- Keeps workbench columns resizable and preserves terminal sessions while Settings is open.
- Keeps filesystem and terminal access scoped to configured roots.

## Project Model

SharkBay treats a project as a local Git repository inside a configured scan root. It does not require project-specific control files or templates.

Project metadata is discovered from ordinary repository files:

- `.git` identifies a project.
- Git commands provide branch, history, dirty-worktree, and changed-file data.
- `package.json` contributes dev service commands when scripts are present.
- Common icon locations such as `resources/project-icon.png`, `public/favicon.png`, and monorepo web app public folders provide project avatars.

The app is intentionally local-first. SharkBay reads local files and spawns local shells; it does not publish repository data or run remote operations unless a future explicit feature does so.

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Vitest
- xterm
- node-pty

## Requirements

- Node.js `>=20.11`
- npm
- macOS for the desktop app workflow
- Native build tooling required by Electron native modules, including `node-pty`

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

Outputs are written to `release/`, including `release/mac-arm64/SharkBay.app`, a DMG, and a zip archive. Local builds use ad-hoc signing unless signing/notarization credentials are configured.

## Safety Notes

SharkBay is designed around explicit local boundaries:

- Configured roots are loaded from app config in the main process.
- Renderer-provided paths are resolved against configured roots before filesystem, Git, file-listing, or terminal operations.
- Project files are exposed through scoped file-tree listing, not arbitrary path reads.
- Terminal sessions are spawned only after the main process resolves the requested cwd inside configured roots.
- External URLs are opened through Electron shell handling rather than inside privileged app contexts.
- Direct agent execution is not part of the current product surface.

## Repository Status

This repository is the SharkBay desktop app source. Local scan configuration is stored in the user's SharkBay app config, not in this repository.
