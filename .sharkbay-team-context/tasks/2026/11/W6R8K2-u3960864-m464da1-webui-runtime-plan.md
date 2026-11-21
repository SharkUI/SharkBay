---
kind: sharkbay_task
taskId: W6R8K2-u3960864-m464da1
taskTag: W6R8K2
mode: task
title: 编写 WebUI 与独立运行时计划
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-13T08:33:19Z
updatedAt: 2026-11-13T08:40:45Z
completedAt: 2026-11-13T08:40:45Z
---

## Summary
已在新 worktree 的 docs/webui-runtime-plan.md 写入 WebUI 与独立运行时实施计划，明确首阶段支持局域网设备、运行时边界、终端恢复与多客户端控制、访问保护及 M0—M4 验收标准。仅新增计划文档，未实现功能、提交或发布。

## Files
- docs/webui-runtime-plan.md
- .sharkbay/tasks/W6R8K2-u3960864-m464da1-webui-runtime-plan.md

## Work
- 已读取本 worktree 的 AGENTS.md 和任务协议；当前无团队任务镜像，工作区干净。
- 用户明确第一阶段支持局域网设备访问；保持 GitHub 原有身份、权限和协作模型，不新增 SharkBay 用户体系。
- 使用 CodeGraph 定位核心服务和 Electron IPC；将依据现有文档与代码明确运行时归属、浏览器能力、访问保护、迁移步骤与验收标准。
- 本任务仅编写计划，不实现、提交或发布功能。
- 核对 Core 服务/协议、Electron utility host/client、IPC、preload、renderer bridge、终端、Keychain 与构建配置，区分现状和拟议文件。
- 计划复用现有 React 工作台与业务实现，优先独立 Node 宿主；迁移期同一数据目录保持单宿主，后续再支持桌面与 Web 共享进程。
- 已覆盖局域网 HTTPS/连接授权、GitHub 既有身份边界、终端屏幕恢复与控制权、桌面能力降级、原生模块 ABI 和分阶段端到端验收；明确历史 Workspace/SSH 文档不代表当前实现。

## Verification
- 15 个相对链接均指向现有文件；代码围栏闭合，首阶段 LAN 与仅计划状态检查通过。
- 文档末尾换行、无尾随空白、无 CR 检查通过；git diff --no-index --check 未报告空白问题（新文件差异返回 1）。
- git status --short 仅显示新增 docs/webui-runtime-plan.md；无其他项目文件修改。纯文档变更，未运行类型检查、应用测试或真实界面验收；后续实现阶段的验收另有明确计划。

## Notes
- 操作范围仅限 /Users/shark/Projects/SharkBay-feature-webui-runtime；团队上下文目录保持只读。
- 使用 design-semantic-interfaces 技能梳理对象、状态和能力边界；没有生成界面，不宣称 WebUI 已实现或完成渲染验证。
