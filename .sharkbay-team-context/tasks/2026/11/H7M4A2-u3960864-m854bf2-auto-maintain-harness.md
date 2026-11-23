---
kind: sharkbay_task
taskId: H7M4A2-u3960864-m854bf2
taskTag: H7M4A2
mode: task
title: Agent 启动时自动安装和更新 Harness
status: completed
completedAt: 2026-11-21T14:18:22Z
actor: SharkUI
githubUserId: 3960864
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: linux-webui
createdAt: 2026-11-21T14:07:26Z
updatedAt: 2026-11-23T06:43:00Z
commits:
  - 78ce78002457234e82c31d66220bdee667c0b21c
---

## Summary
SharkBay 在受支持 Agent 首次及后续新启动前自动安装或维护本地 Harness，补齐缺失文件并升级已识别的官方文件。保留用户定制、任务记录及机器 ID，主动卸载后可在 Tasks 手动恢复。

## Files
- .sharkbay/tasks/H7M4A2-u3960864-m854bf2-auto-maintain-harness.md
- docs/product.md
- src/core/core-runtime.ts
- src/main/config.ts
- src/main/harness.ts
- src/main/managed-path.ts
- src/main/project-setup.ts
- src/main/terminal.ts
- src/renderer/App.tsx
- src/renderer/project-start.tsx
- src/renderer/types.ts
- src/runtime/application-runtime.ts
- src/runtime/task-runtime.ts
- src/shared/types.ts
- tests/harness.test.ts
- tests/project-tasks-switch.test.ts
- tests/task-runtime-install.test.ts
- tests/web-runtime-integration.test.ts

## Work
- 查阅 F6K9R2-u3960864-m81ae10、G8L2P5-u3960864-m81ae10、M6R8T2-u3960864-m81ae10 和 J8P4L6-u3960864-m81ae10。现有普通启动只注入已安装协议，手动更新会覆盖差异文件。
- 从共用 Runtime 的启动入口接入本地维护。自动补齐缺失文件，升级可识别的官方文件，并保留定制内容。主动卸载保留手动恢复入口，远端继续使用现有同步规则。
- 用 v0.3.0 至 v0.3.13 的官方模板指纹和后续生成记录识别可升级文件。写入时核对原内容；同一工作区的安装、升级和后台身份更新串行。
- App 与 WebUI 共用同一启动路径。任务页仅展示手动卸载和定制文件处理入口，首次安装与常规升级不要求操作。

## Verification
- npm test 通过 699 项，npm run test:host 通过 51 项，npm run test:integration 通过 18 项。
- npm run typecheck、npm run build、npm run verify:webui 和 git diff --check 通过。
- 验证 v0.3.0 至 v0.3.13 共 14 个发布版本的协议模板指纹，可正确处理安装生成的项目及身份字段。
- Chrome 连接隔离 WebUI。首次点击测试 Agent 即可收到协议。再次启动时补齐 review.sh，保留定制 artifact.sh 和机器 ID，仅定制文件出现在任务页。
- 通过 Web 和桌面控制接口验证自动安装、真实 PTY 启动、主动卸载及手动恢复。使用本地裸 Git 仓库验证自动安装后使用现有团队同步入口。

## Notes
- 保留工作树中 F6K9R2 和样式的既有改动。本任务未创建 Git 提交。
- 后续通过 P4M7T9-u3960864-m854bf2 一并提交已部署的源码，哈希见 `commits`。
