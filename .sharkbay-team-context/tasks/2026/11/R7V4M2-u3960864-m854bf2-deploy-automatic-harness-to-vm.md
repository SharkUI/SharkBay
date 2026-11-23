---
kind: sharkbay_task
taskId: R7V4M2-u3960864-m854bf2
taskTag: R7V4M2
mode: task
title: 部署 Harness 自动安装与更新至 Linux VM
status: completed
completedAt: 2026-11-23T04:05:23Z
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: linux-webui
createdAt: 2026-11-23T03:58:47Z
updatedAt: 2026-11-23T04:05:23Z
---

## Summary
已将 linux-webui 的完整已跟踪工作树快照部署至 Lima sharkbay-linux，包含 Harness 自动安装更新、团队同步和侧栏改动。宿主入口为 http://127.0.0.1:17877/，原配置和项目目录已保留。

## Files
- .sharkbay/tasks/R7V4M2-u3960864-m854bf2-deploy-automatic-harness-to-vm.md
- VM ~/.sharkbay/deployments/R7V4M2/ 的候选源码、构建和回退材料。
- VM 用户服务 sharkbay-webui.service 的 90-sharkbay-release.conf 覆盖文件。

## Work
- 依据 V7M4Q2-u0-m854bf2 确认目标为 Lima sharkbay-linux 和宿主 127.0.0.1:17877。参考 D8L4V2-u0-m854bf2、R6M2K8-u0-m854bf2 的 Linux 构建、发布和静态资源核验记录。
- 发布 H7M4A2-u3960864-m854bf2 及其依赖 F6K9R2-u3960864-m81ae10。先核对当前服务和会话，再暂存 Linux 构建并验证后切换。
- VM 为 Ubuntu ARM64，旧服务 active，初查零终端。客体 ~/SharkBay 有本地修改，采用版本化部署目录和独立的 WorkingDirectory 覆盖，保留原工作区及原服务定义。
- 按用户补充要求，候选使用 c51e4ea 和当前全部已跟踪工作树改动，包括侧栏样式。
- 候选基线、Git 归档和工作树补丁通过传输 SHA-256 核验，锁文件与 VM 现有 Linux 依赖一致。候选在独立目录构建。

- 切换前确认无运行中的终端。通过 systemd WorkingDirectory 覆盖指向新版本，沿用 17877 端口和现有 Runtime 数据目录。

## Verification
- VM Linux ARM64 类型检查及 verify:webui 通过，699 项单元和回归测试、18 项 Web Runtime 端到端测试通过。

- 正式服务 active，PID 18329，进程目录为 R7V4M2/release。配置与备份逐字节相同，原项目工作树仍位于 ~/SharkBay。
- 宿主 HTTP 首页、JS、CSS 及 capabilities 均返回 200。WebSocket 握手成功，项目扫描返回 4 个项目，SharkBay 工作树查询返回 3 项。已核对部署 JS 含 Harness 状态，CSS 含侧栏布局调整。

## Notes
- 保留 VM 项目、任务和 Runtime 配置。原部署仍在 ~/SharkBay。移开本次 90-sharkbay-release.conf 后重载 user systemd 并重启服务即可回退。
- 发布基线为 c51e4ea54e46aa2ebf1ff9ca73703cf2405df082，源归档、工作树补丁和 SHA256SUMS 保存在部署目录。本次未创建 Git 提交。
