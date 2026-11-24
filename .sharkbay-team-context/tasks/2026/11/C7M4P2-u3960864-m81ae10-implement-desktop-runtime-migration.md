---
kind: sharkbay_task
taskId: C7M4P2-u3960864-m81ae10
taskTag: C7M4P2
mode: task
title: 实施 macOS Desktop 与独立 Runtime 自动迁移
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-24T09:24:15Z
updatedAt: 2026-11-24T11:58:56Z
completedAt: 2026-11-24T11:58:56Z
---

## Summary
完成 macOS ARM64 的 0.3.13 → 0.3.14 → 1.0 迁移实现与本机隔离签名验收。保留升级前活动终端，通过 LaunchAgent 接管独立 Runtime，并在 Runtime 检查通过后才允许 1.0 由原生安装器接手。

## Files
- .sharkbay/tasks/C7M4P2-u3960864-m81ae10-implement-desktop-runtime-migration.md
- src/runtime/profile-lock.ts
- src/runtime/migration-state.ts
- src/runtime/migration-snapshot.ts
- src/runtime/application-runtime.ts
- src/runtime/control-server.ts
- src/server/http-server.ts
- src/server/main.ts
- src/runtime/mac-runtime-service.ts
- electron/main.ts
- electron/runtime-client.ts
- package.json
- scripts/prepare-runtime-bundle.mjs
- src/main/app-updates.ts
- src/server/cli.ts
- src/server/user-service.ts
- tests/app-updates.test.ts
- electron/desktop-migration.ts
- scripts/pack-macos-migration-desktop.mjs
- scripts/pack-macos-migration-runtime.mjs
- src/runtime/migration-package.ts
- tests/runtime-migration.test.ts
- docs/release.md
- src/runtime/control-client.ts
- release/sharkbay-runtime-1.0.0-macos-arm64.tar.gz
- release/desktop-migration-qa-local/
- release/desktop-migration-qa/run-local.mjs
- tests/app-update-lifecycle.test.ts
- release/desktop-migration-qa-local/chain.log

## Work
- 执行 B9M4K2-u3960864-m81ae10 两轮审查后的方案，参考 N7K4W2-u3960864-m81ae10 的用户级服务和 N6T8V2-u3960864-m81ae10 的签名升级验收。
- 顺序为持锁交接和回退、桥接和自包含包、隔离升级验证。现有 App 与当前运行会话继续使用现有 Runtime。

- 已开始接管事务、私有迁移记录、SQLite Backup API 和 LaunchAgent 的实现。检查阶段把 HTTP 和控制 socket 保持关闭状态，用快照副本验证用量 schema，避免失败回退覆盖旧进程重新接管后可能产生的写入。
- 本机正式 v0.3.13 ZIP 已存在。独立 1.x 更新仓库路径仍由桥接构建输入固定；本地先使用隔离测试资源。

- 已接通通过 v0.3.13 源码构建的独立桥接版、自包含 1.0 Runtime 产物和 1.0 Desktop 构建入口。桥接包使用同一正式发行 ZIP 内的旧 Runtime 文件树并记录逐文件清单。
- 默认回环，正常失败先由旧 Runtime 继续使用原数据。候选只在提交后修改真实数据。另提供持锁的预提交快照恢复操作。

- 构建器已支持真实 GitHub provider 的双回环 QA 源、隔离 App ID 与用户目录、专用端口和 LaunchAgent。Developer ID 本地签名 QA 不提交 Apple 公证。
- 原生链首次验证发现挂起的 Runtime 控制握手沿用两分钟调用超时。已单独为更新启动握手和 WebUI 健康探针设短超时，重新生成 QA 包并复测。

- 掉线安装复测确认缓存 ZIP 仍留在 0.3.14。服务恢复后的原生安装揭示 Electron 会先关闭窗口，原窗口关闭处理阻止了已授权的自动更新退出。仅依赖原生 before-quit-for-update 仍复现。改为安装获准后先关闭桌面窗口和连接，再交给原生安装器。拒绝安装时不会关闭窗口。

- QA 包在 app.asar 清单中显式保留 productName，以便 1.0 安装后找到桥接版的迁移记录。常规 SharkBay 包继续使用既有应用名。

- 完成本机双更新源和原生安装器的完整链路。修正 App 退出卡住及 QA 应用名元数据后，1.0 从桥接版的迁移记录连接原 profile。同步更新桌面启动 mock，以匹配 Electron 的 getName 接口。

## Verification

- 已通过实机临时 LaunchAgent 的接管 smoke。验证固定 SHA-256 与错误哈希、端口占用时状态保持未提交、别名目录与外部配置路径、内置 Node 22 macOS ARM64、WebUI、SQLite 和真实 PTY。
- Runtime WAL 与 updater 门槛专项 10 项测试通过。第一次 QA 打包修正了 codesign 内联 requirement 的参数格式，继续验证打包和升级链。

- 本地真签名通过原生安装器完成 0.3.13 → 0.3.14 原位替换，原 Runtime 与活跃 PTY 保留，冷加载 WebUI 和打开新 PTY 成功。桥接中间态通过旧 GitHub provider 选中桥接 ZIP，旧 Runtime 存活时未请求 1.x feed。
- 桥接包的旧 Runtime 路径清单含 2195 项，替换后完整。仅 5 个重新签名的 Mach-O 文件哈希不同，两版 QA App 严格签名检查通过。

- 三个隔离 ZIP 的 SHA-512 与各自 latest-mac.yml 一致。最新自动化结果为单元 704 项、宿主 51 项、集成 22 项，全部通过。
- 既有独立 macOS 测试机的 SSH 连接超时。本机使用隔离的 App、Runtime 路径、用户服务和两个 loopback feed 继续验证。

- 改为授权后关闭窗口的签名桥接版通过 0.3.14 → 1.0 原生替换，ShipIt 确认重新启动应用。已加专项断言验证安装获准前不会关闭窗口，关闭动作先于原生移交。
- 最终签名链退出码 0。0.3.13 → 0.3.14 原位完成，旧 Runtime 和活跃 PTY 保留，浏览器和新 PTY 可用。缓存 1.0 后挂起 Runtime，安装被拦截且版本仍为 0.3.14。恢复服务后原生替换并重启 1.0，原项目配置仍可读。杀死候选进程后 LaunchAgent 重启成功。再执行用户服务 bootout/bootstrap，重新打开 1.0，Desktop 从原 profile 连接，包内没有旧 Runtime。
- 最后一次 TypeScript 检查和 git diff --check 通过，单元测试 704 项通过。此前同一 Runtime 实现的宿主 51 项、集成 22 项通过。隔离应用退出，QA LaunchAgent 已移除。

## Notes
- 生产发布另行放行。桥接包需确认 1.x 更新地址、签名与固定 Runtime 摘要。
- 本地 QA 使用 Developer ID 签名和两个回环更新源。生产仍需在隔离 Mac 上执行整机重启与无系统 Node 验收，确定正式 1.x 更新仓库，并以公证产物核对正式更新源后放行。
