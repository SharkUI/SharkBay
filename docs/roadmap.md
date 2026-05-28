# Roadmap

This roadmap reflects the current implementation in this repository, not only the original design direction.

## Current Baseline

SharkBay already has:

- Project-centered desktop UI with manually configured project folders.
- Git repository discovery, branch/remote/dirty-file metadata, recent Git activity, and lazy file browsing.
- Project-scoped terminal tabs with xterm and `node-pty`.
- Development service detection for `package.json` `dev` / `dev:*` scripts and selected Python CLI web commands.
- Embedded browser tabs backed by Electron `BrowserView`.
- Agent CLI launch buttons and lightweight Codex/Claude transcript status watching.
- SharkBay protocol install/status/tasks/uninstall flows with local Markdown task records and remote context-branch sync.
- Day, night, and morning appearance themes.

## Near-Term Priorities

| Priority | Goal | Notes |
| --- | --- | --- |
| Protocol hardening | Make protocol safer and clearer under normal team use | Improve task detail rendering, sync error surfacing, conflict visibility, and owner/permission messaging. |
| Runtime operations | Make project services more observable | Add clearer service logs, lifecycle state, restart controls, and local URL detection. |
| Browser workflow | Make embedded browser tabs feel native to the project workspace | Improve persistence, dev-server URL handoff, and failure states. |
| Packaging quality | Reduce release surprises | Review native module rebuilds, package contents, code signing, and notarization path. |
| Test coverage | Cover high-risk UI and IPC behavior | Add focused renderer/component coverage around protocol, terminal tabs, and Settings flows. |

## Later Directions

- GitHub repository metadata beyond local Git remotes.
- Deployment command integration.
- Richer agent session recovery and task handoff.
- Cross-project search and triage views.
- User-facing onboarding for first project, first terminal, and first protocol install.

## Non-Goals For Now

- Running agents as hidden background services.
- Discovering projects from arbitrary filesystem locations without explicit project selection.
- Cloud-hosted project state outside explicit GitHub-backed team context sync.
- Mobile or small-screen layout support.
