---
kind: sharkbay_task
taskId: D8M4K2-u3960864-m81ae10
taskTag: D8M4K2
mode: quick
title: 替换本机 SharkBay 桌面应用
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-23T13:55:03Z
updatedAt: 2026-11-23T13:55:28Z
completedAt: 2026-11-23T13:55:28Z
---

## Summary
本机 /Applications/SharkBay.app 已替换并启动，继续连接原 npm Runtime。旧版已移出安装目录备份。

## Files
- .sharkbay/tasks/D8M4K2-u3960864-m81ae10-replace-local-mac-desktop.md
- /Applications/SharkBay.app
- ~/Library/Application Support/SharkBay/Desktop Backups/v0.3.13-D8M4K2/SharkBay.app.backup

## Work
- 参考 M8K4Q2-u3960864-m81ae10、N7K4W2-u3960864-m81ae10。用户授权原位替换旧桌面应用，保持单一安装入口。
- 核对 17777 由独立 npm Runtime 提供，替换前验证桌面包签名并保留旧应用备份。启动新版核验连接和渲染。
- 将经验证的包原位安装，旧签名包以 .backup 后缀保存于用户 Library。

## Verification
- 新应用及旧备份均通过 codesign --verify --deep --strict，确认用户 Applications 目录没有第二份 Desktop 安装。
- 新应用日志确认 existing-runtime-connected 与 main-renderer-loaded，桌面进程存活。17777 同一 PID 持续提供 API 并返回 HTTP 200。


## Notes
- 当前安装为本机 ad hoc 签名测试包，备份可供回退。
