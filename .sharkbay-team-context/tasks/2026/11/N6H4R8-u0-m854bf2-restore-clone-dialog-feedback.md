---
kind: sharkbay_task
taskId: N6H4R8-u0-m854bf2
taskTag: N6H4R8
mode: quick
title: 排查 Clone Here 点击后无反馈
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T08:32:08Z
updatedAt: 2026-11-21T08:37:18Z
completedAt: 2026-11-21T08:37:18Z
---

## Summary

WebUI 目录选择器的操作错误固定在确认按钮旁，列表滚动时仍可见。修复已部署到测试 VM。

## Files

- src/renderer/host-folder-picker.tsx
- src/styles/app.css
- tests/host-folder-picker.test.tsx
- 测试 VM 的对应前端源码及 WebUI 静态入口和资源。

## Work

- 关联 W6P8N3-u3960864-m81ae10 和 C4R8K6-u3960864-m81ae10。检查从目录确认到 Runtime 返回的执行路径。
- 使用测试 VM 中已有的 Git 仓库和临时目标目录验证错误、重试和成功状态。

- Safari 复现已有同名目录时 Git 拒绝克隆。现有错误渲染在可滚动列表内部；将操作错误固定到确认区，目录读取错误仍在列表显示。

- 保留旧静态入口和样式，部署前端修正。验证期间 Lima 收到 SIGTERM 停机，重新启动后确认新资源仍由原测试链接提供。

## Verification

- 测试 VM 可以读取公开 GitHub 仓库的 HEAD。
- 新增定向回归在旧代码失败，修复后 HostFolderPicker 3 项测试通过。类型检查、定向 Runtime 集成测试、Linux Vite 构建和 `git diff --check` 通过。
- Safari 在含 30 个子目录的目标滚动到末尾并重复克隆，确认同名目录错误显示在 Clone Here 上方且按钮可重试。原截图未提供仓库地址，用户那一次的 Git 失败原因未确认。
- 重启后经测试 VM 的应用 API 成功克隆公开 GitHub 仓库到空目录、登记项目并验证 origin。测试项目已移除，临时文件已清理。
