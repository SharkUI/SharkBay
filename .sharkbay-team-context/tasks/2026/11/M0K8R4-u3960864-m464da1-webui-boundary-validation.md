---
kind: sharkbay_task
taskId: M0K8R4-u3960864-m464da1
taskTag: M0K8R4
mode: task
title: M0 契约盘点与独立运行时边界验证
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-13T09:12:07Z
updatedAt: 2026-11-13T11:59:37Z
completedAt: 2026-11-13T11:59:37Z
---

## Summary
已完成 M0 本机技术可行性验证与契约清单：隔离 Node SQLite/PTY、真实 Claude 交互界面恢复通过，最终域名 ai.shark.zj.cn 的 DNS/TLS/正常 Chrome 访问通过。用户明确先在本机完成开发，再部署到 103；目标机运行环境准备后置部署验收，不在本轮继续远端安装。尚未交付 WebUI，未提交。

## Files
- .sharkbay/tasks/M0K8R4-u3960864-m464da1-webui-boundary-validation.md
- docs/webui-runtime-api-inventory.md
- scripts/verify-webui-node.mjs
- scripts/verify-webui-terminal-restore.mjs
- scripts/verify-webui-tls.mjs
- scripts/inspect-webui-api.mjs
- docs/webui-runtime-plan.md
- .sharkbay/validation/webui-tls-iyg0owmo/（本机临时测试材料，现已删除；未提交）

## Work
- 承接 W6R8K2-u3960864-m464da1、R8M4K7-u3960864-m464da1、B7N4P2-u3960864-m464da1；已有桌面基线为 typecheck、435 项测试、build 通过。
- 已搜索只读团队上下文，使用 CodeGraph 定位 SharkBayBridge 与 ipcChannels；继续盘点 preload/IPC/Core 的实际调用面。
- 保留暂存的 docs/development.md 与 docs/webui-runtime-plan.md；本任务不提交、不改桌面依赖 ABI，不接入产品网络入口。
- 计划将 Node 原生模块安装在隔离临时目录；SSH 只读检查用户指定第二设备 10.0.0.103，证书信任与真实浏览器验收单独记录。
- SSH 已连通：第二设备为 macOS 26.3.1(a) arm64，安装 Chrome/Safari，系统 curl 8.7.1；非交互 PATH 无 Node。首次探测因 Linux os-release 不存在返回 1，后续 macOS 定点检查返回 0。
- 主机到第二设备的连接源地址为 192.168.2.113，目标为 10.0.0.103；不能因 SSH 可达就假定同网段或反向 HTTPS 可达，继续验证实际路由。
- 已在系统临时目录隔离安装 @lydell/node-pty 1.2.0-beta.12、better-sqlite3 11.10.0、@xterm/headless 6.0.0、@xterm/addon-serialize 0.14.0；未改仓库 node_modules 或锁文件。
- 查阅 xterm 官方说明和已安装包类型，拟验证 headless+serialize 恢复；保留真实 TUI 与合成 ANSI 用例的区别。方法清单按仓库文档保存，应用 pages:write-page 的内容核对要求。
- 使用 TypeScript AST 枚举 100 个 preload 方法/事件、9 个额外桌面接收器、2 个其他视图发布事件和 27 个内部 Core 方法；生成迁移清单并标记当前 dock.updateBadge 无接收器。分类不等于网络白名单。
- 新增可复现的隔离 Node、终端快照与第二设备 HTTPS 探测脚本；探测不启动产品网络入口、不读取业务数据，不保存真实 TUI 输出。
- 第二设备 HTTPS 验证通过：未信任证书拒绝（curl 60），通过 stdin 提供匹配证书后成功（curl 0），响应标记正确。只对这次请求提供信任，没有改系统/浏览器信任，服务与临时私钥已清理。
- 已询问浏览器证书来源/信任方式，等待用户选择；期间继续文档和可独立执行的验证。
- 已将计划状态更新为 M0 验证中，并补充实际结果、剩余验收及隔离安装/运行命令；尚未修改业务实现或添加产品网络入口。
- 清单脚本增加 preload 与 SharkBayBridge 成员集合一致性检查；不把成员名一致误写成参数/结果类型已统一。
- 加强屏幕检查，覆盖隐藏普通缓冲区、200 行有界 scrollback 和真实 CLI 识别；实际 Claude 界面识别为 onboarding-or-trust，未进行模型请求或运行中 TUI 恢复验收。
- 用户要求继续：先识别真实 CLI 当前界面并补尺寸变化与增量恢复检查，同时准备浏览器证书验收材料；证书来源尚未选择，不改设备信任，不把“继续”视为安装信任根的授权。
- 只读识别确认临时空目录触发目录信任提示；当前项目已有信任，可在 --safe-mode --strict-mcp-config --tools "" 下进入 Claude 2.1.283 实际交互界面。未选择模型、未提交 prompt，未接受新的目录信任。
- 真实 TUI 探测增加可显式指定的已信任项目 cwd、输出解析/快照共用队列、草稿、resize、重附着和后续增量对比；不会为恢复屏幕自动注入按键，只有用于验证的未提交草稿输入。
- 快照序号在输出解析完成后递增，避免将已接收但尚未解析的后续块算进快照边界；错误清理仍释放测试终端和临时目录。
- 准备匹配 192.168.2.113 的一天有效服务端证书（CA:FALSE、serverAuth）；私钥在本机忽略目录且权限 0600，不进入 Git，不传到第二设备。
- TLS 脚本新增 --serve <certificate-directory>，校验 IP/有效期、打印 URL/指纹，仅提供固定标记，SIGINT/SIGTERM 停止时保留提供的证书。
- 第二设备 Chrome headless 使用隔离临时配置和正常证书检查，未见测试标记并明确报告 ERR_CERT_AUTHORITY_INVALID；测试浏览器进程和临时配置已清理。
- 已就具体的一天有效、非 CA 服务端证书提出用户级 SSL 信任授权；若允许，计划限定主机名与 SSL 用途，验证 Chrome 后移除信任并复查拒绝；尚未修改信任。
- 用户已明确允许在 10.0.0.103 临时信任测试 HTTPS 证书，验证后立即移除。开始准备限定 SSL/主机地址的用户级信任、正常 Chrome 验证及 finally 清理，不涉及 SSH 公钥变更。
- SSH add-trusted-cert 被 macOS 拒绝：no user interaction was possible。finally 已删除导入证书并用正常 Chrome 确认仍拒绝，不是缺少用户授权。
- 已在 103 创建公开证书与仅设置 SSL/192.168.2.113 用户级信任的 GUI Terminal .command 入口并打开，等待用户完成系统认证；未索取或读取系统密码。
- 用户报告没有看到弹窗；确认 SSH 与桌面属于同一用户，指定 .command 与 security/SecurityAgent 已在运行，ioreg 报告 CGSSessionScreenIsLocked=Yes。已将 Terminal 前置，等待用户解锁目标设备并认证；没有尝试绕过锁屏或获取密码。
- 用户报告 VNC 无法连接；只读确认 screensharing 已 enabled/running，本机可达 5900 且有 RFB 握手，3283 也可达，未修改远程桌面服务或权限。
- 用户正在配置 103 的 HTTPS 与域名 ai.shark.zj.cn；改为等待复用该入口，取消当前临时证书认证与探测，开始清理本任务的待认证进程/证书。域名最终指向运行时还是代理尚需确认，不假定配置已完成或已验收。
- 用户已明确选择“103 运行 SharkBay”；修正此前把 103 当成第二客户端的理解。开发仓库仍在当前本机，后续实际域名/原生模块验收针对 103，不把旧拓扑探测当作部署完成。
- 已终止本任务的待认证 security/.command 进程，按唯一 SHA-256 指纹移除测试证书；导出用户信任设置确认对应 SHA-1 记录不存在。没有修改用户正在配置的域名或其他证书。
- 正常 Chrome 再次拒绝测试证书后，删除第二设备临时公开证书/认证目录，关闭本机测试监听并销毁临时私钥；更新实施计划，改为等待用户的正式 HTTPS 入口。
- 用户确认域名/HTTPS 已配置完成；最终范围为 103 独立运行一个 SharkBay 实例，经 ai.shark.zj.cn 服务同一使用者的内网设备。sharkbay.xyz 托管服务仅在内网验证成功后另行评估，本阶段不做。
- 开始按最终拓扑检查域名、证书、浏览器连接及 103 的 Node 环境；不将此前反向临时探测作为最终入口验收。
- 最终拓扑的本机 Chrome 隔离配置访问 ai.shark.zj.cn 正常返回页面，无证书错误；HTTPS 当前响应标识 llama.cpp、HTTP 415，尚未接入 SharkBay，未修改现有入口。
- 103 存在 /opt/homebrew/bin/node v25.8.2 与 npm 11.12.1，SSH 默认 PATH 不含 Homebrew；/opt/homebrew/bin/gh 不存在。继续用独立临时目录验证实际 Node 原生模块，保留当前服务及全局依赖不变。
- 103 隔离 npm 安装因 registry.npmjs.org DNS ENOTFOUND 失败，临时目录已清理；这不是原生模块 ABI 不兼容的证据。
- 用户明确要求全部开发、构建、测试先在本机进行，完成后再部署 103；结束本轮远端准备，不传离线运行包、不安装全局依赖。103 的 Node/npm/PATH、registry DNS、gh 与最终路由留作部署前置检查。
- M0 本机 Node/TUI 和跨设备正式 HTTPS 可行性证据已具备；按用户明确的开发/部署顺序完成本任务，下一任务在本机提取 Core 创建与分发边界，不宣称 103 上已有 SharkBay 实例。

## Verification
- 开始时 Git 状态仅为前一任务的两份暂存文档。
- 隔离安装退出 0；node scripts/verify-webui-node.mjs <probe-dir> 退出 0，Node v24.14.1 ABI 137 下 SQLite、PTY 输出、resize 与清理通过。
- node scripts/verify-webui-terminal-restore.mjs <probe-dir> <claude-path> --safe-mode --strict-mcp-config 退出 0，普通 Unicode/颜色、备用屏幕、返回普通屏幕、真实 Claude 启动屏幕恢复通过，未提交 prompt，CLI 清理通过；不是运行中多客户端重连验证。
- ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron 的内存 SQLite 查询退出 0，DESKTOP_SQLITE_OK abi=121；桌面 ABI 未被 Node 探测覆盖。
- node scripts/verify-webui-tls.mjs 192.168.2.113 10.0.0.103 退出 0，第二设备实际反向路由和显式证书校验通过；浏览器正常信任仍待验收。
- 加强后的终端恢复脚本退出 0：normal-unicode-color、alternate-buffer、return-normal、bounded-scrollback、real-tui-startup 和真实 CLI 清理通过；真实 CLI 标记 stage=onboarding-or-trust。
- 四个新增 .mjs 文件 node --check 通过；生成的清单与脚本输出一致，100 个 preload/renderer bridge 成员名一致。
- 文档本地链接检查通过（计划 16 个），新增脚本和文档末尾换行/尾随空白检查通过。
- 根依赖和业务代码未改，不重复运行前一任务已通过的完整桌面测试；新增脚本由上述实际探测验证，不宣称桌面 GUI、产品 WSS、重连或 LAN MVP 已验收。
- SHARKBAY_TUI_PROBE_CWD="$PWD" node scripts/verify-webui-terminal-restore.mjs <probe-dir> <claude-path> --safe-mode --strict-mcp-config --tools "" 退出 0：实际交互界面、未提交草稿、120x36→80x30、重新附着、恢复后继续输入/增量、进程清理通过；未发起模型请求。
- 修正快照序号和错误清理后再次运行同一实际交互探测，退出 0，stage=interactive，未提交 prompt。
- --serve 模式对本次服务端证书正常启动；第二设备 curl 显式信任返回 SHARKBAY_M0_TLS_OK。
- 第二设备 Chrome 实际浏览器检查退出 0，probeMarker=false、certificateRejected=true；没有使用跳过证书校验参数。
- --serve 错配 127.0.0.1 时在监听前拒绝；私钥权限 0600 且证书/私钥均被 Git 忽略。
- 通过 SIGTERM 停止首次服务模式进程，退出 0；socket 复查原端口连接拒绝。默认临时证书模式重新验证也退出 0，显式信任成功、未信任拒绝。
- 非交互信任尝试退出 1（macOS 拒绝交互），remove-trusted-cert 提示无已设信任，delete-certificate 退出 0，证书不存在，新的 Chrome 配置确认拒绝。
- open 第二设备认证入口退出 0，result 文件尚不存在，仍需本机系统交互。当前测试 HTTPS 服务为 192.168.2.113:50987（仅固定标记），待认证后验证并关闭。
- 取消认证并清理退出 0：certificatePresent=false、trustRecordPresent=false；正常 Chrome browserExit=0、probeMarker=false、certificateRejected=true。测试认证目录已删除。
- 本机服务经 Ctrl-C 正常退出 0；socket 确认 50987 已关闭，本机测试证书目录/私钥已删除。用户已有正式 HTTPS 配置未触碰。
- 本机 DNS 解析 ai.shark.zj.cn 为 10.0.0.103；正常 curl（无证书绕过、无代理）连接 HTTPS，ssl_verify_result=0，HTTP 415；TLS 成功不代表已部署 SharkBay。
- Chrome 访问正式域名退出 0，certificateError=false、pageReturned=true；无需任何临时信任或证书绕过。
- 103 Node/npm 版本查询退出 0；系统 Git 可用，默认 PATH 与 Homebrew 标准位置均未发现 gh，后续运行环境需补齐 GitHub CLI。
- 103 隔离安装退出 1，ENOTFOUND registry.npmjs.org；finally 已删除该次临时探测目录。目标 Node 25 原生模块尚未验证，按用户要求后置部署阶段，不伪记为通过。

## Notes
- 团队上下文只读；M0—M4 全部完成才算 LAN MVP，任何未执行项不得视为通过。
- 不能将历史 Electron BrowserView 忽略证书错误的方案用于 WebUI TLS 信任。
- xterm 官方参考：https://github.com/xtermjs/xterm.js/#nodejs-support；serialize 仍是实验性 addon。本阶段只证明所列场景，M3/M4 仍需真实浏览器与运行中 TUI 验收。
- 临时探测依赖目录 /var/folders/l_/c04rjnw94mbdjwyt_br3fbd40000gn/T/sharkbay-webui-m0-9qgiyqwk 可复用，也可按计划中的命令重建；不属于正式构建依赖方案。
- 当前第二设备待认证目录：/var/folders/30/zk1yjrz55ln8j82gmzvpfg240000gn/T/sharkbay-tls-authorize-rditbhqv；仅公开证书、.command 与结果状态。后续无论成功失败均需清理该目录、测试证书与用户信任，并验证正常浏览器再次拒绝。
- 上述待认证目录及本机临时证书材料均已清理；后续使用 ai.shark.zj.cn，不继续该次临时信任流程。该域名尚由用户配置中，未验证 DNS、证书链或最终应用入口。
