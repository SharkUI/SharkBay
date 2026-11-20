---
kind: sharkbay_task
taskId: C6W8B4-u3960864-m81ae10
taskTag: C6W8B4
mode: quick
title: 恢复 Linux VM 的 Reasonix Bash 沙盒
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1f8af-961b-7d72-ba10-95f14e89dfa1
branch: main
createdAt: 2026-11-20T15:12:30Z
updatedAt: 2026-11-20T15:15:39Z
completedAt: 2026-11-20T15:15:39Z
---

## Summary

在 Ubuntu VM 安装 Bubblewrap 并加载发行版提供的专用 AppArmor 规则，恢复 Reasonix 的 Bash enforce 模式。补齐 CodeGraph CLI 与项目本地索引，并验证可在 Bubblewrap 中查询。

## Files

- Ubuntu VM 的 Bubblewrap 软件包和 /etc/apparmor.d/bwrap-userns-restrict。
- VM 内 ~/SharkBay/.codegraph/ 与局部 Git 排除规则 .git/info/exclude，仅本地索引。

## Work

- 关联 VM 配置 L9V4M2-u3960864-m81ae10 和 Reasonix 安装 N4P7R2-u3960864-m81ae10。VM 未安装 Bubblewrap，计划安装 Ubuntu 软件包并在普通用户下验证沙盒。
- 安装 Bubblewrap 后，内核日志确认 AppArmor 通用配置阻止 bwrap 在用户命名空间内设置网络。采用 Ubuntu apparmor-profiles 软件包自带的 bwrap 专用配置。
- 同时发现 VM 实际缺少协议所述的 CodeGraph CLI。计划安装与宿主机相同的 0.9.5，并只为 VM 的 SharkBay 检出目录构建本地索引。
- CodeGraph 0.9.5 已在 VM 用户目录安装，使用 codegraph init -i 构建索引，增加本地 Git 排除规则。

## Verification
- Ubuntu 软件包所带规则已加载，普通用户在隔离的 Bash 中成功运行 date。reasonix doctor 显示 bash enforce，内核的通用 AppArmor 用户命名空间限制仍为 1。
- 在普通用户的 Bubblewrap Bash 中执行 codegraph query ApplicationRuntime，命中 src/runtime/application-runtime.ts。宿主与 VM 源码工作区干净，WebUI HTTP 200。

## Notes

- 保留现有 Reasonix 会话和 SharkBay 服务。本次验证使用独立的 reasonix doctor 进程。
