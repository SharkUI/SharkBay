---
kind: sharkbay_task
taskId: V7M4Q2-u0-m854bf2
taskTag: V7M4Q2
mode: task
title: 确认 Linux WebUI 本地测试环境与部署约定
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T04:10:01Z
updatedAt: 2026-11-21T04:11:07Z
completedAt: 2026-11-21T04:11:07Z
---

## Summary

已启动并核对本机 Lima sharkbay-linux VM。后续“部署到测试环境”指将当前 linux-webui 工作结果部署到该 VM，并通过宿主 http://127.0.0.1:17877/ 验证。

## Files

- 本任务记录。VM 启动后保持 Running。宿主和客体源码、Lima 配置及 systemd 服务定义均无改动。

## Work

- 复核团队任务 L9V4M2-u3960864-m81ae10、N4P7R2-u3960864-m81ae10、C6W8B4-u3960864-m81ae10、H8V4R6-u3960864-m81ae10。当前 Lima 实例 sharkbay-linux 为 Stopped。
- 用户约定：本项目后续说“部署到测试环境”，指将当前工作结果部署到本机 Lima 的 sharkbay-linux VM 并在其中测试。

- 启动原有 Lima 实例。VM 为 Ubuntu 24.04.5 LTS ARM64，4 vCPU、6 GiB 内存、24 GiB 磁盘，无宿主目录挂载。
- 客体源码和用户服务工作目录为 ~/SharkBay（/home/shark.guest/SharkBay），目前是干净的 main@cd9926f。已启用 linger 和用户级 sharkbay-webui.service，以 /opt/sharkbay-node/bin/node 启动 dist-runtime/src/server/main.js --background --port 17877 --project %h/SharkBay。配置和运行数据位于客体 ~/.sharkbay/runtime/。
- 后续部署从当前宿主工作树取对应的代码快照，包含属于本次交付的未提交改动。通过 Lima SSH 传输到客体，在 Linux 上处理依赖并构建 Runtime 与 WebUI，核对活动终端后切换用户服务，随后从宿主验证受影响流程。保留客体配置及本地任务数据。

## Verification

- `limactl list` 确认 Running，客体 `systemctl --user show` 确认服务 active、enabled，实际进程使用 Node 24.14.1，npm 为 11.11.0。
- 宿主监听 127.0.0.1:17877，首页 HTTP 200，/api/capabilities 返回 WebUI 能力。经 Lima SSH 的标准输入传输已验证。
- 客体 SQLite 内存查询和 PTY 原生模块加载通过。Codex 0.171.0、Reasonix 2.61.0 可执行，CodeGraph 索引已初始化且为最新。当前客体 PATH 未发现 gh。
- 宿主 linux-webui 和客体 main 工作区干净。本轮未部署新代码或重跑完整 WebUI 集成测试。

## Notes

- 团队镜像只读。
