---
kind: sharkbay_task
taskId: H8V4R6-u3960864-m81ae10
taskTag: H8V4R6
mode: quick
title: 恢复本机 Linux VM WebUI
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1f8af-961b-7d72-ba10-95f14e89dfa1
branch: main
createdAt: 2026-11-20T15:23:42Z
updatedAt: 2026-11-20T15:24:14Z
completedAt: 2026-11-20T15:24:14Z
---

## Summary

启动已停止的 sharkbay-linux VM，恢复 Mac 本地 127.0.0.1:17877 的 SharkBay WebUI。

## Files

- 无项目源码文件改动。

## Work

- 对照 VM 配置任务 L9V4M2-u3960864-m81ae10。Lima 显示 sharkbay-linux 为 Stopped，Mac 的 17877 没有监听，HTTP 连接被拒绝。
- 将启动已有实例，并检查用户服务、宿主端口转发和浏览器页面。

- 使用 limactl start 启动原有实例，VM 内已有用户服务随启动恢复。

## Verification

- Lima 为 Running，sharkbay-webui.service 为 active，宿主 127.0.0.1:17877 返回 HTTP 200。
- Mac Chrome 加载网页成功，项目扫描请求成功并显示 SharkBay 项目。

## Notes

- 上一轮 Lima 主机代理收到 SIGTERM，信号来源未确认。
