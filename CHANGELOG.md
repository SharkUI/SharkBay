# Changelog

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
