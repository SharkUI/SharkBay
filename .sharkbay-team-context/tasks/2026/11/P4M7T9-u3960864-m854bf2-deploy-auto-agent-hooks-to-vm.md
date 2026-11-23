---
kind: sharkbay_task
taskId: P4M7T9-u3960864-m854bf2
taskTag: P4M7T9
mode: task
title: 将 Agent Hooks 自动注册部署到 Linux VM
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: linux-webui
createdAt: 2026-11-23T06:16:11Z
updatedAt: 2026-11-23T06:21:00Z
completedAt: 2026-11-23T06:21:00Z
---

## Summary
已部署当前 worktree 至 Lima sharkbay-linux，包含 Agent Hooks 自动注册、Harness 和侧栏改动。正式服务在 http://127.0.0.1:17877/ 可用。

## Files
- .sharkbay/tasks/P4M7T9-u3960864-m854bf2-deploy-auto-agent-hooks-to-vm.md
- VM `~/.sharkbay/deployments/P4M7T9/` 下的源码、构建及回退材料。
- VM 用户服务 `sharkbay-webui.service` 的 `90-sharkbay-release.conf` 覆盖。

## Work
- 参考 D7N4K8-u3960864-m854bf2、R7V4M2-u3960864-m854bf2 与 V7M4Q2-u0-m854bf2，沿用现有 VM、端口与 Runtime 配置。
- 将当前 Git 基线、已跟踪改动和两份新增 Hooks 源文件打包，先在隔离 VM 目录构建并运行 Linux 检查，再切换服务及复验。
- 候选快照基线为 c51e4ea54e46aa2ebf1ff9ca73703cf2405df082。VM 核验四个输入文件的 SHA-256，并确认锁文件与上一版本一致。源码和 Linux 依赖在独立目录构建。
- 切换前的宿主 WebUI 握手正常，四个项目可见，初查没有运行中的终端。
- 切换前复查无运行中的终端。保存上一版本的服务覆盖文件，更新 systemd 工作目录后重启现有服务。

## Verification
- VM Linux ARM64 上 `npm run typecheck`、`npm run verify:webui` 和 `npm test` 均通过，701 项单元与回归测试全部通过。
- VM 上 `npm run test:integration` 通过 21 项，覆盖自动注册及会话隔离。
- 正式服务 active，PID 24648，进程在 P4M7T9/release，自动重启次数为 0。
- 宿主 WebUI 首页、JS 和 CSS 返回 200，资源 SHA-256 与 VM 候选一致。WebSocket 握手、Runtime API 和四个项目扫描成功，切换前后项目配置清单摘要一致。
- 正式服务项目设置返回 8 个 Hooks 条目，全部已开启。注册发生在 Agent 启动时，未在正式配置中逐个启动真实 Agent。

## Notes
- 上一版本为 R7V4M2。回退时恢复 P4M7T9/previous/90-sharkbay-release.conf，再重载 user systemd 并重启服务。VM 项目目录独立保留，未创建 Git 提交。
