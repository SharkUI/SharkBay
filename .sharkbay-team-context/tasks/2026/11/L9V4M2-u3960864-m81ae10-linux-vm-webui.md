---
kind: sharkbay_task
taskId: L9V4M2-u3960864-m81ae10
taskTag: L9V4M2
mode: task
title: 在本机 Linux VM 验证 SharkBay WebUI
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1f8af-961b-7d72-ba10-95f14e89dfa1
branch: main
createdAt: 2026-11-20T11:29:14Z
updatedAt: 2026-11-20T11:41:32Z
completedAt: 2026-11-20T11:41:32Z
---

## Summary

本机 Lima Ubuntu ARM64 VM 已运行 SharkBay v0.3.13 的独立 Node 运行时和 WebUI，可从 Mac 访问 http://127.0.0.1:17877/。已验证项目加载、Linux 终端输入输出、刷新后接回同一终端，以及启动 Codex CLI。

## Files

- 无受版本控制的项目文件变更。

## Work

- Apple Silicon Mac 支持硬件虚拟化，当前仅安装了 Homebrew。计划使用独立的 Lima Ubuntu ARM64 VM，从当前源码构建独立 Node 运行时和 WebUI。
- 宿主机 17777 已有实例，Linux 测试实例使用独立的 17877，并关闭 VM 的宿主目录挂载。
- 通过 Homebrew 安装 Lima 2.3.0，启动 4 vCPU、6 GiB 内存、24 GiB 磁盘的 sharkbay-linux 实例。校验了 Canonical 最小云镜像和 Node.js 24.14.1 的 SHA-256。
- VM 已检出 v0.3.13 对应源码 cd9926f。Linux ARM64 没有匹配的 better-sqlite3 预编译包，转为本机编译并安装 build-essential。
- 构建完成后在 VM 启用用户级 sharkbay-webui.service。宿主机只转发本机 127.0.0.1:17877。VM 中已安装 Codex CLI 0.171.0。
- VM 保持运行，清理了前两轮浏览器诊断创建的临时终端。

## Verification

- Lima 显示 sharkbay-linux 为 Running，客体 uname 与 /etc/os-release 确认为 Ubuntu 24.04.5 LTS、Linux aarch64。
- VM 内 npm run verify:webui 通过，输出 NODE_WEBUI_OK 和 NODE_WEBUI_SHUTDOWN_OK，覆盖静态资源、项目请求、WebSocket、实际 PTY 以及清理。
- Mac Chrome 自动化通过，确认打开 VM 内 SharkBay 项目，PTY 输出 Linux aarch64，刷新后接管同一会话并读取刷新前的 shell 环境变量。浏览器可启动 Codex CLI 到首次启动画面。
- 最终检查确认 Lima 为 Running、用户服务 active 和 enabled、本机转发仅监听 127.0.0.1:17877、WebUI HTTP 200，宿主与客体源码均干净。

## Notes

- 当前没有可用的远程 Linux 测试机。本次验证使用 VM 内的测试工作区。
- VM 管理使用 limactl shell/start/stop sharkbay-linux，源码在客体 ~/SharkBay。Codex 尚未登录或发送模型请求。
