---
kind: sharkbay_task
taskId: P9K4M2-u3960864-m81ae10
taskTag: P9K4M2
mode: task
title: 对齐 Desktop 与 WebUI 工作区侧栏
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-23T14:09:22Z
updatedAt: 2026-11-23T14:33:56Z
completedAt: 2026-11-23T14:33:56Z
commits:
  - 93aeabec8a5d4c89361d26e805c27c82aafa1f40
---

## Summary
Desktop 现在与 WebUI 使用同一个 Git 工作区侧栏，支持仓库分组、工作树切换以及本地和 origin 分支操作。已生成本机预览包并完成双端渲染与操作验证。

## Files
- .sharkbay/tasks/P9K4M2-u3960864-m81ae10-align-desktop-webui-sidebar.md
- electron/ipc.ts
- electron/preload.mts
- src/shared/ipc-channels.ts
- src/renderer/App.tsx
- src/styles/app.css
- tests/ipc-channels.test.ts
- docs/current-facts.md
- release/desktop-parity-preview/mac-arm64/SharkBay.app（隔离验收包）

## Work
- 参考 S4W8B2-u0-m854bf2、Q7F4M8-u3960864-m854bf2、U4P8M2-u0-m854bf2、H7P4K9-u3960864-m81ae10。核对最近提交 f73e3b2、c51e4ea、6513380、78ce780 和 21ef04a。
- 左栏以 Git 仓库为分组，当前仓库展示已检出的工作树与未检出的本地和远端分支。主工作树、活动工作树及远端分支的操作由现有共享组件决定。目录选择和窗口拖拽空间使用 Desktop 原生行为。
- 提交 a4d23ac 已完成 Runtime 和桌面打包分离。本任务复用共享侧栏、菜单和 Runtime 命令，接通 Electron 缺少的调用并统一相关样式；使用隔离 Runtime 实测两个客户端。
- f73e3b2 负责工作树分组、操作与样式，c51e4ea 负责 origin 分支与刷新。78ce780 与 21ef04a 的 Task Protocol/Hooks 界面及 IPC 已共用。复用 Runtime 的五个命令并共享仓库行、顶部图标及菜单样式。
- 用户确认提交已验收并安装的侧栏对齐改动，提交范围为原任务的七个文件。
- 已提交 93aeabec8a5d4c89361d26e805c27c82aafa1f40。

## Verification
- Node 24 下 701 项单元测试、类型检查、生产构建及 Apple Silicon 测试包签名检查通过。
- 在同一个隔离 Runtime 中打开 macOS 桌面包与 Chrome。截图和计算样式核对仓库分组、工作树选中、分支顺序、远端图标和顶部间距一致。
- 实际点击切换到未登记的工作树、刷新 origin、从远端分支开跟踪工作树并移除工作树、删除本地分支，均经 Git 和 UI 状态确认。
- 22 项 Web Runtime 集成测试及 git diff --check 通过。
- 提交前 git diff --cached --check 通过，提交后工作区干净。

## Notes
- 独立 Runtime/打包提交为 a4d23ac，侧栏对齐预览包位于 release/desktop-parity-preview。
