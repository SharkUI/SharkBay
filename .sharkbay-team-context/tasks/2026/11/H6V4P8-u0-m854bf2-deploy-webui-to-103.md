---
kind: sharkbay_task
taskId: H6V4P8-u0-m854bf2
taskTag: H6V4P8
mode: task
title: 核验并将 103 切换到独立 WebUI
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T10:47:48Z
updatedAt: 2026-11-21T10:52:48Z
completedAt: 2026-11-21T10:52:48Z
---

## Summary

103 已用 linux-webui@f73e3b2 的原生 macOS arm64 Runtime 接管 17777，浏览器可以访问工作树及分支。当前用户的 LaunchAgent 在登录时启动，旧桌面 v0.3.13 和切换前配置保留供回退。

## Files

- 本地任务记录。

- 103 的 `~/.sharkbay/install/webui-H6V4P8-f73e3b2/`，用于暂存独立 Runtime、回退材料和部署验证。

- 103 的 `/Applications/SharkBay.app` 原安装及 `~/Library/LaunchAgents/xyz.sharkbay.webui.plist`。

## Work

- 关联 R4P8C3-u3960864-m81ae10、L6P3R9-u3960864-m81ae10 和 C7P9W4-u0-m854bf2。部署候选为 linux-webui@f73e3b2，目标是 103 上独立的 macOS arm64 Runtime 和浏览器界面。
- 先检查 103 的 SSH、安装路径、配置及活动终端，再隔离验证候选。切换需能保留现有应用和配置以回退。

- 确认 103 为 arm64，目前 v0.3.13 应用运行共享 Runtime，配置里有两个项目，两个终端正在运行。已告知切换会中断会话，隔离验证期间保留日常进程。
- 提交的依赖清单与 v0.3.13 相同。复用已签名的 arm64 Node 和同版本生产依赖，在独立目录更新 Runtime 编译产物及静态界面。

- 用户确认允许关闭 103 上的终端。切换前备份应用和共享配置，沿用已有 Runtime 数据目录和 17777 端口，使用当前用户的 LaunchAgent 启动。

- 旧桌面应用收到 SIGTERM 后未退出，首轮在停止 Runtime 前中止。随后通过 macOS 正常退出请求关闭桌面，继续切换。

- 正常关闭旧 Runtime 及两个终端，将旧应用移入 `previous/SharkBay.app`，备份完整旧 Runtime profile 和两份配置。启用 `xyz.sharkbay.webui`，原样复用日常配置和端口。

## Verification

- macOS arm64 编译通过，候选与远端分支哈希一致。103 上锁文件与已安装包匹配，传输校验和签名 Node 验证通过。候选使用隔离 profile 通过实际 HTTP、WebSocket、PTY 及停止清理测试。

- 103 的 LaunchAgent 正在运行，PID 74740。旧桌面、Runtime 及原来两个 PTY 的 PID 均退出。新服务列出两个原有项目和零个活动终端。两份配置与备份逐字节一致，备份的 v0.3.13 应用通过严格签名验证。
- 从本机 Chrome 访问局域网地址，首页、主 JS、CSS 和 capabilities 返回 200，实际渲染两个项目，浏览器桥接成功读取 Git 工作树及分支。隔离测试覆盖真实 PTY，日常项目上未创建测试会话。Git 工作区干净。

## Notes

- 回退材料保存在 103 的 `~/.sharkbay/install/webui-H6V4P8-f73e3b2/previous/`。回退时先卸载用户 LaunchAgent，再恢复旧应用。
- 本地隔离构建目录为 `/tmp/sharkbay-H6V4P8.OcsqDY`。部署使用现有提交，无新提交。
