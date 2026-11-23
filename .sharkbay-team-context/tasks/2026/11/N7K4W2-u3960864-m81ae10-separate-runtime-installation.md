---
kind: sharkbay_task
taskId: N7K4W2-u3960864-m81ae10
taskTag: N7K4W2
mode: task
title: 独立安装 SharkBay Runtime 与 WebUI
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-23T12:12:02Z
updatedAt: 2026-11-23T14:09:22Z
completedAt: 2026-11-23T14:09:22Z
commits:
  - a4d23ac1d984ad98f92bd38ce48ded258fdaf67b
---

## Summary
Runtime + WebUI 可独立打成 npm 包并用 sharkbay serve 启动，macOS 和 Linux 可选用当前用户的后台服务。现有 macOS 桌面包改为自动连接同用户的外部 Runtime。

## Files
- .sharkbay/tasks/N7K4W2-u3960864-m81ae10-separate-runtime-installation.md

- package.json
- tsconfig.runtime.json
- scripts/pack-runtime-npm.mjs
- src/server/cli.ts
- src/server/user-service.ts
- src/server/main.ts
- src/server/http-server.ts
- electron/runtime-client.ts
- scripts/verify-packaged-runtime.mjs
- README.md
- docs/release.md
- docs/current-facts.md

- tests/build-config.test.ts
- tests/runtime-packaging.test.ts
- docs/architecture.md
- docs/development.md
- docs/product.md

- release/sharkbay-runtime-0.3.13.tgz（本地 npm 验证包）
- release/mac-arm64/SharkBay.app（本地桌面验收包）

## Work
- 参考 S6R9W2-u3960864-m464da1、P7W4K2-u3960864-m81ae10 及 R4P8C3-u3960864-m81ae10。现有 Runtime、WebUI 和桌面已分开编译，桌面发布包会在本地连接失败时启动内置 Runtime。
- 计划先提供可独立安装的 npm 包和 CLI，再接入当前用户后台服务及桌面连接，最后用实际打包产物验证。发布和现有主机迁移留待单独执行。

- 本轮覆盖 macOS/Linux npm 包与用户级服务、现有 macOS 桌面发布包使用外部 Runtime。Windows 的宿主控制通道及 Windows/Linux 桌面正式发布另行验证。

- 已拆出 npm 包、命令入口和系统后台服务。npm 安装默认使用回环监听，原有直接 Runtime 入口保持 LAN 行为。桌面包去掉内置 Node、原生模块和服务入口，开发启动保留自动拉起。
- 参考 V7M4Q2-u0-m854bf2，复用 Lima 测试机的独立端口和临时配置验收，不接触其现有 SharkBay 服务。
- 打包范围为 Node 22.12+ 的 22.x、macOS/Linux，沿用同一发布版本号和锁定的直接依赖。发布说明规定先交付可安装的 Runtime 再提供仅含客户端的桌面更新。
- 用户要求先提交已验收的独立安装和桌面打包改动，再另做 Desktop UI 对齐。提交前复跑检查。
- 提交 a4d23ac1d984ad98f92bd38ce48ded258fdaf67b，纳入全部 17 个独立安装及桌面打包变更文件。

## Verification
- 首轮类型检查及 macOS 真实 npm 安装通过。旧的三个打包断言仍要求内置 Runtime，已更新为独立产物断言，复测中。
- 第二轮通过类型检查、701 项单元测试、51 项宿主测试、22 项集成测试及 git diff --check。
- macOS ARM64 从实际 npm tarball 安装，打包客户端连接外部 Runtime，验证 WebUI、SQLite、真实 PTY、桌面退出后会话继续运行。ASAR 和 Resources 检查通过。
- macOS ARM64 实测 LaunchAgent 注册、重复启用、回环监听、停止与锁释放。首次检查在异步退出完成前探测，改用有上限的轮询后通过。另验证显式 LAN 和前台运行时拒绝重复注册。
- Ubuntu ARM64 Lima 测试机使用隔离 profile 和端口实测 npm 安装、systemd 用户服务启停、WebUI 静态资源和真实 PTY，原测试服务保持运行。
- 提交前类型检查、git diff --check 均通过。默认 Node 22 与开发目录已有 SQLite ABI 不同，用匹配的 Node 24 重跑 701 项测试全部通过。

## Notes
- 未发布到 npm/GitHub，未部署 103。Windows 支持、Linux 桌面发行及 x64 安装仍需独立验收。
