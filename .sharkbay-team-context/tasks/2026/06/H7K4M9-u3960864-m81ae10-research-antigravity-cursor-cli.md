---
kind: sharkbay_task
taskId: H7K4M9-u3960864-m81ae10
taskTag: H7K4M9
mode: task
title: Research Antigravity CLI and Cursor CLI integration feasibility
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 93a07dd7-f709-42e8-872e-43726d1b8694
branch: main
createdAt: 2026-06-02T11:21:59Z
updatedAt: 2026-06-02T11:26:38Z
completedAt: 2026-06-02T11:26:38Z
---

## Summary
Both Antigravity CLI and Cursor CLI are feasible to integrate. Antigravity is near-zero-cost (inherits Gemini hook protocol exactly). Cursor CLI is moderate effort (~200-250 lines new connector) with a known sessionStart bug requiring positional-arg bootstrap workaround.

## Files
- (research only — no project files modified)

## Work
- Mapped SharkBay's 5-point agent integration surface (AgentConnector, detector, bootstrap args, session restore, labels)
- Confirmed Antigravity CLI uses identical hook protocol to Gemini CLI (same settings.json schema, same lifecycle events, same stdin JSON format); only configPath and binary name differ
- Confirmed Cursor CLI hooks use a different format (hooks.json with version:1 schema, different event names) but mappable to SharkBay's UnifiedHookEvent
- Identified Cursor sessionStart additional_context injection bug (confirmed by Cursor team, no ETA for fix) — workaround: use positional arg for bootstrap
- Confirmed both agents support session resume (agy --resume, cursor-agent --resume)

## Verification
- Research deliverable only; no code changes to verify.
- Sources: official Gemini/Antigravity docs (geminicli.com, antigravity.codes), Cursor docs/changelog/forum, existing SharkBay connector code.

## Notes
- Antigravity: binary is `agy`, config at `~/.gemini/antigravity-cli/settings.json`, hook format identical to Gemini, supports `-i` for prompt injection, `--resume` for sessions. Recommend keeping existing gemini connector alongside new antigravity connector.
- Cursor: binary is `cursor-agent`, config at `~/.cursor/hooks.json`, reads AGENTS.md automatically, bootstrap via `cursor-agent chat "prompt"`, resume via `--resume [chatId]`. Hook stdin payload field names need runtime verification after install.
- Gemini CLI sunset: June 18, 2026 — Antigravity migration is urgent.
- Open Island (team-context R4V8K2) already researched similar agent integration patterns; that spec covers bidirectional hooks which could benefit Cursor's richer hook output schema.
