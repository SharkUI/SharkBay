---
kind: sharkbay_task
taskId: C9M4K2-u3960864-m81ae10
taskTag: C9M4K2
mode: quick
title: 覆盖安装侧栏对齐的 Desktop
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-23T14:29:12Z
updatedAt: 2026-11-23T14:29:32Z
completedAt: 2026-11-23T14:29:32Z
---

## Summary
侧栏对齐后的 Desktop 已覆盖 /Applications/SharkBay.app 并启动。

## Files
- .sharkbay/tasks/C9M4K2-u3960864-m81ae10-install-desktop-sidebar.md
- /Applications/SharkBay.app
- ~/Library/Application Support/SharkBay/Desktop Backups/sidebar-parity-C9M4K2/SharkBay.app.backup

## Work
- 参考 P9K4M2-u3960864-m81ae10 和 D8M4K2-u3960864-m81ae10。按用户授权逐字复制已验收的本机预览包，保留现有 App 的回退副本。
- 暂存后验证签名，原位替换并启动。核对新界面渲染和独立 Runtime 的连接。
- 已原位替换应用并打开新版，前一份安装包作为回退备份。

## Verification
- 安装包和回退备份通过严格签名校验，安装 ASAR 的 SHA-256 与已验收预览包逐字节匹配。
- 启动日志确认连接原 Runtime 并加载渲染器，桌面进程仍运行。17777 监听 PID 一致，API 返回 HTTP 200。


## Notes
