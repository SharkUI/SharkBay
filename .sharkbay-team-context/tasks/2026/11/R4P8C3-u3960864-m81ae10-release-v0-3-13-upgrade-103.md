---
kind: sharkbay_task
taskId: R4P8C3-u3960864-m81ae10
taskTag: R4P8C3
mode: task
title: 发布 v0.3.13 并更新 103
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1f72e-a468-7153-8b6d-4b4ed4175d0d
branch: main
createdAt: 2026-11-20T05:56:09Z
updatedAt: 2026-11-20T10:34:57Z
completedAt: 2026-11-20T10:34:57Z
commits:
  - cd9926fcfb2b653d48f6f46f0010e4000e45df46
  - c28ade2b756fb1c1d9f2ac54bc195053597f5c73
---

## Summary
已发布签名、公证并校验的稳定版 v0.3.13，Homebrew 已同步。103 已升级并运行 v0.3.13，跨主机 WebUI 验证通过。经用户确认结束原有两个终端，原配置和两个项目保留，v0.3.12 应用和配置已备份。

## Files
- package.json
- package-lock.json
- README.md
- CHANGELOG.md
- docs/current-facts.md
- release/v0.3.13/（正式发布产物与验证日志）
- electron/ipc.ts
- electron/main.ts
- electron/preload.mts
- src/main/config.ts
- src/renderer/App.tsx
- src/renderer/bridge/web-bridge.ts
- src/renderer/types.ts
- src/runtime/application-runtime.ts
- src/runtime/control-server.ts
- src/runtime/terminal-state.ts
- src/server/http-server.ts
- src/shared/application-api.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/styles/app.css
- tests/config-migration.test.ts
- tests/ipc-channels.test.ts
- tests/project-tasks-switch.test.ts
- tests/web-runtime-integration.test.ts
- SharkUI/homebrew-tap:Casks/sharkbay.rb（工作流自动提交）
- 103:/Applications/SharkBay.app
- 103:~/.sharkbay/install/v0.3.13-R4P8C3/（v0.3.12 应用和配置备份）
- .sharkbay/tasks/R4P8C3-u3960864-m81ae10-release-v0-3-13-upgrade-103.md（发布和升级记录）

## Work
- 用户授权发布稳定版并升级 103。当前 Latest v0.3.12，origin/main 与本地 HEAD 一致，v0.3.13 无既有 Release。
- 纳入已完成的 C6V2P8-u3960864-m81ae10、K7V4M2-u3960864-m81ae10、J8N4Q2-u3960864-m81ae10、T8P4W2-u3960864-m81ae10。参照 R3M7V2-u3960864-m81ae10、U3K8R2-u3960864-m81ae10 和 R9P4W7-u3960864-m81ae10。
- 计划：版本和源码快照 → 隔离构建与包内测试 → Developer ID 签名公证和附件核验 → 正式发布与 Homebrew 同步 → 备份并更新 103，确认运行版本与 WebUI。
- 103 的历史 IPv4 和 mDNS 主机名连接 SSH 均返回 No route to host。检查已知 IPv6 与其他现有通路，同时推进可独立完成的发布。
- 已验证 Developer ID 证书和 sharkbay-release keychain profile。GitHub 连接器缺少 Release 发布能力，沿用 gh CLI。

- 版本、发行说明和本次四项交付的源码以 cd9926fcfb2b653d48f6f46f0010e4000e45df46 固定，通过 git diff --check。隔离构建位于 /private/tmp/sbr13-X4pUry。IPv4 SSH、WebUI 及已知的链路本地/ULA IPv6 SSH 均不可达。

- 推送主分支与注释标签 v0.3.13，均解引用至 cd9926f。已创建 GitHub 草稿，正式包开始 Developer ID 签名与公证。

- 草稿 ID 452324711。连续重试 103 IPv4 SSH 和 WebUI 仍失败，本机能访问局域网网关。已通知用户，继续等待签名公证并保留远端升级计划。

- Developer ID 应用已签名，Apple 公证提交 7cb6c72a-1743-4a62-9d1e-72baccdc579d 当前 In Progress。正式应用的包内 Runtime 验证已通过。

- Apple 公证 Accepted，正式 DMG、ZIP、两份 blockmap 与 latest-mac.yml 已校验并上传草稿。GitHub stable Latest v0.3.13 于 06:13:14Z 发布；已触发 Homebrew 工作流 44686259326。

- Homebrew 工作流 44686259326 成功并提交 c28ade2。已清理本次隔离 worktree，保留 release/v0.3.13 正式产物和验证日志。
- 发布后再次重试 103，至 06:15:21Z 的 SSH 仍返回 No route to host，17777 无法连接。
- 用户报告从 macOS「终端」可 ping 通 103。确认 Codex 会话继承 SharkBay.app 的进程树，并用 Network.framework 定位到 macOS 本地网络权限拦截。待本机授权后重试 SSH，再继续升级。
- 用户再次要求重试。确认 SSH 可用，检查 103 的活动终端及运行状态，校验并暂存签名包后执行升级。
- 103 正式签名包已暂存。检测到两个运行中的终端，已告知用户切换 Runtime 会结束这两个会话，等待用户关闭或授权结束。
- 用户已确认允许结束两个终端并升级。切换前复核旧应用及 Runtime 进程，更新配置备份，保留旧应用供回退。
- 退出旧桌面并通过内置 `--stop` 正常停止 Runtime，迁移旧 0.3.12 应用至备份目录，安装并启动正式 0.3.13。验证完成后清理传输 ZIP 和空解包目录，保留旧应用与两份配置的切换前备份。

## Verification
- 固定提交的隔离 npm ci、类型检查、689 项单元测试、15 项集成测试、arm64 smoke pack、编译 WebUI 和实际包内 Node/SQLite/PTY、桌面退出存活与显式关闭验证通过。

- v0.3.13 smoke 包的实际 Electron 与内置 Node 上复测两端混合附件。Chrome 和桌面均发送 PNG、超过 8 MiB 的 CSV 与中文提示，普通文件可按路径读回，Runtime 关闭后删除暂存文件。

- 原包、ZIP 解包与只读挂载 DMG 的应用通过严格签名，ZIP 和 DMG 通过 Gatekeeper 与公证票据校验。更新清单的 SHA-512、大小及 blockmap 覆盖长度匹配。草稿五附件的 SHA-256、大小和 uploaded 状态与本机一致。

- 公开无认证五附件均 HTTP 200，长度与本地匹配，latest-mac.yml 下载内容逐字节相同。Homebrew cask 版本为 0.3.13，DMG SHA-256 一致。主分支工作区干净，发布标签与远端主分支指向 cd9926f。
- 2026-11-20T08:34:27Z 用户要求重试 103。已再次检查 IPv4、mDNS 主机名及两个已知 IPv6 地址，SSH 均返回 No route to host，WebUI 17777 无法连接。保留 v0.3.13 正式安装包，103 未改动。
- 2026-11-20T08:49:19Z SharkBay 会话内到 10.0.0.103 的路由为 en0，ping 立即返回 No route to host。向 10.0.0.103:22 发起 NWConnection，系统报告 Local network prohibited，`NWPath.UnsatisfiedReason.localNetworkDenied`。未修改本机权限。
- 2026-11-20T10:26:51Z 严格主机密钥检查下的 SSH 已连通 `SharkMBP-M2`，当前 SharkBay 为 0.3.12，主机为 arm64，外部 WebUI 返回 HTTP 200。
- 2026-11-20T10:31:25Z 103 暂存 ZIP 的 SHA-256 匹配正式发布，解包版本为 0.3.13，严格签名、Gatekeeper Notarized Developer ID 和公证票据验证均通过。旧 Runtime 的 `terminal.list` 显示两个会话均为 `running`，旧桌面及 Runtime 继续运行。
- 2026-11-20T10:31:59Z 已预备份 legacy 与 Runtime 配置，权限为 600，逐字节比较通过。旧 Runtime 仍有两个终端进程，尚未替换应用或重启服务。
- 2026-11-20T10:34:57Z 103 已安装的桌面和内置 Runtime 均为 0.3.13，通过 strict/deep 签名验证。新桌面 PID 63984，Runtime PID 64007 监听 17777。旧桌面、旧 Runtime 和两个旧终端进程均已退出。
- 从本机访问 103，WebUI 首页、主 JS 和 capabilities 均为 HTTP 200，WebSocket hello 和 `config.get` 成功。两个项目均保留，legacy 与 Runtime 配置和切换前备份逐字节一致，备份的旧应用版本为 0.3.12。未在 103 的项目中创建测试终端或发送附件。

## Notes
- 团队镜像只读。正式更新前复核 103 活动终端，保留旧包与配置。
- 正式版 https://github.com/SharkUI/SharkBay/releases/tag/v0.3.13。切换前确认运行中终端已关闭，或获得结束会话的授权，并备份旧应用及配置。
