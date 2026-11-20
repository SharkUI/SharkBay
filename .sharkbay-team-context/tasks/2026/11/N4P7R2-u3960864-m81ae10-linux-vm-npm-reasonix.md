---
kind: sharkbay_task
taskId: N4P7R2-u3960864-m81ae10
taskTag: N4P7R2
mode: quick
title: 修复 Linux VM 的 npm 全局安装并安装 Reasonix
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1f8af-961b-7d72-ba10-95f14e89dfa1
branch: main
createdAt: 2026-11-20T15:03:29Z
updatedAt: 2026-11-20T15:04:19Z
completedAt: 2026-11-20T15:04:19Z
---

## Summary

Linux VM 的 npm 全局包现安装到当前用户的 ~/.local。Reasonix v2.61.0 已安装，SharkBay WebUI 可识别并显示启动按钮。

## Files

- VM 内 ~/.npmrc，设置当前用户的 npm 全局安装目录。

## Work

- Linux VM 使用 L9V4M2-u3960864-m81ae10 配置的系统级 Node。确认 npm 默认 prefix 为 /opt/sharkbay-node，VM 用户可写 ~/.local，且 ~/.local/bin 已在 PATH 上。
- 参考 Reasonix 支持任务 R9X4K7-u3960864-m81ae10 与 R7X2K1-u3960864-m81ae10，使用官方 npm 包并检查 SharkBay 的 CLI 识别入口。

- 通过 npm 用户配置设定 prefix，并以普通 VM 用户执行 npm 全局安装。

## Verification

- npm prefix -g 确认为 ~/.local，reasonix --version 返回 v2.61.0。
- Mac Chrome 打开 VM WebUI，agents.listClis 检出 Reasonix，界面显示其启动按钮。

## Notes

- 现有 VM 服务已包含 ~/.local/bin。保留在运行的服务和终端。
