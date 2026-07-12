---
kind: sharkbay_task
taskId: W6N3K9-u3960864-m81ae10
taskTag: W6N3K9
mode: task
title: Transcript incremental indexing
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 9e2de4aa-5299-4c79-bfb6-8a363f3ba64f
branch: fix/node-cpu-codegraph-lifecycle
dependsOn: []
createdAt: 2026-06-09T09:33:03Z
updatedAt: 2026-06-09T15:08:21Z
completedAt: 2026-06-09T15:08:21Z
commits:
  - 842dff6a
---

## Summary
Cut idle/startup CPU+IO from transcript indexing without hiding any history.
TokenUsageCollector.backfill now skips files whose size+mtime are unchanged
since the last scan (persisted in a new file_index table), instead of
re-reading every Claude/Codex/Kiro transcript on each startup. AgentSessionWatcher
now caches file discovery and refreshes it on an interval rather than
re-enumerating every Claude project directory on each 1s poll. Part 2 of issue #15.

## Files
- src/main/token-usage-db.ts
- src/main/token-usage-collector.ts
- src/main/agent-clis.ts
- tests/token-usage-collector.test.ts
- tests/agent-clis.test.ts

## Work
- token-usage-db: added a file_index table (source_file PK, mtime_ms, size,
  scanned_at) plus getFileIndex/setFileIndex and a FileIndexEntry type. Stores
  only scan metadata; token_events history is untouched.
- collector.backfillFile: stat first; skip readFile entirely when size+mtime
  match the recorded scan; otherwise process from getLastOffset and record the
  new scan. Same guard added to backfillKiroSessions, replacing the coarse
  hasEvent(file,0) check — re-reads on growth are idempotent (INSERT OR IGNORE)
  and now also pick up new turns in an existing session.
- Extracted pure isTranscriptFileUnchanged(indexed, stat) for the skip decision.
- agent-clis watcher: added discoveryIntervalMs (default 5s) and a cached
  discoveredFiles list; scan() now polls cached files' content every tick but
  re-enumerates directories only every interval. Extracted pure
  shouldRefreshDiscovery() for the cache decision.
- Tests: added isTranscriptFileUnchanged cases (collector test) and
  shouldRefreshDiscovery cases (agent-clis test).

## Verification
- `npm run typecheck` — pass.
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/token-usage-collector.test.ts tests/agent-clis.test.ts tests/token-usage-db.test.ts` — 11 pass.
- `npm run build` — pass.
- Full `npm test`: 184 pass; same 2 pre-existing unrelated failures
  (prompt-store, harness).
- Native better-sqlite3 cannot load under vitest (built for Electron), so DB
  file_index is covered via the extracted pure decision helper rather than a
  live DB round-trip, matching the existing token-usage-db test approach.

## Notes
- Issue: https://github.com/SharkUI/SharkBay/issues/15 (problem 2).
- HARD CONSTRAINT honored: no last-24h / max-N-files cap. All history stays in
  the DB and visible; only re-reading of unchanged files is avoided.
- DEFERRED (out of scope, separate follow-up): backfill as a foreground
  background task with progress/pause UI and an explicit range selector. The
  mtime/size skip already removes the repeated cost, and backfill is already
  invoked fire-and-forget at startup (electron/ipc.ts).
- No prerequisite tasks; independent of the CodeGraph track (A/B/C).
