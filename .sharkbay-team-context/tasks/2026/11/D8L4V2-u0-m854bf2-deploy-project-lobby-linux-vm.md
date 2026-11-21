---
kind: sharkbay_task
taskId: D8L4V2-u0-m854bf2
taskTag: D8L4V2
mode: task
title: 部署项目大厅至 Linux VM 测试环境
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T04:53:30Z
updatedAt: 2026-11-21T04:56:12Z
completedAt: 2026-11-21T04:56:12Z
---

## Summary

已部署当前 linux-webui 的项目大厅至 sharkbay-linux。宿主测试入口 http://127.0.0.1:17877/ 可打开新版大厅。

## Files

- VM ~/SharkBay 的 13 个补丁文件，以及 dist-runtime/、dist/。
- VM ~/.sharkbay/deployments/D8L4V2/ 中的补丁和回退构建。

## Work

- 参考 P8L4W6-u0-m854bf2 的首期实现、V7M4Q2-u0-m854bf2 的环境约定和 L9V4M2-u3960864-m81ae10、H8V4R6-u3960864-m81ae10 的 VM 验证记录。
- 宿主工作结果基于 cd9926f，包含 13 个未提交的已跟踪文件。先核对 VM 基线和活动终端，再从该快照在 Linux 构建。

- VM 基线与宿主一致，初查没有终端会话。已通过 Lima SSH 传输全量补丁，宿主与客体 SHA-256 一致，使用锁文件一致的 Linux 原生依赖在临时目录构建。

- 切换前复核终端会话为零。应用补丁，替换 Linux 构建，重启 user systemd 服务。配置逐字节保留，旧构建备份在 VM ~/.sharkbay/deployments/D8L4V2/previous/。
- 清理临时构建目录，保留补丁和回退数据。这次部署没有提交，因此 VM 的 Git HEAD 仍是 cd9926f，已部署内容为工作树补丁。

## Verification

- Linux ARM64 类型检查、verify:webui 的 HTTP/WebSocket/PTY/关停以及 12 项定向测试通过。

- 补丁 SHA-256 c6149cb530eb033d4d1f9a911ff0be5a81c9d2f3403082784b7f3b1987f4d327 与宿主和 VM 已部署差异一致。服务 active，主 PID 4326，首页与新 JS HTTP 200。
- Safari 实测打开项目大厅、进入 SharkBay 三栏工作台、查看 main 工作树、返回大厅。测试标签页保留在大厅。

## Notes

- 目标链接为宿主 http://127.0.0.1:17877/。
