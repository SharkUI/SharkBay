---
kind: sharkbay_task
taskId: R7N4V9-u3960864-m81ae10
taskTag: R7N4V9
mode: task
title: 发布 v0.3.7 并安装启动远端最新版
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T03:59:30Z
updatedAt: 2026-11-17T04:22:07Z
completedAt: 2026-11-17T04:22:07Z
commits:
  - fab4ada07fabab0d165957957be64f544151dabc
  - ec306d41583dc60db46a9805b0cb503aef70221d
  - e1fa925afc0384fcecf585cbaf576e260d0c159e
  - da25db636fda20043a700514f6d6c3375209a730
---

## Summary
已提交推送固定端口、局域网支持和用户确认的 CSS 微调，发布 Developer ID 签名、公证的稳定 Latest v0.3.7，并同步 Homebrew。已通过 SSH 在用户指定主机安装启动 0.3.7，WebUI 监听全部 IPv4 的 17777 端口，旧配置保留且跨主机授权/WS/命令验证通过。

## Files
- README.md
- CHANGELOG.md
- package.json
- package-lock.json
- electron/runtime-client.ts
- src/server/main.ts
- src/server/http-server.ts
- src/renderer/bridge/web-bridge.ts
- src/renderer/clipboard.ts
- src/renderer/App.tsx
- src/styles/app.css
- tests/web-runtime-integration.test.ts
- scripts/verify-packaged-runtime.mjs
- release/v0.3.7/（忽略的正式发布产物）
- SharkUI/homebrew-tap/Casks/sharkbay.rb（发布同步自动提交）
- 远端 /Applications/SharkBay.app
- 远端 ~/.sharkbay/install/v0.3.7/（安装暂存、旧配置和旧应用备份）
- .sharkbay/tasks/R7N4V9-u3960864-m81ae10-release-v0-3-7-install-remote.md

## Work
- 用户授权 commit、push、新版本发布及远端 SSH 安装启动；版本默认递增至 0.3.7。
- 已读取协议、AGENTS.md、docs/release.md 和团队发布上下文；参考 R8V3K6-u3960864-m81ae10、R5N8K2-u3960864-m81ae10、P7W4K2-u3960864-m81ae10 与 L8R3W7-u3960864-m81ae10。
- 计划：核对改动与远端环境 → 版本与发布说明、提交推送 → 隔离签名公证打包与附件核验 → GitHub 稳定版和 Homebrew 同步 → 远端安装启动并从局域网验证。
- 启动页 CSS 属于既有未提交修改，已询问是否包含；等待答复期间不暂存该文件。
- 远端确认 arm64 macOS，现有 /Applications/SharkBay.app 为未运行的 0.3.0，无活动 Runtime；当前用户可写 Applications，Homebrew 可用。
- 远端 main 与本地同步；线上 Latest 为 v0.3.6；本机 Developer ID 签名与 sharkbay-release 公证凭据有效。
- 已将 package.json/lockfile 更新为 0.3.7，README 和 CHANGELOG 描述固定端口、LAN 授权及旧 Runtime 重启要求。
- 已创建功能与发布元数据提交 fab4ada；随后用户明确要求包含 CSS，追加 ec306d4，将三列启动器布局及相应更新记录纳入正式发布。
- 正式构建 worktree 位于系统临时目录，固定到 ec306d4，包含本次用户确认的全部改动。
- fab4ada 与 ec306d4 均已推送 origin/main，远端分支确认指向 ec306d4；原工作区干净。
- 隔离 worktree 完成 npm ci、类型检查和 480 项测试，正在生成本地 smoke app；远端旧配置仅有一个项目，旧配置将保留。
- smoke 包清理验证失败定位为脚本未覆盖随机端口，退出后访问到了用户的现有 loopback 17777 Runtime；测试实例实际已退出。修正隔离脚本的 SHARKBAY_RUNTIME_PORT=0，并让 ps 诊断在进程已退出时保留原始异常，不改用户实例。
- 已提交推送验证脚本修正 e1fa925，隔离 worktree 更新至该提交；包内 Runtime 验证重跑通过。正式 Developer ID 构建与公证已启动，输出到 release/v0.3.7。
- 正式 app 的 Developer ID 签名完成并进入 Apple 公证；包内 app/runtime 版本均为 0.3.7，编译测试未被打包。
- Apple 提交 8efa0c83-b04c-4413-989f-914edb028e23 状态 In Progress；准备远端安装目录与旧应用/旧配置备份，正式安装仍在稳定版发布之后。
- Apple 公证通过，正式 DMG/ZIP、两份 blockmap 和 latest-mac.yml 已生成；远端旧应用及旧配置备份完成。
- 包内最终 Runtime 验证通过，ZIP 解包签名/票据通过；五附件校验清单保存到 release/v0.3.7/asset-checksums.json，准备上传草稿并核对远端摘要后公开。
- v0.3.7 注释 tag 已推送，指向 e1fa925。GitHub 草稿 release 448119739 已创建，小附件已上传，两个主附件上传中；尚未公开。
- 同时将已验证的正式 ZIP 传到远端安装暂存目录，待正式发布后再替换旧应用。
- GitHub 五附件全部上传完成，并在草稿状态逐项核对文件名、大小和 GitHub SHA-256；全部与本地一致，准备公开为稳定 Latest。
- 远端暂存 ZIP 摘要、app 版本、严格签名和 Gatekeeper 通过；使用远端实际 macOS/内置 Node 运行隔离包内 Runtime 验证也通过。
- v0.3.7 已作为稳定非草稿 Latest 发布：https://github.com/SharkUI/SharkBay/releases/tag/v0.3.7；Homebrew 同步工作流 44016310500 已触发。
- 远端 /Applications/SharkBay.app 已原子替换为 0.3.7，原应用与配置备份保留，旧配置 SHA-256 未变；已发出正常启动命令，继续验证主 Runtime 和局域网访问。
- 远端桌面主进程与 Runtime 正常运行，Runtime PID 73294 监听 *:17777，配置保留 1 个项目；从本机跨主机完成页面、一次性授权、WebSocket 和 config.get 命令验证。
- Homebrew 工作流 44016310500 成功，自动提交 da25db6，cask 版本 0.3.7 与正式 DMG 摘要一致。
- 五个公开下载 URL 与生产 manifest 验证通过；临时构建 worktree、挂载/解包目录和远端安装暂存 ZIP/新版解包目录已清理，保留正式发布产物、旧应用及配置备份。

## Verification
- 提交前 `npm run typecheck`、`npm test`（73 文件 / 480 项）与暂存差异检查全部通过；线上不存在 v0.3.7 tag。
- 最终发布提交的隔离 worktree `npm run typecheck`、`npm test`（73 文件 / 480 项）全部通过。
- 编译 WebUI 验证通过（静态资源、授权、WS、真实 PTY、退出清理）；包内验证首次发现上述测试端口隔离问题，待修正重跑。
- 修正后 `node scripts/verify-packaged-runtime.mjs` 通过：内置普通 Node 自动启动、SQLite/config、页面、真实 PTY、桌面退出后继续运行和显式停止清理。
- 正式 app `codesign --verify --deep --strict` 通过，ASAR 与外置 Runtime 版本检查通过。
- 最终 app Gatekeeper 返回 Notarized Developer ID，stapler validate 通过；ZIP 解包 app 的版本、严格签名、Gatekeeper 与公证票据均通过。
- DMG 镜像 CRC 验证通过；latest-mac.yml 的大小、SHA-512 与两个主附件一致，两份 blockmap 分块总尺寸与校验数量正确。
- 最终编译 WebUI 经真实 Chrome 局域网地址加载，9 个启动器呈三行三列布局；隔离页面和 Runtime 验证后清理。
- DMG 只读挂载后的 app 版本、严格签名及公证票据通过，已卸载挂载点并清理临时目录。
- 草稿附件核验结果保存在 release/v0.3.7/remote-asset-verification.json；上传完成前未公开发布。
- 远端 `verify-packaged-runtime.mjs` 验证通过（真实 Node/SQLite/PTY、客户端退出存活及显式清理）。远端额外 stapler 在线校验因无法连接 Apple CloudKit 失败，但 Gatekeeper 返回 Notarized Developer ID；同一 ZIP 的摘要及本机票据校验通过，未绕过系统校验。
- 远端安装后的 app 版本 0.3.7 和严格签名通过；生产 latest-mac.yml 已可公开下载，内容报告 0.3.7。
- GitHub Latest API 确认为 v0.3.7、draft=false、prerelease=false、5 个附件；五个公开 URL 返回 HTTP 200，公开 latest-mac.yml 与本地字节一致。
- 远端日常主 Runtime 版本 0.3.7、17777 端口、本地 HTTP 200/未授权 API 401、旧配置 SHA-256 保留均通过；本机访问远端 LAN HTTP、一次性授权、WS hello 与受保护 config.get 成功。
- Homebrew 工作流完成 success；cask 版本 0.3.7，SHA-256 bec8ecc427ccbe213f43b1fc4ad8ecaeb212a0ece7a31441ee1635fe0d49d4e6 与正式 DMG 一致。
- 最终原工作树干净，HEAD/origin/main 分歧 0/0，git diff --check 通过。

## Notes
- 团队上下文只读。正式包必须从确认的提交构建，不包含未经确认的工作区修改。
- 不将凭据、授权链接或私人配置写入任务；远端先检查已有进程与配置，再选择安装启动方式。
- 稳定版链接：https://github.com/SharkUI/SharkBay/releases/tag/v0.3.7；远端 WebUI 基址 http://10.0.0.103:17777/，首次使用仍需一次性连接授权。
- 远端旧应用与配置备份位于 ~/.sharkbay/install/v0.3.7/；日常应用位于 /Applications/SharkBay.app，新共享配置位于 ~/.sharkbay/runtime/，原 ~/.sharkbay/config.json 保持不变。
