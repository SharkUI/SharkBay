---
kind: sharkbay_task
taskId: GHB7K2-u3960864-m81ae10
taskTag: GHB7K2
mode: task
title: Add GitHub info (issues / PRs / release) to project Git panel
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 0bce879a-3d63-40fc-a823-8abf1670faaf
branch: main
createdAt: 2026-06-11T08:00:21Z
updatedAt: 2026-06-11T08:20:00Z
completedAt: 2026-06-11T08:20:00Z
commits:
  - 13166535
  - 784987f0
---

## Summary
Upgrade the project detail Git tab with GitHub data fetched via `gh`: open
issues, open pull requests, and latest release. Fetched lazily and separately
from `getProjectDetail` so it never blocks the fast local git detail load, and
degrades gracefully when `gh` is missing, unauthenticated, or the repo is not on
GitHub.

## Files
- src/shared/types.ts
- src/main/github.ts
- src/core/execution-provider.ts
- src/providers/local/local-provider.ts
- src/core/core-protocol.ts
- src/core/core-service.ts
- src/shared/ipc-channels.ts
- electron/core-host.ts
- electron/ipc.ts
- electron/preload.mts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/styles/app.css
- tests/github.test.ts
- tests/ipc-channels.test.ts

## Work
- Explored data flow: getProjectDetail -> provider git methods -> IPC chain
  (ipc-channels / core-protocol / core-host / ipc.ts / preload) -> renderer
  bridge -> ProjectDetailPane/GitDetailTab. CodeGraph status is the model for a
  separate async secondary fetch.
- Decision: new IPC method `readProjectGitHub` (lazy, panel-triggered) instead
  of embedding gh calls into getProjectDetail (gh is network/auth bound).
- src/main/github.ts: `readGitHubInfo(repoPath)` uses `gh repo view` as an
  availability guard, then runs issue/pr/release list in parallel; each errors
  to empty. Exposed parse helpers (parseGitHubIssues, parseGitHubPullRequests,
  parseLatestGitHubRelease) for testing. gh runs with execFile, 8s timeout.
- Wired the full IPC chain + preload + renderer bridge (`projects.getGitHub`).
- GitDetailTab fetches GitHub info on candidate.uri when git-managed; renders
  GitHubCards (Open Pull Requests with draft/review badges + head branch; Open
  Issues with labels), each row opens its URL in a browser tab. Latest release
  surfaces as a fact in ProjectFactsCard. Cards hide entirely when gh is
  unavailable or there are no open issues/PRs.
- Reused subpanel / row styling; added github-* CSS incl. night theme.
- Updated tests/ipc-channels.test.ts for the new channel.
- Follow-up fix (commit 784987f0): cards showed in dev but vanished in packaged
  builds. Cause: macOS GUI apps get a minimal PATH; gh lives under Homebrew
  (/opt/homebrew/bin), not on that PATH, while git is at /usr/bin so it kept
  working. Fixed github.ts to resolve gh's absolute path via resolveCommandPath
  and run it with a PATH augmented by resolveCommandSearchPaths (gh shells out
  to git, so it needs an enriched PATH too).

## Verification
- npm run typecheck: pass.
- npx vitest run: 44 files / 189 tests pass (incl. tests/github.test.ts).
- npm run build: pass (tsc + vite).
- Confirmed live `gh` output for SharkUI/SharkBay matches parser expectations.
- Confirmed diagnosis: `which gh` => /opt/homebrew/bin/gh, `which git` =>
  /usr/bin/git (explains why git worked but gh did not when packaged).

## Notes
- gh JSON fields confirmed: issue/pr list expose number,title,author,createdAt,
  url,labels (+ pr: headRefName,isDraft,reviewDecision); release list exposes
  tagName,name,publishedAt,isLatest,isPrerelease (no url).
- Only LocalProvider implements ExecutionProvider.
