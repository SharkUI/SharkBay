---
kind: sharkbay_task
taskId: R6M2K8-u0-m854bf2
taskTag: R6M2K8
mode: quick
title: 核对 Linux 测试环境可用性
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T08:41:17Z
updatedAt: 2026-11-21T08:47:38Z
completedAt: 2026-11-21T08:47:38Z
---

## Summary

测试 VM 的 JavaScript 和 CSS 文件为空，Chrome 因此只加载文档外壳。已重新构建静态资源并更新入口版本，Chrome 原标签已恢复连接。

## Files

- 本任务记录。
- 测试 VM 的前端静态入口、JavaScript 和 CSS。

## Work

- 关联 V7M4Q2-u0-m854bf2、N6H4R8-u0-m854bf2。初步检查宿主端口及 VM 当前状态。
- 核对 VM 启停日志、WebUI 服务、宿主静态入口和运行时连接。

- 日志显示本次 VM 在 16:40（北京时间）启动，开始排查时服务与端口已恢复。未查明启动前中断的触发原因。

- 继续排查 Chrome 的访问报告，核对同一测试地址的新请求与 Runtime 连接。

- Chrome DevTools 显示首页为 HTTP 200，但 JS、CSS 的缓存大小为零。宿主无缓存请求以及客体文件检查确认当前入口的两项资源都是 0 字节。
- 根据 VM 现有源码重新构建，检查产物非空后替换资源及入口，更新入口引用的缓存地址。发布前检查新版产物非空，替换资源后、切换入口后分别同步文件系统。文件变空的触发原因未确认。

## Verification

- Lima 实例 Running，`sharkbay-webui.service` active，宿主 `127.0.0.1:17877` 正常监听。首页、静态资源及 capabilities 正常返回。
- 宿主 WebSocket 握手成功，项目扫描返回 2 个项目。Safari 刷新后显示已连接、main 和 feature/newton。
- 宿主直连新版脚本和样式，实际读取 1,731,116 和 122,627 字节。Runtime PID 仍为 856，未重启。
- Chrome 调试标签普通刷新恢复，随后关闭调试标签并刷新用户原标签，显示项目列表与已连接。未改浏览器设置。
