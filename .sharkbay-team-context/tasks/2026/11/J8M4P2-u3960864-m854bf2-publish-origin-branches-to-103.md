---
kind: sharkbay_task
taskId: J8M4P2-u3960864-m854bf2
taskTag: J8M4P2
mode: task
title: 提交远端分支功能并部署到 103
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T11:28:15Z
updatedAt: 2026-11-21T11:34:27Z
completedAt: 2026-11-21T11:34:27Z
commits:
  - c51e4ea54e46aa2ebf1ff9ca73703cf2405df082
---

## Summary

c51e4ea 已推送到 linux-webui，并在 103 上接管独立 WebUI 的 17777 端口。两个项目及配置已保留，浏览器验证远端分支和云图标可见。

## Files

- docs/current-facts.md
- src/main/worktree.ts
- src/shared/types.ts
- src/shared/application-api.ts
- src/runtime/application-input.ts
- src/runtime/application-runtime.ts
- src/renderer/types.ts
- src/renderer/bridge/web-bridge.ts
- src/renderer/App.tsx
- src/renderer/project-worktrees.tsx
- src/styles/app.css
- tests/web-runtime-integration.test.ts
- 103 的 `~/.sharkbay/install/webui-J8M4P2-c51e4ea/` 以及 `~/Library/LaunchAgents/xyz.sharkbay.webui.plist`。

## Work

- 提交本轮 Other branches 与云图标改动，关联 Q7F4M8-u3960864-m854bf2 和 B7G4R8-u3960864-m854bf2。复用 H6V4P8-u0-m854bf2 的独立 WebUI 安装方式。
- 验证候选快照，推送并核对 GitHub 分支哈希。用同一提交在 103 独立暂存，隔离验证 Runtime 与 WebUI 后切换服务并保留回退路径。
- 103 当前有两个新运行的终端，已告知切换会结束它们。暂存期间保留旧服务，切换前重新检查终端状态。

- 已创建提交 `c51e4ea`，范围为本轮 12 个文件。

- 已推送 c51e4ea 并在 103 暂存 arm64 构建和新 LaunchAgent。暂存沿用现有签名 Node 与相同版本的生产依赖。

- 用户确认切换。保留当前 LaunchAgent 和共享配置快照，正常切换到已暂存的 c51e4ea 后核对端口、提交和项目。

- 通过原用户 LaunchAgent 切换到新版 Runtime。切换前保存原 LaunchAgent 和配置，旧进程退出后再备份共享 Runtime 数据。

## Verification

- 暂存区 `git diff --check`、类型检查、690 项单元测试和 17 项 WebUI 集成测试通过。

- GitHub 的 linux-webui 引用和本地提交一致。编译产物校验和、包依赖锁文件比对、新 plist 校验和签名 Node 校验通过。
- 103 隔离构建通过 HTTP 静态页、WebSocket、实际 PTY 和服务关闭测试。正式服务待会话处理后切换。

- 再次检查 103，两个活跃会话均连接中，现用 LaunchAgent 与暂存的回退文件逐字节一致。

- 103 新 Runtime PID 60338，旧进程已退出。配置与切换前逐字节一致，两个项目保留，切换后零活动终端。
- 从本机 Chrome 访问 103，新 JS、CSS 和 capabilities 返回 200。两个 Git 工作区返回远端分支数据，确认 team context 被过滤且云图标已渲染。

## Notes

- 可通过 103 部署目录下的 `previous-agent.plist` 恢复 f73e3b2，旧 Runtime 目录和 `previous/` 内的配置与完整数据快照已保留。
