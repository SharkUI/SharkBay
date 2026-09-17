---
kind: sharkbay_task
taskId: U8M4R6-u3960864-m81ae10
taskTag: U8M4R6
mode: task
title: Add automatic application updates through GitHub Releases
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a09f69-0069-7100-bd13-47b5b920a4b4
branch: main
createdAt: 2026-09-14T10:55:23Z
updatedAt: 2026-09-16T09:31:17Z
completedAt: 2026-09-14T11:14:18Z
commits:
  - 30d3d856270e14aae297795ab1d5a2b825c9619c
---

## Summary
已接入 electron-updater 与 GitHub Releases，实现启动及每 4 小时后台检查/下载、手动检查、进度与错误重试，以及用户重启或正常退出时安装。自动化测试、真实界面、打包与实际更新源检查通过；后续任务 N6T8V2 在独立 Mac 完成签名、公证版本的真实跨版本安装、签名拒绝和数据保留验收。

## Files
- package.json
- package-lock.json
- src/main/app-updates.ts
- src/shared/app-updates.ts
- src/main/application-menu.ts
- src/shared/ipc-channels.ts
- electron/main.ts
- electron/preload.mts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/renderer/update-hint.tsx
- src/styles/app.css
- tests/app-updates.test.ts
- tests/application-menu.test.ts
- tests/ipc-channels.test.ts
- docs/release.md
- vite.config.ts
- tests/app-update-lifecycle.test.ts

## Work
- 用户确认应用自动升级方案；实现范围为客户端与发布配置，验证完成前不自动发布新版本。
- 工作区初始干净；使用 CodeGraph 定位 UpdateHint、菜单和退出入口。
- 参考团队任务 DU470E-u3960864-m81ae10 与 V3R2K6-u3960864-m81ae10：现有提示只跳转 Release，发布端已有签名、公证和更新产物。
- 计划：检查生命周期及桥接 → 接入服务、菜单和状态 UI → 测试/构建/真实渲染与可行的打包验证。
- 已安装 electron-updater 6.8.9；沿用 electron-builder 26，跳过安装脚本以保持现有原生模块构建。
- 确认 quitAndInstall 会先关闭窗口；显式安装须先经过既有 before-quit 清理并设置 isQuitting，正常退出继续由更新器安装。
- 界面模型：更新是应用级状态，沿用左下角入口；自动无更新/检查失败保持安静，手动检查显示结果，下载显示进度，完成提供重启/稍后。只有用户选择重启才主动退出。
- 完成服务、稳定版本策略、4 小时轮询、进度、可重试错误、主窗口专用 IPC、菜单与更新提示；发布配置指向现有 GitHub Releases，并补充发布/首次迁移说明。
- 显式安装走既有退出清理后再 quitAndInstall；新增重复退出保护。移除旧 UpdateHint 后清理其 __APP_VERSION__ 构建注入。
- 完成真实组件的下载/稍后交互初检；将更新卡片限制在最小项目侧栏宽度内，避免遮挡终端区域。
- 完成退出流程复核及最终类型检查；关闭临时界面页、停止预览服务并清理隔离打包/运行文件。此次任务未生成提交或发布版本。
- 后续任务 N6T8V2-u3960864-m81ae10 完成独立应用与本地 HTTP feed 的真实 0.3.3 → 0.3.4 升级验收，无需修改更新实现。
- 用户授权发布后，由 R6U3P8-u3960864-m81ae10 提交本任务实现：`30d3d856270e14aae297795ab1d5a2b825c9619c`。

## Verification
- `npm run typecheck` 通过（首轮实现）。
- 更新服务/菜单/IPC 首轮 16 测试通过；新增退出衔接测试后，服务与真实主进程入口模拟测试 12 项通过，覆盖清理先于安装、重复退出、清理超时和 IPC 来源限制。
- `npm test`：62 文件 / 360 测试通过；修正测试模拟 resourcesPath 的只读类型后，`npm run typecheck` 与退出测试复查通过，`npm run build` 通过。
- 隔离 ad-hoc macOS arm64 目录包构建成功，确认更新服务、预加载与 electron-updater 6.8.9 已入包；目录目标不会生成 app-update.yml，按 electron-builder 实现改用 ZIP 分发目标验证更新元数据。
- `npx electron-builder --mac zip --publish never -c.directories.output=/tmp/sharkbay-update-pack-U8M4R6 -c.mac.identity=- -c.mac.notarize=false` 通过；app-update.yml 指向 SharkUI/SharkBay，latest-mac.yml 的 ZIP 大小与 SHA-512 实际重算一致。
- 隔离 Electron 运行进程加载已打包的 electron-updater 与实际 AppUpdates 服务，使用包内配置请求公开 GitHub 稳定版源，正确报告 0.3.2 已是最新；关闭自动下载且未安装任何更新。
- Safari 实际渲染 UpdateHint 与项目样式：下载进度、就绪、稍后隐藏、再次提示、错误重试、手动最新版本结果、安静后台错误、深浅主题均检查；重启按钮仅调用验证桥接，显示安装中状态。
- 最终 `npm run typecheck` 与 `git diff --check` 通过；最终界面调整后的 `npm run build` 通过。
- 尚未执行 Developer ID 签名版本的旧版到新版真实安装、签名拒绝及用户配置保留验证；本次打包为 ad-hoc 验证，相关正式发布检查已写入 docs/release.md。
- 2026-09-16 后续验收补齐上一项：Developer ID 签名、公证包的启动自动下载、503 重试、损坏签名拒绝、Later、关闭窗口不安装、重启安装、正常退出安装、终端清理与配置/localStorage/项目保留均通过；见 N6T8V2 的 Verification。

## Notes
- 不主动重启正在工作的应用；用户主动重启或正常退出时安装。
- 团队上下文只读；旧版需手动安装首个带更新器版本。
