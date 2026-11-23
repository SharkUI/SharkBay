---
kind: sharkbay_task
taskId: M8K4Q2-u3960864-m81ae10
taskTag: M8K4Q2
mode: quick
title: 准备本机 macOS Desktop 安装包
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-23T13:28:31Z
updatedAt: 2026-11-23T13:29:23Z
completedAt: 2026-11-23T13:29:23Z
---

## Summary
已生成通过完整性检查的 Apple Silicon Desktop 本机安装包，并验证可连接独立 Runtime。

## Files
- .sharkbay/tasks/M8K4Q2-u3960864-m81ae10-prepare-local-mac-desktop.md
- release/desktop-preview/mac-arm64/SharkBay.app（本机预览包）

## Work
- 参考 N7K4W2-u3960864-m81ae10。原 macOS 开发验收包因框架资源签名不完整未通过严格检查。
- 重新打包独立桌面客户端，选用 electron-builder 提供的 ad hoc 签名，向用户提供本地安装命令。
- 由 electron-builder 对独立客户端 app 重新打包并执行 ad hoc 签名，输出到 release/desktop-preview。

## Verification
- 原目录与使用 ditto 复制后的副本均通过 codesign --verify --deep --strict。
- 复制版连接隔离的 npm Runtime，完成 WebUI、SQLite 和真实 PTY 验证。桌面退出后 PTY 保持运行，本机 17777 的监听 PID 一致并返回 HTTP 200。


## Notes
- 本机临时签名包，未进行公证或发布。用户可复制到 ~/Applications/SharkBay Desktop.app。
