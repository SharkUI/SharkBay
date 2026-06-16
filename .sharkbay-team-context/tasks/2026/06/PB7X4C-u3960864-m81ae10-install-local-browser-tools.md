---
kind: sharkbay_task
taskId: PB7X4C-u3960864-m81ae10
taskTag: PB7X4C
mode: task
title: Install local browser tools
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019ed083-35b9-71c3-8592-c500645eda87
branch: main
createdAt: 2026-06-16T13:18:43Z
updatedAt: 2026-06-16T13:22:18Z
completedAt: 2026-06-16T13:22:18Z
---

## Summary
Configured this machine so SharkBay terminal agents can try browser automation locally via `agent-browser` and `playwright`.

## Files
- .sharkbay/tasks/PB7X4C-u3960864-m81ae10-install-local-browser-tools.md

## Work
- Reviewed team context task Q8D4M2-u3960864-m81ae10, which noted prior Browser/computer-use availability issues.
- Started with a local-machine setup scope: install or expose terminal-callable browser automation without changing SharkBay business code unless needed.
- Installed `agent-browser@0.27.3` and `playwright@1.61.0` into the current nvm global npm prefix.
- Installed Playwright Chromium and ran `agent-browser doctor --fix` to generate local state and verify headless launch.
- Confirmed SharkBay terminal PATH handling discovers nvm bin directories, so spawned agent terminals should see the installed commands.

## Verification
- `playwright --version` prints `Version 1.61.0`.
- `agent-browser --version` prints `agent-browser 0.27.3`.
- `NODE_PATH=$(npm root -g) node ...` launched Chromium through Playwright and read a test page title/button.
- `agent-browser open ... && agent-browser snapshot -i && agent-browser screenshot /tmp/sharkbay-agent-browser-check.png && agent-browser close` succeeded.
- `zsh -lic 'command -v agent-browser && agent-browser --version && command -v playwright && playwright --version'` finds both commands.
- `env -i HOME="$HOME" SHELL="$SHELL" PATH="/usr/bin:/bin:/usr/sbin:/sbin" zsh -lic 'command -v agent-browser && command -v playwright'` finds both commands.

## Notes
- User wants to experience local browser automation first, then decide how SharkBay should deploy it to users.
