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
updatedAt: 2026-11-25T03:57:59Z
completedAt: 2026-11-25T03:57:59Z
commits:
  - fc1c6e02a9a909614302ea456044c42d4f610120
---

## Summary
完成 macOS ARM64 Runtime 自动迁移和实机验收。已公证的 v0.3.14 正式发布为 GitHub Latest，公开下载、更新入口与 Homebrew 均验证通过，README 和 Changelog 已更新。

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
- .sharkbay/reviews/C7M4P2-5O8RPP.md
- scripts/verify-macos-migration.mjs
- release/desktop-migration-qa-local/chain-audit-fixes.log
- electron/ipc.ts
- tests/profile-lock.test.ts
- release/desktop-migration-qa-local/adoption-standalone.log
- release/desktop-migration-qa-local/chain-standalone.log
- release/desktop-migration-qa/service-port-zero.log
- release/desktop-migration-qa-local/remote-chain.log
- release/desktop-migration-qa-local/remote-reboot.log
- release/desktop-migration/migration-inputs.json
- release/desktop-migration-single-repo-qa/
- release/desktop-migration-single-repo-qa/remote-no-system-node.log
- release/desktop-migration/bridge-production-build.log
- release/desktop-migration/bridge-runtime-verification.log
- release/desktop-migration/release-notes-v0.3.14.md
- release/desktop-migration/bridge/
- release/desktop-migration/bridge-notary-info.json
- release/desktop-migration/bridge-app-verification.log
- release/desktop-migration/bridge-zip-verification.log
- release/desktop-migration/bridge-dmg-verification.log
- release/desktop-migration/bridge-assets-verification.log
- release/desktop-migration/bridge-assets-checksums.json
- README.md
- CHANGELOG.md
- package-lock.json
- release/desktop-migration/bridge-github-draft.json
- release/desktop-migration/bridge-github-published.json
- release/desktop-migration/bridge-public-downloads.json
- release/desktop-migration/bridge-public-updater.log
- release/desktop-migration/bridge-homebrew-cask.rb

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

- 用户请求以独立 SharkBay Review 审计任务完成情况。请将 B9M4K2 的约定逐项与当前工作区改动、签名 QA 产物、升级日志、测试日志比对，标出可核验、中间态及无证据的交付，并给出当前 completed 状态是否合适和下一步。代码包含未提交的新文件，审查需覆盖这些任务相关文件。
- 已启动独立 Codex 完成审计，Review 运行 ID 为 `review-62266db6-82c7-4f12-9483-27e8c8ca6e0f`。
- 首轮审查因尝试申请沙箱提权执行签名检查而卡住，已取消重试。审查请仅用只读源码、工作区差异和已有 QA 日志；遇到环境限制记录为验证边界，直接继续报告即可，请勿申请提权、启动 App 或重跑安装流程。主会话已在现有权限下独立复查全部 QA App 严格签名。
- 第二轮独立完成审计已出具结论，Review 运行 ID 为 `review-7aeca9f7-3e25-4802-b8f6-5e84d2d729c4`，建议重开任务。
- 核实三个阻断。旧 Runtime 回退后未作废候选快照，显式恢复可能覆盖回退后的新数据。桥接超时检查与移除服务未和候选提交串行化，可能移除刚提交的服务。升级门槛验证当前进程，未验证 LaunchAgent plist 与下次登录启用状态。
- 后续先修复快照有效期、候选取消与提交互斥和持久服务校验，再处理自定义路径、已有独立服务、重启连接、锁崩溃恢复和打包目标保护。补齐相应断言后重跑签名链。

- 开始修复审计阻断。候选接管前只读原 profile，回退沿用实时数据并保留快照供检查。提交和取消改为每次尝试只允许一个持久决定。验证磁盘 plist 与实际 LaunchAgent 参数及启用状态后才放行更新。分别验证旧进程回退后的新写入、超时并发和实际登录配置，再重跑签名链。

- 三项阻断代码已改并跑通签名链。继续修复 Desktop 保持打开时对重启后的 Runtime 连接，重连沿用既有 profile 检查，不重试已经发出的操作。

- 每次接管使用独立尝试 ID 和不可覆盖的持久决定。取消胜出时才允许卸载同一尝试的服务，再由旧 Runtime 接管现有数据。候选提交前的备份留作检查，停止提供在活 profile 上恢复旧快照的 CLI。
- 升级门槛校验同一 profile、当前进程、已注册参数和磁盘 plist 的 RunAtLoad、KeepAlive 与禁用状态。1.0 能重注册已核验的未加载 plist，自定义路径冲突会被拒绝。
- Desktop IPC 在后台服务重启后切换到新连接，窗口保持打开。显式打包目标使用新目录，版本库保存本地签名 QA 脚本。

- 继续完成已有独立 Runtime 复用、停用再启用和锁崩溃恢复。按 B9M4K2 验证同用户 LaunchAgent、版本与命令、实际 PID 和两把 profile 锁，匹配后让原进程和终端继续运行。新锁记录以原子方式发布，回收互斥由进程退出后自动释放。对旧版本遗留且无可核实所有者的锁保守处理。补强针对性用例后重跑签名链，并核验隔离 Mac 是否可用。
- 已实现私有记录复用 1.0.0 独立 Runtime，桥接启动及升级时核实真实 LaunchAgent、版本、程序、配置路径和双锁。macOS 服务停用保留原 plist，恢复时沿用已保存的启动参数。增加独立 Runtime 签名验收，覆盖外置 config、拒绝缺失 plist 的服务、原进程与 PTY 延续及停用恢复。
- 重复启停验收发现 launchd 可能先关闭控制 socket，再异步注销服务，立即启用会误将注销中的服务视为已注册。停用及候选回退改为等待确认卸载完成，随后重新打包复测。
- 保留 macOS 已保存服务的路径、可执行文件、端口与 LAN 选择。动态端口服务仍可启停，桥接自动复用要求固定端口。旧版没有可核实所有者的锁继续阻止接管。
- 用户提供远端验收机的新 SSH 地址，按 N6T8V2-u3960864-m81ae10 的历史主机身份恢复只读检查。
- 远端 `shark` 桌面已登录，继续在隔离的 App、profile、端口和 LaunchAgent 上跑签名升级链。重启前留存升级后的服务、profile 和启动时间，重启后先验证登录自启，再启动 Desktop。重启如需管理员权限，则保留验收现场等待本机操作。
- 在远端 `~/sharkbay-migration-C7M4P2` 留存升级后的 1.0 QA 应用和重启检查点。临时 GUI QA 执行器已正常退出，QA Desktop 已关闭，专用 LaunchAgent 保持注册。等待用户重启并登录后，执行远端 `scripts/verify-after-reboot.mjs`。
- 用户确认远端 Mac 已重启并重新登录，继续核对内核启动时间、登录自启的 Runtime、重新打开 Desktop 后的连接及 miniCPM 恢复状态。
- 完成远端重启验收后关闭 QA Desktop，卸载专用 LaunchAgent 并将其 plist 归档至远端 QA 目录。保留检查点、应用及验收数据供复核。
- 用户批准在原仓库发布，先给旧版两周自动升级到 0.3.14 的时间，此后旧用户可手动补装桥接版。此决策替代 B9M4K2 的双仓库安排。改用同仓库的独立桌面更新渠道，更新打包与发布说明，验证 0.3.13 在窗口内自动迁移、截止后无法自动安装 1.0，以及已迁移的 0.3.14 可以升级。正式发布仍按原验收门槛。
- 0.3.14 在 `SharkUI/SharkBay` 同时发布 `latest-mac.yml` 与 `desktop-mac.yml`。1.x 只发布桌面渠道元数据，仍停留在 0.3.13 的用户在窗口结束后可手动下载 0.3.14。Runtime 归档固定在 v0.3.14 的下载地址，正式构建输入已准备。
- 用户批准在 103 暂移 Homebrew Node 测试。先校验并预置单仓库 QA 包，再备份并移走 Homebrew Node 目录及对应命令链接，验证常规安装路径不可用后跑完整签名链。无论结果如何都恢复原文件，并检查 miniCPM 直连和 443 HTTPS。
- 在 103 用 GUI LaunchAgent 执行测试，设置退出恢复和超时或重新登录恢复，预置程序来自已校验的自包含 Runtime。Node 恢复后卸载两个临时 QA 作业并归档恢复配置。
- 用户要求继续 0.3.14 正式打包与 Apple 公证。用固定 SHA-256 的已验 Runtime 和 v0.3.13 正式旧包构建，公证后核对 Gatekeeper、DMG、ZIP 和两份更新清单，并在本地验证分发资产。参考 R5N8K2-u3960864-m81ae10 的 Apple 公证记录。
- 正式 App Developer ID 签名通过，Apple 公证提交 `0a7641cd-055d-4c49-a9d9-6cf4876e3c85` 正在处理中。准备 0.3.14 升级须知草稿。
- Apple 已接受 0.3.14 公证，正式 ZIP、DMG、两个 blockmap、两份更新文件及固定 Runtime 归档备齐。尚未公开发布，等待明确放行后再开启两周窗口。
- 用户批准公开发布 0.3.14 并要求更新 README。同步更新 Changelog，提交已验迁移源码和文档，固定发布标签。先核对 GitHub 草稿的七个附件，再发布为 Latest，验证无认证下载并登记两周窗口。参考 R4P8C3-u3960864-m81ae10 的正式发布记录。
- 已提交迁移代码、0.3.14 版本、README 下载和升级说明及 Changelog。提交为 `fc1c6e02a9a909614302ea456044c42d4f610120`。
- main 和 v0.3.14 标签已推送。正式 Release 草稿 ID 为 457630950，正在上传附件。GitHub README 内容与提交一致，本轮类型检查及 708 项单元测试通过。
- GitHub 草稿七附件的大小、SHA-256 和上传状态均匹配，v0.3.14 已于 2026-11-25T03:55:17Z 成为公开稳定 Latest。两周窗口至 2026-12-09T03:55:17Z，当前正在验证公开下载并同步 Homebrew。
- Homebrew 同步工作流 45543311401 成功。SharkUI/homebrew-tap 自动提交 `7ec131380aa0e9637ce5eec7af140eaa8f315c91`，cask 更新至 0.3.14。

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
- 审计期间重新执行 `codesign --verify --deep --strict`，0.3.13 QA、0.3.14 QA、1.0 QA 三个 App 全部通过。
- 对照桥接回退分支、快照恢复条件、候选提交点及 launchctl 检查逐项确认阻断成立。本机双更新源原生升级链与三组自动化日志继续有效。生产所需的整机重启、无系统 Node、公证和正式源证据仍待完成。

- 专项用例覆盖提交和取消竞态、旧 Runtime 回退后写入的配置和 SQLite 数据进入下一次快照、显式打包目标已有文件时拒绝覆盖。最终 TypeScript 与 git diff --check 通过，705 项单元、51 项宿主、22 项集成测试通过。
- Developer ID 本地签名链退出码 0，三个 ZIP 的 SHA-512 与更新元数据一致。Runtime 活跃但 plist 缺失时阻止已缓存的 1.0 安装，Runtime 挂起时也会拦截。恢复后二次签名更新完成，1.0 重注册 LaunchAgent 并读取原 profile。最后杀掉新的 Runtime，保持同一 Desktop PID，验证新进程启动后经 Electron IPC 成功执行终端查询。
- 新增重连验收第一次运行因 CDP 表达式在非 async 上下文使用 await 而失败。修正验收表达式后重跑整条签名链通过。
- 8 项 profile 锁回归通过，覆盖写入与回收中途 SIGKILL、独立进程竞争、拒绝不明确的旧锁。隔离 arm64 Mac 的 SSH 探测超时，主机名也未能解析。
- 首轮独立服务复用通过签名升级和单次停用恢复。初次脚本误等原生重启后已消失的调试端口，改为核实新 Desktop PID 的启动日志。增加重复启停后复现 launchd 注销竞态，末轮复测进行中。
- 最终 TypeScript、`node --check` 和 `git diff --check` 通过。单元 708、宿主 51、集成 22 项全部通过。三个本机 QA App 深度严格签名有效，ZIP 大小及 SHA-512 与更新元数据一致，Runtime SHA-256 与桥接构建输入匹配。
- 两条最终签名链均退出 0。验证 0.3.13 → 0.3.14 → 1.0 原位更新、旧 PTY 持续输出、最终 1.0 的 WebUI 和新 PTY。1.0 已缓存时，缺少 plist、挂起 Runtime 后普通退出再打开以及直接安装 IPC 都没有提前安装。新版 LaunchAgent 可恢复，已打开的 Desktop 可重连。
- 已有独立 1.0.0 Runtime 在签名更新中保持 PID 和 PTY 输出。使用外置 config 复用后，无启动环境覆盖也能打开 1.0。对迁移服务和已复用的独立服务重复停用、启用，原 plist 与 profile 保留，已打开的 Desktop 可重连。动态端口服务单独通过重复启停。
- 两条本机链都在 PATH 不含系统 Node 的环境运行，隔离 LaunchAgent 使用包内 Node。仍需在干净 Mac 实测系统未装 Node、注销和整机重启。旧 GitHub 正式 Latest 实查为 v0.3.13。Apple 公证凭据可查询历史，最终产物公证及正式更新源验收尚待确定发布仓库。
- 严格校验主机密钥后连通 `shark@10.0.0.103`，已知 ED25519 公钥与原地址一致，当前主机名为 `SharkMBP-M2`，Apple M2 Max，macOS 26.3.1。远端保有旧验收目录。控制台尚无桌面用户，`shark` 的 GUI launchd 域当前不可用。SSH 默认 PATH 未列出 Node，但 Homebrew 已安装 Node v25.8.2 与 npm 11.12.1。
- 桌面登录后，远端以包内 Node 和只包含系统目录的 PATH 运行完整签名升级链，退出码 0。三个版本实现原地更新，服务中断时缓存升级受阻，Runtime 重启与重复启停后 Desktop 自动重连。已核对远端检查点。重启前 miniCPM 健康检查 HTTP 200，其系统 LaunchDaemon 已配置开机启动。
- QA 服务在远端仅监听 `127.0.0.1:18573`。SSH 会话无免密重启权限，已通知用户执行重启和桌面登录。最后一次检查仍为原内核启动时间。
- `SharkMBP-M2` 整机重启及 `shark` 重新登录后，核对内核启动时间已改变。先于 Desktop 启动验证原 LaunchAgent 已拉起包内 Node，控制握手 PID 与两把 profile 锁及注册服务一致。原配置和项目内文件保留，WebUI、重启后新 PTY 和 1.0 Desktop 连接均通过。验收前后 miniCPM 健康检查皆为 HTTP 200，正式 WebUI 与 HTTPS 服务已启动。
- 单仓库 QA 三个安装包通过 Developer ID 严格签名、包内渠道、ZIP 大小和 SHA-512 核验。窗口前后用同一个 QA 更新源跑完整原生安装链，旧版只命中 0.3.14，切换后未下载 1.0 ZIP，已迁移的桥接版则使用桌面渠道顺利升级。
- 单仓库独立 Runtime 复用链通过，原 Runtime 和活跃终端跨安装保留，停用和重新启用后重连。TypeScript、两个脚本语法检查、`git diff --check` 和 708 项单元测试通过。QA 应用和专用 LaunchAgent 已退出并清理。本次使用回环更新源，正式 GitHub Latest 仍为 v0.3.13，两周窗口从 0.3.14 正式发布时开始。
- 103 的 Homebrew Node 25.8.2 安装目录及 node、npm、npx 链接整体暂移，正常 PATH 和常用安装路径均查不到系统 Node。使用包内 Node 完成单仓库 `0.3.13 → 0.3.14 → 1.0` 签名原生升级，1.0 能启动已迁移的 LaunchAgent，Runtime 替换和重复启停后 Desktop 仍可重连。执行器退出码 0。物理重启证据另见 `remote-reboot.log`。
- 逐项核对 Homebrew 链接原样恢复，Node v25.8.2 和 npm 11.12.1 可运行。测试前、测试期间及恢复后 miniCPM 的 HTTPS 健康检查均为 HTTP 200，恢复后 8080 直连也为 HTTP 200。QA profile、临时 LaunchAgent 与 watchdog 已清理。
- 正式 App 的标识及版本、生产 GitHub 仓库、桌面渠道与 Runtime SHA-256 固定值匹配。内置旧 Runtime 的 2195 个路径及符号链接核验通过，仅 5 个 Mach-O 文件因重新签名而变化。
- 构建退出码 0，公证状态 Accepted。正式 App、最终 ZIP 解包的 App、最终 DMG 只读挂载的 App 均通过 strict/deep 签名及 Gatekeeper Notarized Developer ID、stapler 校验。DMG 校验通过，已卸载只读验收挂载。
- 两份更新文件逐字节相同，ZIP 和 DMG 的大小、SHA-512、blockmap 长度均与最终产物吻合。用生产配置和最终更新文件模拟 GitHub 响应，旧版及桥接版分别找到各自的文件并解析出正确的正式下载地址。7 个待发布资产的 SHA-256 已复核，GitHub Latest 实查仍为 v0.3.13。公开上传后的真实下载校验待执行。
- GitHub Latest 为正式发布 v0.3.14。七个公开附件及 Latest 下的两份清单均无认证下载成功，HTTP 200，字节数及 SHA-256 与本机完全一致。真实 GitHub 更新查询中，0.3.13 和已迁移桥接版分别读到自己的清单。Homebrew cask 的版本和 DMG 摘要匹配，公开 README 与标签代码一致。

## Notes
- v0.3.14 已正式发布，保留该标签的 Runtime 下载包与安装包。最早于北京时间 2026-12-09 11:55:17 发 1.0。1.0 使用同一仓库的 `desktop-mac.yml`，保留 README 中晚到用户手动补装 0.3.14 的路径。

- 后续 1.0 正式包仍需单独放行，继续按 B9M4K2 检查最终产物与发布通道。

## Reviews

- Reopen — the signed local upgrade chain passed, but rollback can overwrite newer profile data and the 1.0 installer can be authorized without proving the Runtime will start at next login. — `.sharkbay/reviews/C7M4P2-5O8RPP.md` (2026-11-24T12:14:03Z)
