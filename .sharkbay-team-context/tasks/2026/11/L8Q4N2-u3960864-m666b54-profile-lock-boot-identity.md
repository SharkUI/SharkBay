---
kind: sharkbay_task
taskId: L8Q4N2-u3960864-m666b54
taskTag: L8Q4N2
mode: task
title: Prevent profile lock PID reuse after reboot
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 666b54
agent: Codex GPT-6
branch: main
createdAt: 2026-11-24T12:04:41Z
updatedAt: 2026-11-24T12:11:55Z
completedAt: 2026-11-24T12:11:55Z
---

## Summary
Fixed the 103 runtime refusing startup after reboot when a stale lock PID was reused by an unrelated system process. Added same-machine boot identity, preserved conservative lock ownership checks, and restored the existing system runtime without desktop login.

## Files
- src/runtime/profile-lock.ts
- tests/profile-lock.test.ts

## Work
- Read project AGENTS and Harness, searched team context. CodeGraph CLI is absent; inspected exact source and installed module, which match the current lock logic.
- Operational evidence is tracked separately in shark.zj.cn L8Q4N2-u3960864-m8c3ff3; do not copy runtime locks, tokens or private state into this repository.
- Preserve current-boot live-owner and unverified-owner protection. Add same-machine boot identity so a known previous boot can be reclaimed even when its PID has been reused.

- New lock records store a SHA-256 machine marker and the macOS boot UUID. Recover a verified previous boot on this machine even if its PID is alive; keep current-boot live owners and foreign/unverified identity locked. Preserve existing recovery guards, double-lock acquisition and token-checked release.
- Deployed only compiled profile-lock.js after checking the original module hash. Confirmed the two legacy locks predate this boot, now point to root audioanalyticsd and have no runtime listener; archived them under recovery guards in private ~/Services/shark-prelogin/deployments/L8Q4N2-20261124T120925Z/. No lock contents or receipts enter Git.
- Original system KeepAlive automatically started PID2198 at 20:09:44. Model308 and gateway313 remained running; no configuration, session or database cleanup.

## Verification
- Tests first: 4 new cases failed and 6 passed before implementation; all 10 passed after the fix, including independent-process races, reused live PID, live/current boot, foreign host, unavailable identity and partial acquisition rollback.
- Production checkout has no development dependencies. Ran isolated copies of these two exact files on the workstation using existing read-only development dependencies; strict single-module TypeScript compilation passed. Did not install server dependencies or claim a full runtime build/all-project test run.
- Before-login UID501 target fixtures passed actual identity availability and prior-boot live-PID recovery. Installed module SHA256: e04d5678b8b0221f72a575bbf8d6dc8d223d5d3f128f4560fa7c1a6abd181fde.
- IP17777 and trusted HTTPS page/assets/capabilities returned200; WSS hello and cross-origin403 passed. New locks record2198/current boot/mode0600. Model health200, all three real/effectiveUID501/GID20, console=root and no gui/501.
- git diff --check passed. No subsequent real reboot, full Agent workflow or rollback drill after this patch.

## Notes
- Preserve all application configuration, tasks, prompts and usage databases. No Git commit or push is authorized for this separate repository in this step.
- A complete application upgrade must include this uncommitted source fix before replacing the patched installed module. Never restore the archived stale locks into an active profile. Workstation source checkout is unrelated and has concurrent changes; it was not edited.
