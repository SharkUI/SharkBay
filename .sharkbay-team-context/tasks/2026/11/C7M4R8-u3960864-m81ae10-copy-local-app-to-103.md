---
kind: sharkbay_task
taskId: C7M4R8-u3960864-m81ae10
taskTag: C7M4R8
mode: task
title: 复制本地新应用包到 103
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1edf1-0eb3-7c32-ae19-51cc6395dc3f
branch: main
createdAt: 2026-11-18T09:48:24Z
updatedAt: 2026-11-18T09:57:42Z
completedAt: 2026-11-18T09:57:42Z
---

## Summary
已将用户指定的 0.3.11 本地应用包原样复制并覆盖 103 的 /Applications/SharkBay.app，旧包已保留备份。压缩包和安装后全部文件/链接/权限校验一致，未主动重启 App/Runtime；源包既有签名校验错误在远端同样存在。

## Files
- .sharkbay/tasks/C7M4R8-u3960864-m81ae10-copy-local-app-to-103.md
- 103:/Applications/SharkBay.app
- 103:/Users/shark/.sharkbay/install/copy-C7M4R8-3wkFLY/
- 103:/Users/shark/.sharkbay/install/copy-C7M4R8-3wkFLY/SharkBay.previous.app

## Work
- 已查阅只读团队任务 R7N4V9-u3960864-m81ae10、R9P4W7-u3960864-m81ae10，以及本地 H8T3R6-u3960864-m81ae10：103 为 10.0.0.103，日常应用位于 /Applications/SharkBay.app。
- 用户只要求复制；默认复制到远端独立接收目录，不替换/重启日常应用或 Runtime。
- 计划：确认 SSH 和源包 → 保留 app bundle 元数据传输 → 校验接收包并报告路径。
- 源包 release/mac-arm64/SharkBay.app 版本 0.3.11，目录约 460 MB；当前 Git 工作区干净。
- SSH 已确认 shark@10.0.0.103 为 SharkMBP-M2、arm64，空间充足且具备 Python3/ditto。源包 codesign --verify --deep --strict 报 code has no resources but signature indicates they must be present；只原样复制，不修签名。
- 用户随后明确要求覆盖现有安装包；目标调整为 /Applications/SharkBay.app，先暂存并完整校验，再备份旧包并替换，不主动重启 App/Runtime。
- 已建立接收目录 copy-C7M4R8-3wkFLY，使用 ditto 保留应用包结构和元数据；压缩包 187201021 字节，正在传输。替换前后比较全部文件摘要、符号链接目标与权限模式；旧包预留为该目录下 SharkBay.previous.app。
- 传输及暂存校验通过后，将旧应用移至 SharkBay.previous.app，并把新应用移入 /Applications/SharkBay.app；保留失败时恢复旧包的回退路径。最终校验通过，传输 ZIP 和本机临时目录已清理；未操作项目配置或应用进程。

## Verification
- SSH、可写安装目录及目标 arm64 确认通过；源包版本为 0.3.11。
- 传输 ZIP SHA-256 两端一致：8433ef8e9fb24dda2f465d2f5917abfbd85b13b8c236b57a7eb5be3a73d46abe。
- 本机复制前后、远端解包后及安装后清单完全一致：2484 个文件、475678694 字节，清单 SHA-256 为 e65746f7b12a4f6a63f01693c05d5ddf36ad78216b709729a061f3e46f4e54af；清单包含文件内容、权限模式及符号链接目标。
- 安装后 Info.plist 版本为 0.3.11，旧包备份存在，传输 ZIP 已移除，Git 工作区干净；未创建提交。
- 源包和目标包均未通过 codesign --verify --deep --strict，报 code has no resources but signature indicates they must be present；这是源包既有状态，未修签名或执行应用。

## Notes
- 不重新构建、不提交、不修改团队上下文。
