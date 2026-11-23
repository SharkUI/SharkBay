---
kind: sharkbay_task
taskId: U8M4Q2-u3960864-m81ae10
taskTag: U8M4Q2
mode: task
title: 在全新 Ubuntu VM 验证 Runtime npm 安装
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-23T12:35:10Z
updatedAt: 2026-11-23T12:41:55Z
completedAt: 2026-11-23T12:41:55Z
---

## Summary
已在全新 Ubuntu 24.04.5 ARM64 Lima VM 安装并验证 Runtime + WebUI。新机已接替 sharkbay-linux 与宿主 17877 端口，旧 VM 已按确认删除。

## Files
- .sharkbay/tasks/U8M4Q2-u3960864-m81ae10-clean-ubuntu-runtime-install.md
- Lima 实例 ~/.lima/sharkbay-linux/lima.yaml，干净实例从临时名 sharkbay-linux-clean 切换到该路径。

- 新 VM 内用户级 Node/npm、SharkBay npm 包、systemd 用户单元和 SharkBay-Smoke 验证用仓库。

## Work
- 参考 N7K4W2-u3960864-m81ae10 和 V7M4Q2-u0-m854bf2。目标是在全新 Ubuntu ARM64 系统从生成的 npm 发布包验收，涵盖 WebUI、真实 PTY 和用户级服务。
- 旧实例 sharkbay-linux 仍有三个运行终端和未提交源码。先启动独立实例，保留旧机现场，待用户决定是否销毁。
- 从已校验的 Ubuntu Noble ARM64 官方基础镜像创建全新 Lima 磁盘，禁用宿主挂载。新机器先用独立的 17878 端口验收。
- 使用通过 SHA-256 校验的 Node 22.23.5 和本地 Runtime tarball 完成全局用户安装，启用测试 VM 用户 linger。
- 用户确认测试通过后可以结束旧机的三个终端并删除未提交的 VM 文件。先保留旧磁盘，验证新机在原实例名及端口运行后清理。
- 保留旧机磁盘直至新机通过原端口核验，随后通过 Lima 删除已停止的旧实例。

## Verification
- Ubuntu 24.04.5 ARM64 首次启动确认没有 Node、npm、Git、SharkBay、编译器或 make。最小安装 Git、curl、证书等系统依赖后依然没有编译工具。
- npm 10.9.9 安装成功，SQLite 原生查询通过。在 17777 验证回环监听、重复运行复用、WebUI 静态资源、WebSocket 和前端 API 驱动的真实 PTY，停止后 PTY 及 profile lock 均释放。
- systemd 用户服务在 17878 注册、启用、正常停止和重新启用均通过，宿主 API 返回 HTTP 200。
- 新 VM 重启后的 boot ID 已改变，服务保持 enabled 并自动 active，宿主 API 返回 200。Chrome 渲染出 SharkBay-Smoke 项目并与新 VM API 通信。
- 最终确认 Lima 只剩 Running 的 sharkbay-linux，用户服务为 enabled/active，宿主 http://127.0.0.1:17877 首页和 API 均返回 200，旧盘目录和临时实例均已移除。

## Notes
- 新机保留 SharkBay-Smoke 测试仓库、Node 22.23.5 和已启用的用户级服务。沿用待发布的本地 tarball，无源码改动或提交。
