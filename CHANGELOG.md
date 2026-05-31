# Changelog

## [0.2.1] — 2026-05-31

### Added
- Sessions detail panel for browsing and restoring agent sessions per project
- Hook-based agent status system (working/idle/attention indicators)
- Bottom prompt input bar for agent CLI terminals
- OpenCode hook connector via JS plugin
- Auto-derive session title from first meaningful user prompt
- Session model version display for Claude, Kiro, and Gemini
- Right-click context menu in file tree panel
- Init action prompts in Sessions, Git, and Files detail panels
- Protocol install without git; team sync gated on GitHub remote
- AGENTS.md bootstrap support for directing agents to project conventions
- GitHub avatar caching in localStorage

### Changed
- Rename DeepSeek to CodeWhale
- Require protocol file for bootstrap injection
- Remove agent CLI download shortcut
- Remove terminal status fallback

### Fixed
- Hook PID-based session→tab resolution replacing heuristic tab mapping
- Stable socket path to survive app restarts
- Stale session silent expiry instead of emitting idle
- Idle dot suppression on active tab
- Active tab idle excluded from project pill aggregation
- Tab focus clears idle dot correctly
- Per-session status dot on agent tabs
- Session-id injection skipped when command has --resume
- Terminal input bar growth no longer triggers terminal redraw
- Bottom input focus maintained on tab switch
- Codex hook config schema
- Kiro hooks installed into agent config instead of settings.json
- Kiro tools wildcard included in sharkbay agent config
- Gemini nested hook format and CodeWhale session restore match
- Session model label formatting
- Local-only install identity resolution preventing harness drift
- .sharkbay exclude entry added when git appears after protocol install

## [0.2.0] — 2026-05-28

### Added
- Dock badge count and bounce for projects needing attention
- `--trust-all-tools` launch option for Kiro CLI

### Changed
- Rename Teamwork to Task Protocol across documentation and source

### Removed
- Remote machine (SSH) functionality
- Stack detail panel and unused profiles IPC bridge

### Fixed
- Startup flash: defer window.show, parallelize scan, fix terminal toolbar layout

## [0.1.1] — 2026-05-28

### Added
- CodeGraph project indexing support with init, PATH handling, and gitignore management
- Token usage tracking with SQLite storage and detail window
- Agent CLIs settings panel with install, launch options, and permission flags
- Task session restore affordance
- DeepSeek, Kiro, Qwen, and OpenCode session id support

### Changed
- Switch PTY to @lydell/node-pty with Bun runtime fallback
- Upgrade command-path resolver to load PATH from user's login shell
- Redesign settings to Codex-style layout with SVG theme cards
- Rename bundled plugin metadata
- Release under GPLv3

### Fixed
- BrowserView bounds under zoom
- nvm command discovery (PR #11)
- Token usage cache accounting
- Restored session id lookup
- Agent launch: quote command path separately from flags
- Renderer minification crash with xterm.js
- opencode launch with delayedBootstrapPrompt

## [0.1.0] — 2026-05-09

Initial public release. macOS workbench for multi-agent vibe coding with support for Claude Code, Codex, Gemini, Kiro, DeepSeek, Qwen, and OpenCode.
