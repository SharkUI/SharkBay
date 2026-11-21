---
kind: sharkbay_task
taskId: C6Q8K4-u3960864-m854bf2
taskTag: C6Q8K4
mode: quick
title: 修复左栏工作树状态标签被裁切
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T11:38:29Z
updatedAt: 2026-11-21T11:46:25Z
completedAt: 2026-11-21T11:46:25Z
---

## Summary

工作树和分支组限定在左栏内，展开长分支时完整显示状态胶囊、分支计数和菜单。已部署至测试 VM 和 103。

## Files

- src/styles/app.css

- 测试 VM 的对应样式和 WebUI 静态资源。

- 103 的 WebUI 静态入口和哈希资源，以及 `hotfix-C6Q8K4/` 下的回退入口。

## Work

- 关联 F6W9K4-u0-m854bf2、Q7F4M8-u3960864-m854bf2 和 B7G4R8-u3960864-m854bf2。复现展开 Other branches 后长名称撑宽左栏的情形，验证状态、分支计数和菜单可见。

- Chrome 在 216px 左栏复现。展开长分支后，隐式网格列被撑宽 29px。显式允许网格列收缩，让长分支名按既有省略号样式显示。

- 用户要求部署到 103。按 J8M4P2-u3960864-m854bf2 核对当前为 c51e4ea，从测试 VM 传输已验证的静态资源，校验后原子替换入口，保留 Runtime 和终端。

- 检验 SHA-256 后，将新版静态入口原子发布到 103，保留上一版入口和哈希资源供回退。

## Verification

- `git diff --check` 和 Linux Vite 构建通过。部署仅替换静态资源，Runtime PID 仍为 11482。
- Chrome 在 216px 和 240px 左栏对比现有长分支。使用与生产相同的 Working 状态元素验证胶囊、计数和菜单完整可见，长分支文字正确截断，悬停时状态与菜单继续在原位置交替。

- 103 提供的静态入口、JS 和 CSS 与测试 VM 产物逐字节一致。Runtime PID 保持 60338，切换前后活动终端列表一致。
- Chrome 连接 103，在独立页面模拟长分支和 Working 状态，实测 216px 左栏内状态、计数及菜单完整显示，长名称出现省略号。

## Notes

- 上一版样式和入口已备份于测试 VM 的 `~/.sharkbay/deployments/C6Q8K4/previous/`。

- 103 上一版入口备份在 `~/.sharkbay/install/webui-J8M4P2-c51e4ea/hotfix-C6Q8K4/previous-index.html`。
