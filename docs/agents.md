# Agent Guide

This file provides guidance to automation agents and contributors when working in this repository.

## Project Overview

- Product: SharkBay
- Project type: local-first macOS app / developer tool
- Current repository mode: product source for a generic Git project workbench

## Required Reading

Start with public project context:

- `README.md` - project overview and development commands
- `docs/product.md` - product requirements, when present
- `docs/architecture.md` - architecture and module boundaries, when present
- `docs/roadmap.md` - near-term product direction
- `scripts/README.md` - validation script conventions

Some older clones may still contain private local work-state directories. Treat those as user data. Do not recreate or modify local task histories unless the user explicitly asks.

## Development Commands

| Action | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Start dev server | `npm run dev` |
| Run lint/static check | `npm run lint` |
| Run typecheck | `npm run typecheck` |
| Run tests | `npm test` |
| Build | `npm run build` |
| Check whitespace | `git diff --check` |

## Automation Scripts

Use `scripts/` for project-local validation helpers that make verification repeatable.

Conventions:

- Prefer small scripts with clear names, such as `scripts/check-fixtures.ts`.
- Scripts must print useful pass/fail evidence.
- Scripts should return non-zero on failure.
- Do not hide important failures behind broad catch blocks.
- Record script command, exit code, and output excerpt in the relevant task notes or final report.

## Code Review Preconditions

Before completing review-level work, run the checks relevant to the touched surface.

Prefer this order:

1. lint
2. typecheck
3. unit tests
4. build
5. task-specific verification scripts

If a command is unavailable, record the missing command and residual risk.

## Key Constraints

- Work inside this repository.
- SharkBay itself must only manage directories configured by the user inside the app.
- Runtime IPC/service entry points must treat persisted configured roots as authoritative; renderer-supplied roots are not trusted.
- Preserve user changes.
- Prefer small, reviewable changes.
- Do not skip review or verification gates.
- Do not weaken filesystem, IPC, schema, credential, production-data, or destructive-action safeguards in the name of simplicity.

## Behavioral Discipline

- Clarify material ambiguity before implementation by recording assumptions, tradeoffs, or blocking questions.
- Prefer the simplest implementation that satisfies the task.
- Keep changes traceable to the user goal, review finding, or verification failure.
- Map each done criterion to concrete verification evidence.
