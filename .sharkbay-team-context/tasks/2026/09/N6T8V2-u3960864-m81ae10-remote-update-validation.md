---
kind: sharkbay_task
taskId: N6T8V2-u3960864-m81ae10
taskTag: N6T8V2
mode: task
title: Configure test Mac control and validate signed automatic updates
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a09f69-0069-7100-bd13-47b5b920a4b4
branch: main
createdAt: 2026-09-16T06:29:57Z
updatedAt: 2026-09-16T09:18:26Z
completedAt: 2026-09-16T09:18:26Z
---

## Summary
已完成独立测试 Mac 上 Developer ID 签名、公证版本的真实升级验收：自动下载、错误重试、签名拒绝、重启/退出安装、终端清理和数据保留均通过。远端 MCP、SSH 隧道与 Codex 配置已就绪，用户开启辅助功能和屏幕录制权限后，真实截图、点击、中英文输入、应用切换和快捷键验证均通过。

## Files
- .sharkbay/tasks/N6T8V2-u3960864-m81ae10-remote-update-validation.md
- docs/release.md：签名升级验收环境、结果与生产发布边界。
- `/tmp/sharkbay-update-qa-N6T8V2/`：隔离构建目录、验收包及测试记录。
- 本机 `~/.codex/config.toml`：`test-mac` 指向 `http://127.0.0.1:18000/mcp`；`~/Library/LaunchAgents/xyz.sharkbay.test-mac-tunnel.plist`：持久 SSH 隧道。
- 测试 Mac `~/Library/LaunchAgents/com.macos-mcp.server.plist`：loopback HTTP 服务、禁用遥测、60 秒重试间隔。
- 测试 Mac `~/sharkbay-update-qa/`、`~/Applications/SharkBay Update QA.app`、`~/Library/Application Support/SharkBay Update QA/`、`~/Library/LaunchAgents/xyz.sharkbay.update-qa-feed.plist`：隔离验收环境。
- .sharkbay/tasks/U8M4R6-u3960864-m81ae10-app-auto-update.md：回填真实签名升级验收结果。

## Work
- 用户授权自主完成远端接入与剩余升级验收。SSH 公钥登录已通过，测试主机为 arm64 macOS 26.3.1。
- 关联任务 U8M4R6-u3960864-m81ae10（自动更新实现）与 V3R2K6-u3960864-m81ae10（正式签名、公证流程）；继续保留当前未提交实现。
- 计划：安装远端 MCP 并验证基础桌面操作；构建两个签名测试版本；验证下载/重启安装/退出安装/数据保留与失败重试。
- 测试包使用独立名称、应用标识、数据目录和更新源；现有工作应用与正式 GitHub 发布源保持独立。
- 本机 Developer ID 签名证书可用，已有 sharkbay-release 公证配置的历史记录，后续检查可用性。
- 远端安装 uv 0.11.28、Python 3.12 与 macos-mcp 0.4.6；指定的 0.4.5 在实际包源不可用，改用当前可安装版本。
- 验收包将使用 `SharkBay Update QA` 名称、独立 userData/config 和本地 HTTP feed；隔离改动仅进入临时构建副本。
- MCP LaunchAgent 已安装，Codex MCP 条目已添加；服务启动被 macOS 辅助功能权限阻止，已请求用户开启系统权限，构建继续推进。
- 0.3.3 与 0.3.4 验收包均已签名、公证；0.3.3 安装到远端独立路径。通过仅监听 loopback 的应用调试接口检查真实 Electron 渲染与 IPC，权限等待不阻断应用验收。
- 创建无效签名的 0.3.4 ZIP，校验和元数据有效，用于区分下载校验与 macOS 签名拒绝。
- 已通过 503 下载失败提示、Retry、无效签名拒绝、恢复有效 feed 后重试、Later 隐藏与手动检查重新显示。
- 点击真实 Restart to update 按钮完成 0.3.3 → 0.3.4 自动替换与重启；原测试 shell 及 sleep 子进程均退出，配置/保留标记/项目文件哈希一致。
- 第二轮重新安装验收版 0.3.3，启动后自动下载 0.3.4；Later 与关闭窗口均不提前安装，正常退出后安装为 0.3.4 且不自动启动。重新打开后界面、项目、localStorage 标记均保留。
- MCP 仍缺辅助功能授权，已卸载当前运行实例以停止重复权限弹窗，保留安装配置；授权后可重新 bootstrap。
- 收尾：正常退出验收应用、停止调试端口和测试 feed，将 feed LaunchAgent 移至 `~/sharkbay-update-qa/update-qa-feed.plist.disabled`，避免登录时自启。保留验收应用、测试 ZIP 和日志；删除隔离构建依赖副本与冗余应用副本。未创建提交或正式发布。
- 用户已确认开启系统权限，恢复任务：启动远端 MCP，验证 HTTP 握手与真实截图/点击/输入，随后收尾记录。
- 辅助功能授权已生效，MCP 成功启动并经本机 SSH 隧道完成 initialize、tools/list、Snapshot 控件读取与 App 启动。屏幕录制预检仍返回 false，已触发系统请求并请用户开启另一项权限。
- 用户补充开启屏幕录制后重新加载 MCP，完成真实桌面截图与 TextEdit 新建文稿点击、中英文输入回读、关闭文稿快捷键及 SharkBay 验收应用切换。丢弃测试文稿，正常退出两款测试应用；MCP 和 SSH 隧道保持运行。

## Verification
- `ssh shark@10.8.0.4`：成功，用户 shark，SharkMBPM3Server.local。
- 已阅读当前协议、AGENTS.md、相关任务记录；CodeGraph 定位 AppUpdates；工作区变更与已有实现一致。
- `npm run build`：通过；`notarytool history --keychain-profile sharkbay-release`：凭据有效。
- 0.3.3：codesign 深度严格验证、stapler、Gatekeeper 全部通过；0.3.4 Gatekeeper 显示 Notarized Developer ID。
- 远端真实应用启动检查为 up-to-date；手动检查显示提示，已取得并查看实际渲染截图。夜间主题、隔离项目与终端正常加载。
- 重启安装：远端版本变为 0.3.4，新主进程 PID 与旧进程不同；保留文件 3/3 校验通过。详细结果保存在远端 `~/sharkbay-update-qa/logs/restart-result.json`。
- 正常退出安装：`normal-quit-result.json` 为 0.3.4、无主进程、保留文件 3/3 一致；重新打开显示 up-to-date，localStorage 标记与项目可见。
- 升级后远端应用通过 Gatekeeper（Notarized Developer ID）和 codesign 深度严格验证；原 `/Applications/SharkBay.app` 版本元数据与 `~/.sharkbay/config.json` 哈希未变。
- 两个签名 ZIP 的大小与 SHA-512 均与 latest-mac.yml 一致；最终 `git diff --check` 通过。本次未改更新实现，沿用 U8M4R6 的 360 项自动化测试结果，并补齐真实安装验收。
- 已查看真实远端应用的最新版本、就绪、错误与升级后界面截图。远端 18765（feed）、19222（调试）、8000（待授权 MCP）端口均已关闭；本机 SSH 隧道配置保留。
- 未完成：MCP 服务启动报告 Accessibility 未授权，因此没有宣称远程桌面截图、点击或输入已验证。
- 用户授权后 HTTP MCP 握手与 12 个工具发现通过；真实桌面可访问性树可读取。截图返回 `could not create image from display`，`CGPreflightScreenCaptureAccess()` 为 false，需补充屏幕录制权限。
- 最终 MCP 验收通过：Snapshot 返回可查看的桌面 PNG；Click 实际打开新文稿；Type 输入 `SharkBay remote MCP test N6T8V2` 和中文测试句，后续可访问性树与截图均确认一致；Shortcut 和 App 切换正常。
- `codex mcp get test-mac` 确认为 enabled、streamable_http、`http://127.0.0.1:18000/mcp`；远端服务监听 `127.0.0.1:8000`。验收结果记录于远端 `~/sharkbay-update-qa/logs/mcp-acceptance.json`，本机已同步副本；测试应用均已退出。

## Notes
- 团队上下文只读；正式发布不属于本次测试。
- 若系统权限需要用户在 macOS 中确认，保留待办并继续可独立推进的构建工作。
- 测试 Mac 的 Python 辅助功能与屏幕录制现已授权，服务与隧道均通过 LaunchAgent 保持运行。需要重启服务时使用 `launchctl kickstart -k gui/501/com.macos-mcp.server`；若服务未加载才使用 `launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.macos-mcp.server.plist`。新的 Codex CLI 会话会读取 `test-mac` 配置。
- 证据保存在远端 `~/sharkbay-update-qa/logs/`，本机副本在 `/tmp/sharkbay-update-qa-N6T8V2/remote-logs/`；验收使用独立 generic feed，GitHub 正式上传产物仍需每次发布时核验。
