---
kind: sharkbay_task
taskId: R4V8K2-u3960864-m81ae10
taskTag: R4V8K2
mode: task
title: Research open-vibe-island features for SharkBay
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 127e17de-945b-4e07-8e56-30239b52a879
branch: main
createdAt: 2026-06-01T13:30:22Z
updatedAt: 2026-06-01T14:26:11Z
completedAt: 2026-06-01T14:26:11Z
commits:
  - 18cb8eaa
---

## Summary
Committed .gitignore update and researched open-vibe-island (Open Island) architecture and features for potential integration into SharkBay.

## Files
- .gitignore
- .sharkbay/specs/hooks-bidirectional-upgrade/requirements.md
- .sharkbay/specs/hooks-bidirectional-upgrade/design.md
- .sharkbay/specs/hooks-bidirectional-upgrade/tasks.md

## Work
- Committed .gitignore changes (18cb8eaa)
- Cloned open-vibe-island to /Users/shark/Projects/open-vibe-island
- Analyzed project architecture, product scope, hook system, and roadmap
- Identified key features applicable to SharkBay
- Compared agent support lists and hook mechanisms in detail
- Created Phase 1 spec: `.sharkbay/specs/hooks-bidirectional-upgrade/`
- Reviewed spec against SharkBay code; fixed 4 design/code-reality gaps

## Verification
- Clone successful, project structure confirmed
- Spec validated against current SharkBay implementation (bridge.ts, state-manager.ts, terminal.ts, types.ts, connectors). 4 gaps found and corrected in spec:
  - Response path: EventEmitter has no return channel → redesigned as injectable async `HookRequestHandler`
  - Terminal metadata flow: `HookBridgeMessage`/`summarizeUnifiedEvent` lacked terminal → added full Message→Event→log flow-through
  - ID source: no separate tab id exists → `SHARKBAY_SESSION_ID` = `TerminalSession.id`, dropped `SHARKBAY_TAB_ID` for Phase 1
  - Sender scope: OpenCode plugin + CodeWhale script are separate senders → all three senders now in scope
- Spec is plan-only; no SharkBay source modified. Implementation deferred pending user review.

## Notes

### Spec 产出

Phase 1 实施计划已写入：`.sharkbay/specs/hooks-bidirectional-upgrade/`
- `requirements.md` — 需求文档
- `design.md` — 设计文档
- `tasks.md` — 实施任务分解

### Open Island Overview
Open Island is a native macOS (SwiftUI + AppKit) menu-bar app that lives in the notch area and provides a real-time control panel for AI coding agents. It's the open-source alternative to Vibe Island.

### Key Features Worth Learning

1. **Hook-based Agent Communication (highest priority)**
   - Uses a lightweight CLI (`OpenIslandHooks`) that agents invoke via their hook system
   - Agents pipe JSON payloads via stdin → CLI forwards over Unix socket → app processes
   - Supports bidirectional: app can block tool calls by writing JSON to stdout
   - **Fail-open**: if app isn't running, hooks exit silently — agents unaffected
   - SharkBay already has hook connectors; Open Island's approach is more mature with per-agent installers

2. **Multi-Agent Session Management**
   - Supports 10 agents: Claude Code, Codex, Cursor, Gemini CLI, Kimi CLI, OpenCode, Qoder, Qwen Code, Factory, CodeBuddy
   - Unified `AgentSession` / `AgentEvent` / `SessionState` model
   - Pure reducer pattern: `SessionState.apply(_:)` for all state transitions
   - Session discovery from local transcripts + process monitoring

3. **Terminal Jump-Back**
   - Per-terminal strategies: AppleScript (Terminal.app, iTerm2), window ID (Ghostty), Unix socket (cmux), CLI pane targeting (WezTerm, Kaku), session/window/pane (tmux, Zellij)
   - Hook payloads carry terminal metadata (app name, TTY, session ID, window title)
   - SharkBay already manages terminals; jump-back from the notch overlay is the differentiator

4. **Notch/Island Overlay UI**
   - Compact presence markers per active session in collapsed state
   - Phase-driven visual treatment for running/waiting/blocked/completed
   - Auto-height notification panel for permission requests
   - Works on both notch Macs and external displays (top-center bar fallback)

5. **Apple Watch Companion**
   - HTTP endpoint on Mac → Watch notification relay
   - Real-time agent status on wrist
   - Haptic alerts for permission requests

6. **Bridge Architecture**
   - `BridgeServer` in-app manages Unix socket connections
   - JSON line protocol (`BridgeCodec`)
   - Handles pending approvals, interactions, and task creation
   - Supports multiple concurrent client connections

### Architecture Comparison

| Aspect | Open Island | SharkBay |
|--------|-------------|----------|
| Platform | Native Swift (SwiftUI + AppKit) | Electron (TypeScript + React) |
| UI Surface | Notch overlay + settings window | Full window with terminal/browser/detail |
| Agent Comms | Unix socket + hook CLI | Hook connectors + transcript polling |
| Terminal | Jump-back only (no embedded PTY) | Embedded PTY sessions |
| State | Pure reducer (`SessionState.apply`) | React hooks + IPC events |
| Packaging | Swift Package Manager + DMG | Electron Builder + DMG |

### Recommended Integration Priorities for SharkBay

1. **Adopt the hook installer pattern** — Auto-install/uninstall hooks for each agent from SharkBay settings, with health checks
2. **Enrich session state from hook events** — Move beyond transcript polling to real-time hook-driven status (SharkBay already started this)
3. **Add a compact "island" status indicator** — A small persistent overlay or menu-bar widget showing active agent sessions
4. **Permission/approval flow** — Let SharkBay intercept and approve/deny tool calls (PreToolUse blocking)
5. **Terminal jump-back from notifications** — When an agent needs attention, one-click focus to the right terminal tab

### What NOT to Copy
- Native Swift rewrite (SharkBay's Electron approach serves its broader feature set)
- Sparkle auto-update (Electron Builder handles this)
- Provider-specific quota APIs (not on SharkBay's critical path)
