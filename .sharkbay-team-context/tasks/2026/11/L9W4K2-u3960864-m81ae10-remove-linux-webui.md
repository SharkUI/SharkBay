---
kind: sharkbay_task
taskId: L9W4K2-u3960864-m81ae10
taskTag: L9W4K2
mode: quick
title: 清理 linux-webui 分支和工作树
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-23T11:50:54Z
updatedAt: 2026-11-23T11:51:42Z
completedAt: 2026-11-23T11:51:42Z
---

## Summary
已删除本地和 GitHub 的 linux-webui 分支及关联工作树，并保留 38 份本地任务记录的备份。

## Files
- .sharkbay/tasks/L9W4K2-u3960864-m81ae10-remove-linux-webui.md
- 移除独立工作树 /Users/shark/Projects/SharkBay-linux-webui。

## Work
- 参考 V6M4R9-u3960864-m854bf2 的合并记录，复核本地和远端分支的提交均已进入 main，GitHub 无相关开放 PR，工作树无未提交的跟踪或非忽略文件。
- 核对工作树中的本地任务记录，发现部分记录在主工作树或团队镜像中没有字节一致的副本。

- 将工作树中 38 份本地任务记录备份到项目外，逐文件核对一致。

- 以已核验的远端提交为租约删除 GitHub 分支，再用 Git 的常规删除命令移除工作树和本地分支。

## Verification
- 已核对 GitHub 分支、本地分支、本地远端跟踪引用、工作树目录及 Git 工作树记录均已移除。
- 本地 main 与 GitHub main 均为 21ef04a，主工作树干净。备份逐文件比对一致，共 38 份 Markdown 任务记录。

## Notes
- 备份位于 ~/Library/Application Support/SharkBay/Worktree Backups/linux-webui-L9W4K2/tasks。
