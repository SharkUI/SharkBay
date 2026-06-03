---
kind: sharkbay_task
taskId: P4K7V9-u3960864-m81ae10
taskTag: P4K7V9
mode: task
title: Integrate Cursor CLI as supported agent
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 93a07dd7-f709-42e8-872e-43726d1b8694
branch: main
createdAt: 2026-06-03T02:53:14Z
updatedAt: 2026-06-03T03:06:18Z
completedAt: 2026-06-03T03:06:18Z
commits:
  - 21c68c57
---

## Summary
Added Cursor CLI (cursor-agent) as a fully supported agent in SharkBay with hooks connector, detection, bootstrap injection, session restore, and labels. Build passes.

## Files
- src/plugins/bundled/agent-detector.ts
- src/main/hooks/connectors/cursor.ts (new)
- src/main/harness.ts
- src/shared/agent-session-restore.ts
- src/core/core-service.ts
- electron/ipc.ts
- .sharkbay/harness/agent-session-id.sh

## Work
- Added cursor to agentDefinitions with command "cursor-agent" and curl install recipe
- Created CursorConnector class implementing AgentConnector interface
  - Config: ~/.cursor/hooks.json (version:1 schema)
  - Events mapped: sessionStart→session_start, beforeSubmitPrompt→prompt, beforeShellExecution→tool_start, afterShellExecution/afterFileEdit→tool_end, stop→turn_end, sessionEnd→session_end
  - Session ID read from hook payload's session_id field
- Added bootstrap injection via positional arg (cursor-agent "prompt")
- No --session-id injection needed (Cursor provides session_id in hook stdin)
- Added session restore: cursor-agent --resume <chatId>
- Added labels: "Cursor CLI" / "Cu"
- Added session ID detection in shell script: maps PWD to Cursor project dir, reads most recent transcript dir name
- Registered CursorConnector in hookConnectors map

## Verification
- `npm run build` passes (tsc + vite, 0 errors)
- `agent-session-id.sh "Cursor CLI"` returns correct session ID from transcript dir

## Notes
- Prior research: H7K4M9-u3960864-m81ae10
- Cursor hook payload confirmed: session_id in every event via stdin JSON
- Hook config: ~/.cursor/hooks.json with version:1 schema
- Events: sessionStart, sessionEnd, beforeSubmitPrompt, stop, beforeShellExecution, afterShellExecution, afterFileEdit, beforeReadFile
- Session resume: cursor-agent --resume <chatId>
- Bootstrap: positional arg (cursor-agent "prompt text")
- No --session-id flag; session_id comes from hook payload directly
