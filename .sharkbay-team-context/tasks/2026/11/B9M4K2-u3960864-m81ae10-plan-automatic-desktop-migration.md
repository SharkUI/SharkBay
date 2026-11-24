---
kind: sharkbay_task
taskId: B9M4K2-u3960864-m81ae10
taskTag: B9M4K2
mode: task
title: 规划 macOS Desktop 自动迁移至 1.0
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a2082f-7bb5-7830-a7b1-a85c81393c1c
branch: main
createdAt: 2026-11-24T08:41:13Z
updatedAt: 2026-11-24T09:18:31Z
completedAt: 2026-11-24T09:18:31Z
---

## Summary
完成 macOS 0.3.13 经 0.3.14 自动迁移到独立 Runtime 和 1.0 Desktop 的方案及两轮独立审查。方案明确了持锁备份恢复、迁移提交、用户级服务交接、原生更新移交和重启后验证，并将真实签名升级和故障注入列入发布验收。

## Files
- .sharkbay/tasks/B9M4K2-u3960864-m81ae10-plan-automatic-desktop-migration.md

- .sharkbay/reviews/B9M4K2-Q8A5I0.md
- .sharkbay/reviews/B9M4K2-IZUQYU.md

## Work
- 参考 N6T8V2-u3960864-m81ae10 的签名自动升级验收，N7K4W2-u3960864-m81ae10 的独立 Runtime 交付，及 P9K4M2-u3960864-m81ae10 的 Desktop 对齐。
- 旧版事实以 v0.3.13 源码和正式包为准。Desktop 退出只断开客户端，旧 Runtime 可以继续运行。旧 control stop 收到请求后无条件安排停止，会影响仍在运行或刚打开的 PTY。

### 发布与迁移方案

1. 从 v0.3.13 构建兼容桥接版 0.3.14，延续原 App ID、Developer ID 签名及升级关系。复用已发布包的 Resources/runtime 文件树和相对路径，记录签名前的文件清单，并验证最终签名包中的 Node、WebUI、SQLite 原生模块、PTY spawn-helper 仍可被跨 App 替换存活的旧进程使用。
2. 旧 GitHub 仓库 SharkUI/SharkBay 的 Desktop 更新渠道以 0.3.14 为最终版本。冻结该仓库面向旧 updater 的稳定 Releases，禁止后续 Desktop 或 Runtime 单独发版改变旧 GitHub provider 选中的标签，并保留桥接更新元数据、签名安装包和固定版本 Runtime 归档供迟到用户升级。1.x 发布到独立 GitHub 更新仓库，实施时先固定生产与 QA 的仓库地址，再构建桥接包。签名桥接 App 固定 macOS ARM64 Runtime 版本、架构和归档 SHA-256，或固定校验独立签名清单的信任根。归档自带 Node 22、WebUI 和匹配 ABI 的原生依赖。验证摘要、架构、归档条目路径、链接与权限之后，原子安装到用户拥有的版本目录。
3. 仍在运行的 0.3.13 Runtime 继续服务并保留现有终端。桥接版后台暂存新包和已核实的 profile 信息，旧进程存活期间不注册或启动候选服务。暂存完成后提示「已准备，下次重启 Mac 并打开 SharkBay 时切换」。首次交接由桥接 App 在启动时触发。如果旧进程已自然退出，也可在下次打开桥接 App 时切换。离线且未暂存时使用内置 Runtime，恢复网络后准备下一次切换。接管完成后的登录自启由 LaunchAgent 负责。
4. 桥接 App 启动时先检查暂存状态和 profile 所有者，然后复用独立 Runtime 的 macOS 用户服务安装逻辑注册 LaunchAgent，由受信任版本目录内的 Node 和 Runtime CLI 启动候选。桥接版与 1.0 共用 plist 生成、标签 `xyz.sharkbay.runtime`、服务参数及环境白名单。以 `serve --background` 启动，显式传入已确认的 data-dir、实际使用的自定义 config、端口和监听选项。按有效 profile 探测所有者，原子落盘并注册到用户 GUI 域。已有同标签服务时，只复用已验证匹配的服务，发现冲突则提示并保留原服务。普通 `service enable` 继续拒绝运行中的前台实例。旧 Runtime 如果在探测后抢先启动，候选以实际持锁为准并让出；回退时先解除本次新增候选服务的自动重启，再取得锁恢复数据。
   - 路径沿用旧 Desktop 约定。从当前启动的 `SHARKBAY_RUNTIME_DATA_DIR` 和 `SHARKBAY_CONFIG_PATH` 取显式值，默认使用 Runtime 数据目录及其下的 `config.json`。按锁逻辑对数据目录和已有配置取 realpath，对尚不存在的默认配置使用父目录 realpath 加文件名。遇到已运行的旧实例时，使用 canonical 数据目录连接控制 socket，并核对两把锁的所有者与握手 PID，避免把 socket 当作配置路径的证明。桥接版将核实后的路径对持久化在 App 可读取的私有迁移记录中，供冷启动和 LaunchAgent 使用。1.0 无显式覆盖时从已提交的记录发现同一 profile；显式覆盖与待迁移记录冲突或无法确认有效路径时，暂停自动交接并提示确认。候选与恢复都重新核对路径。
   - 候选先取得与旧版相同的 canonical data-dir 和 config-path 锁，再通过 Runtime 启动准备入口备份配置和 profile。在应用打开或迁移 SQLite 之前，用 SQLite Backup API 生成含已提交 WAL 数据的独立快照，验证完整性并持久化快照完成标记。恢复也须先取得同一组锁，在锁内恢复文件、处理目标库遗留的 WAL 与 SHM，再衔接内置 Runtime 的持锁启动。
5. 候选验证期间以受限探针确认控制 API、WebUI 静态资源、配置、SQLite 样本、服务注册和实际运行实例。持久化接管提交标记后，才允许真实 WebUI 和控制 socket 写入、启用 watcher、安排 5 秒用量回填和初始化 Telegram，相关延迟工作执行前仍须确认当前实例已提交。提交前失败可在同组锁下恢复快照，提交后只从当前数据恢复并保留原快照。复用已安装的独立 Runtime 时，验证受信身份、版本、进程可执行路径、canonical profile 和配置，以及 LaunchAgent 的实际运行目标和登录启动能力。前台或身份不明的实例保留运行，等待其自然退出，或由用户完成服务安装后重新验证。
6. 在任何 1.x 检查或下载前关闭 `AppUpdates` 的 `autoInstallOnAppQuit`，并移除 `electron/main.ts` 中允许 `appUpdateInstall` IPC 设置 `installUpdateOnQuit` 后由 `before-quit` 直接安装的旧路径。ZIP 可缓存于应用层。手动检查和定时检查均要求独立 Runtime 已提交接管、健康且已核实 LaunchAgent 的持久启动目标。安装按钮只调用唯一受控入口，入口在 `quitAndInstall` 将 ZIP 移交给 Squirrel.Mac 之前重新核验。普通退出只清理桌面资源。移交后若 Runtime 掉线，1.0 依赖已验证的服务恢复，无法恢复时提供明确的 Runtime 修复入口并保留当前数据和原快照。LAN 沿用明确选择，默认绑定回环，开启时展示可用访问地址。

### 测试环境与证据

- 以原 v0.3.13 源码构建签名 QA 老版本。同一条链的三个版本共用专用 QA App ID、兼容签名链、App 原地替换目标、profile、端口及 LaunchAgent 标签，整条链与生产隔离。用旧版同款 GitHub provider 在专用 QA GitHub 源上验证 Latest、标签和 ZIP 请求，再用分开的 QA 1.x 源完成真签名安装。另核对生产 GitHub 旧源和新源的元数据。
- 在 Apple Silicon Mac 的独立测试用户或同等隔离环境准备两处 Git 项目、带记录的任务目录、可查询的用量 SQLite 和一个通过 PTY 持续输出的脚本。用 WebUI 和 Desktop 一起测试。关键证据包括 App 版本、Runtime PID 与可执行文件路径、PTY PID、锁与端口、各阶段请求日志、项目与数据库前后结果。
- 单元层覆盖阶段转换、安装身份识别、已安装或重复迁移、切换许可、失败回退。集成层以临时 profile 运行两个实际 Runtime，注入端口占用、下载错误、损坏归档和各阶段中断。真正的签名更新、macOS 重新启动和数据恢复由实机测试证明。

| 场景 | 验收证据 |
| --- | --- |
| 0.3.13 带活动终端收到 0.3.14 | 真实签名升级后原 Runtime 与 PTY PID 和输出连续。以空缓存加载 WebUI，打开并关闭新 PTY，查询并写入 SQLite 用量样本。 |
| 新 Runtime 已暂存，旧进程在运行 | 退出并打开桥接 App 后旧 PID 和 PTY 仍可用，候选服务尚未注册或启动，1.x 更新源无检查或下载请求。另一个客户端新开 PTY 不会触发自动停止。旧进程自然退出后，下一次打开桥接 App 由共用安装逻辑注册服务。 |
| 没装 Node/npm 或构建工具的干净用户完成迁移 | 重启后直接由 LaunchAgent 启动受信 Runtime。记录服务标签、PID、可执行文件、两处 canonical 锁路径和同一所有者。两个项目、任务和历史用量保留，WebUI 与最终 1.0 Desktop 可新建 PTY。替换掉 0.3.14 后再验证候选被终止时的服务恢复，以及注销登录和重启后直接打开 1.0。 |
| 兼容独立 Runtime 已经存在 | 经身份、路径、锁和登录启动能力核验后复用，现有终端保持运行。前台实例、其他 profile、未知安装或不兼容协议留在桥接版并显示原因。 |
| 下载、签名校验或解包失败 | 保留旧 Runtime，损坏归档不进入安装目录，允许重试，1.0 不被请求或安装。 |
| 新 Runtime 启动失败或端口已占用 | 不修改其他进程，释放迁移临时状态。允许时恢复内置 Runtime 与快照，检查配置、SQLite 和项目可访问。 |
| 各阶段发生中断及并行启动 | 在探测后备份前及恢复中尝试抢占 data-dir 或 config-path 锁。在锁创建与回收、解包、备份、提交前后注入中断。用强杀前仅写入 WAL 的已提交样本核对备份和恢复，证明同一 profile 同时最多一个所有者。 |
| 1.0 ZIP 已缓存后 Runtime 掉线 | 分别验收普通退出、重新打开和点击重启安装（含直接调用安装 IPC）均未提前触发原生暂存，App 版本仍为 0.3.14。健康恢复并显式移交后安装 1.0；再测试已移交、尚待安装时服务退出后的恢复。 |
| 很久后首次打开旧 App | QA 新源已有后续 1.x。记录同款 GitHub provider 从旧仓库的 Latest 选中 0.3.14 和桥接 ZIP。仅在迁移通过后，桥接版通过独立源获取 1.x。 |
| 接管提交前后中断 | 将探针阶段保持超过 5 秒，确认用量回填、Telegram、watcher 和真实写入均未启动，再中断并恢复快照。提交后、安装 1.0 前经用户通道写入样本并中断，重开后保留样本。另验证 1.0 运行后的显式回退与恢复。 |
| 离线冷启动与后续重启 | 无暂存时桥接版以内置 Runtime 提供服务。联网暂存后重开 Desktop 仍保留旧进程，再重启 Mac 并打开 Desktop 即可切换。 |
| 回环默认与 LAN 显式启用 | 从第二台设备验证迁移前 LAN 访问及迁移后的回环默认值，再启用 LAN，核对 UI 地址与实际连通性。 |
| 自定义数据目录及配置 | 以含符号链接的 data-dir 和目录外的 config 跑完整链。重启后通过 Finder 打开且无原 shell 环境变量，候选、恢复路径及 1.0 均使用同一 canonical 路径对和原数据。验证两把锁的同一所有者、无默认 profile 被误建或改写，路径冲突时暂停自动迁移。 |
| LaunchAgent 的注册与管理 | 验证共用的标签、程序参数、环境白名单和日志路径，1.0 对同一服务重复启用和停用均正常。探测后若旧进程抢先启动，候选等待，原进程与原数据保持可用；已有不同配置的同标签服务时，迁移暂停并保留原服务。 |

### 发布门槛

- 先验证两个测试源的完整迁移链与兼容性，再准备生产 Runtime 下载包、1.0 Desktop 和新源。只有产物签名、校验和、新源和旧用户自动路径通过后，才放行旧源的 0.3.14。
- 实机放行须逐项记录通过证据。旧 GitHub provider 只能选中桥接版，原 Runtime 可跨签名 App 替换，持锁恢复保留 WAL 已提交样本，接管提交前后保留正确数据，缓存 ZIP 掉线时任何退出或安装 IPC 均未提前移交，自定义路径可跨登录继续连接，LaunchAgent 与 1.0 服务管理兼容，且无 Node、无桥接 App 时下一次登录或开机可直接连接。上线时复查旧源 Latest、1.x 元数据、签名产物和固定摘要。
- 独立审查重点是旧进程跨 App 替换、候选包信任与可执行性、profile 单一所有者、崩溃恢复与 SQLite 备份、缓存更新的安装门槛，以及测试是否能观测这些条件。请按严重性给出可操作缺口。
- 通过 SharkBay 启动独立 Codex Review，会话 term-mwug3mp6-3，运行 review-c6832fc7-abf3-4db3-9b54-8bf7dc8d08e5。

- Review 完成，采纳三项阻断和相关主要发现。将故障恢复的提交点放在向真实客户端和集成开放之前，并采用候选先由 LaunchAgent 启动的方案。长期在线用户沿用自然重启切换路径。
- Reasonix 第二轮审查（review-3c577946-1e5f-4bc3-9815-33862d75a6c4）通过。三项主要发现已落实。采用首次打开桥接 App 时延后注册服务，保留自然重启的触发方式。更新通道、延迟工作和自定义 profile 的规则均已写入方案。

## Verification
- 已核对 v0.3.13 Desktop 退出路径、Runtime 控制与 profile 发现，以及既有 macOS 真签名升级验收。已准备独立审查所需的测试矩阵。

- 已读独立 Codex 报告并核对当前源码。Runtime 在取得 profile 锁后执行启动准备，SQLite 使用 WAL，锁定版本的 MacUpdater 开启退出安装时会在下载后请求原生 updater，现有服务安装会拒绝运行中的前台 Runtime。
- 本轮验证的是任务和迁移计划。签名升级、重启、SQLite 故障注入及发布源验收由实施阶段按矩阵执行。
- 已核对 Reasonix 报告及任务归属。对照 v0.3.13 和当前代码确认安装 IPC 与 before-quit 分支、MacUpdater 下载完成后的原生移交条件、服务安装的前台实例检查，以及旧 Desktop 如何把配置覆盖转成 Runtime 参数。路径规范化与锁文件内容以旧版和当前 profile-lock 实现为准。

## Notes
- 本任务范围为方案和独立 Review。实现、打包和生产发布按后续任务执行。

## Reviews

- 方案需补齐 profile 交接、macOS 更新安装门槛和 1.0 冷启动保障后再实施。 — `.sharkbay/reviews/B9M4K2-Q8A5I0.md` (2026-11-24T08:44:14Z)
- PASS — 方案与源码核实一致，已采纳全部审查发现，无阻断；实施前需锁定 LaunchAgent 安装机制、两处退出安装门与 env 覆盖路径。 — `.sharkbay/reviews/B9M4K2-IZUQYU.md` (2026-11-24T09:07:10Z)
