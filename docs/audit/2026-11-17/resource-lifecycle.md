# 资源 性能与生命周期审查

基线：`2fc9c935892d04748c01579f819da701eb163150`，审读目录 `/tmp/sharkbay-audit-2fc9c93`。此审查未修改产品源码，未启动完整 runtime、桌面或真实 CodeGraph，未接触 103 和真实用户数据。

## 确认发现

### RL1 P1 两个并发安装可永久占满调度器并阻塞正常停止

证据：静态确认生产调用链，纯调度器隔离复现同型等待。

- `src/core/core-service.ts:181-207`：`installTool` 在持有 target 槽位的任务内部，成功后等待 `readMachineProfile(refresh:true)`。
- `src/profiles/profile-orchestrator.ts:35-51`：刷新依次把 detectors 排入相同 scheduler、相同 target，再等待全部完成。
- `src/core/job-scheduler.ts:88-102`：默认每 target 两个并发槽；超时只发 abort，不结束任务，调用方也不接收或传播 signal。
- `src/runtime/application-runtime.ts:262`：停止时先等待所有 pending 命令，之后才清理其他资源。

触发：两个同 target 的安装同时占住两槽，均在验证成功后等待 profile 子任务。两个父任务等待子任务、子任务等待父任务释放槽。此时 profile/其他安装同 target 也无法前进，120 秒 abort 不能解除等待；若这些请求仍在 pending，正常 dispose 同样无法完成。没有安装请求 dedupe 或后端串行保护，配置写入串行不涵盖安装。

隔离证据：两父任务各在任务内排一个子任务，父 timeout=10ms；40ms 后 `nestedStarted=0, parentsFinished=0`。用例没有执行任何安装。生产路径死锁为静态确认，未运行完整应用或真实工具安装。

修复：把 profile 刷新移出安装占槽区，或为嵌套工作设计不会相互等待的调度边界；停止时提供有界排空与真实取消。验证两个并发成功安装（fake provider）及 pending 状态下停止，全部 Promise 和槽位回收。

### RL2 P2 调度器 timeout 不形成可靠的截止契约

证据：隔离复现。

位置：`src/core/job-scheduler.ts:100-121`，调用方 `src/profiles/profile-orchestrator.ts:43-48,83-88`、`src/core/core-service.ts:186-207`。

timeout 仅 `controller.abort()`。实际安装和 detector 闭包不使用 signal；未完成任务永远占槽，晚到成功仍记录 completed。隔离用例将 timeout 设为 5ms、任务等待 25ms，最终状态为 completed；没有 timeout 事件。诊断记录因此也不能准确衡量超时。

此项是 RL1 的共同放大因素，应合并设计修复而非当作两个互不相关的调度改造。单纯 Promise.race 后释放槽并不足够：若底层工作继续，会突破真实并发上限。

修复与验证：明确任务 deadline、abort、实际工作停止和槽位释放的契约；向 provider/child tree 传播取消；覆盖忽略取消、迟到 resolve、拒绝、同步抛错与取消失败，禁止将超时后的成功冒充按时完成。

### RL3 P2 用量批写失败会丢掉待重试事件 并可能使后台 timer 抛出未处理异常

证据：批次丢失已隔离复现；timer 的异常传播为静态确认。

位置：`src/main/token-usage-collector.ts:34-51`；`src/main/token-usage-db.ts:195-201` 的事务；实时读取调用 `src/main/agent-clis.ts:259-264`。

`flush()` 在 `insertBatch()` 成功之前将 `batch=[]`，清除 timer。SQLite busy、磁盘或 I/O 错误使事务失败后，内存批次已无重试副本。隔离用 fake DB 首次 insert 抛错，第二次调用 flush，insert 次数仍为 1（应重试达到 2）。后台 5 秒 callback 直接调用 flush、没有 catch，若从该入口遇到写入错误，会把异常抛到进程顶层。逐行处理达到 batchSize 的异常可被 scan catch 记录，但不能恢复已经清空的 batch。

历史回填可能在以后重新找回部分事件，所以不能称为所有场景永久丢失；实时读取已经推进偏移、累计去重状态也可能前移，当次进程内准确性与可恢复性仍不成立。

修复：提交成功后再移除批次；失败保留有界待写队列、诊断与重试策略；timer 入口捕获并报告错误。验证部分事务回滚、一次失败再成功、连续失败和退出 flush，不丢事件也不重复计数。

### RL4 P2 CodeGraph 进程被信号终止被当成正常成功

证据：隔离复现真实 Node 子进程自发 SIGTERM。

位置：`src/core/codegraph-manager.ts:92-95`。

close 回调仅读取 code，`code===null` 也 resolve。Node 子进程因 signal 退出时 code 为 null，因此 OOM killer、外部终止、CLI 自杀等未经过本管理器 onAbort/onTimeout 的退出被错误视为成功。自发 SIGTERM 的测试进程返回 `resolved:true`、空 stdout/stderr。管理器主动超时先 settle reject，此保护有效，误报不适用于该分支。

上层 status JSON 解析有时会将其转为 error，但 init/sync/uninit 命令的失败本身已被吞掉，特别是 uninit 不会进入兜底清理。不能据此判断任何历史事故原因。

修复：仅 code===0 为成功，保留 signal 字段并作为非成功退出。验证 SIGTERM/SIGKILL、普通非零、超时与正常零退出，各自只有一次 settle。

### RL5 P2 禁用索引插件时未取消正在维护的索引 而是并发执行卸载

证据：管理器隔离复现，生产入口静态确认。

位置：`src/runtime/application-runtime.ts:115-119` → `src/core/core-service.ts:309-311` → `src/core/codegraph-manager.ts:187-190,238-256`（removeProjectIndexes/removeProjectIndex）；取消 API 在 manager:155-162，路径未调用。

先启动 ensure 同步，随后 disable CodeGraph，后端直接对所有项目 uninit；既不等待也不 abort 活跃的 init/sync。隔离 fake runner 证据为 `calls=[status,sync,uninit], aborted=false, hasActiveJobs=true`。因此禁用并不终止资源工作，索引写入与删除可能并发，清理完成后仍可能有写进程运行或重建状态。uninit 若有自己的锁保护可能拒绝，但 catch 会直接 fs.rm，因此不能把 CLI 锁当成完整防护。

修复：按项目建立维护与移除的互斥/排空契约，abort 后确认真实进程退出，再卸载；禁用期间拒绝新 ensure。验证 fake 同步阻塞时 disable，不允许 uninit 与 sync 重叠，资源停止后再删除。

### RL6 P2 插件启停没有使已缓存 profile 失效

证据：静态确认。

位置：`src/runtime/application-runtime.ts:115-119`、`src/core/core-service.ts:338-340` 的 plugin 启停；`src/profiles/profile-orchestrator.ts:21-35,57-74` 的 cache 先于 enabled detector 过滤；`src/storage/profile-cache.ts:17-18` 的 TTL。

机器 cacheKey 只有 target/depth，项目 cacheKey 只有 URI/depth，均不含插件启用配置。关闭一个 detector 后，缓存仍保留关闭前的贡献；反向启用也不会及时出现新结果。当前生产可达路径是 agents.listInstallRecipes/installTool 读取 machine profile，用作安装前提和平台判定，最长可继续使用24小时旧结果。agents.listClis 的快捷路径直接按 enabled detector 重新发现，不受该 machine cache 影响。readProjectProfile 目前只找到 core 转发、接口/provider实现和测试，没有应用命令或UI消费者，因此15分钟项目缓存是潜在/未接通路径，不能宣称其造成当前项目UI不更新。已有显式 refresh 可以绕过，但插件启停本身不执行刷新或失效。

修复：缓存纳入 enabled-plugin revision 或启停后失效关联缓存；防止旧在途任务在失效后回写旧结果。验证缓存热、冷、启停、同时读取和跨 depth，禁用 detector 的数据不再残留。

### RL7 P2 机器探测交换了架构和内核版本

证据：假上下文隔离复现。

位置：`src/plugins/bundled/core-detectors.ts:68-82`。

`uname -srm` 的结果形如 `Darwin 26.1.0 arm64`，代码却将 parts[2] 写入 version/kernel，parts[1] 写入 arch。fake context 输出得到 `version=arm64, arch=26.1.0, kernel=arm64`。覆盖了 LocalProvider 原本正确的 os.arch/os.release。该缺陷不依赖故障或大仓库，会影响机器元数据及基于架构的展示/后续决策；当前 install platform 判断只用 platform，未宣称能直接导致错误架构安装。

修复：按明确字段分别探测或正确映射，加入 Darwin/Linux/异常输出契约测试。现有正常 detector 测试应核对真实命令输出顺序。

## 资源所有权与边界

| 资源 | 所有者和释放 | 当前边界与结论 |
| --- | --- | --- |
| scheduler 工作和槽位 | JobScheduler，任务 finally 释放 | 每 target 默认 2；无队列容量、无 dispose/cancel-all；RL1/RL2 |
| CodeGraph init/sync | CodeGraphManager，controller map | 按 ensure key 去重，120s 超时、进程组 TERM+2s KILL，stdout/stderr 各约 1MiB；退出与移除 RL4/RL5 |
| CodeGraph status/uninit | 独立进程，20s/60s timeout | read-only probe 不在维护取消 map；remove 的 Promise.all 随项目数扩张 |
| JSONL partial | 每 reader 的 Buffer parts | 64KiB 读取、4MiB 单行上限、finally 关闭句柄；单 reader 有界 |
| transcript watcher | AgentSessionWatcher，stop abort并等待 activeScan | 顺序读取、发现结果缓存；Claude 发现按项目 Promise.all，files map 无淘汰，跨会话累积待优化 |
| usage batch | TokenUsageCollector | 50条/5秒 flush；RL3；Codex累计去重 map 按 sourceFile 永久保留 |
| usage SQLite | ApplicationRuntime，dispose close | 单 owner/WAL/busy_timeout=3s、批事务、source+offset去重；库和索引无保留期策略 |
| profile cache | ProfileCache，磁盘 TTL | machine24h/project15min；无插件 revision、无持久缓存淘汰，RL6 |
| PTY/session/title timer | TerminalManager，close或onExit | inspect guard防重入；退出清timer；close先标exited再kill，exit仍发出；正常退出记录保留至客户端close |
| runtime/profile锁 | acquireProfileLock/release | 双锁、token、wx、ESRCH-only回收、恢复guard防竞争；保护措施存在；中断guard保守拒绝、需手工诊断 |
| runtime进程 | ensureRuntime detached child | 等待15s、runtime.log追加；失败重试与多个桌面竞争需要完整生命周期验收，当前不运行 |
| diagnostics | DiagnosticsCollector | recent jobs最多50；detector聚合按key累计，当前固定bundled范围较小 |

## 已检查的覆盖范围

全文或关键调用链审读：`src/core/` 全部模块；`src/profiles/profile-orchestrator.ts`、`src/storage/profile-cache.ts`；`src/providers/local/local-provider.ts`；plugin host、manifest、installed-plugins、bundled core/node/python/go/rust/java/codegraph/tool-probe；runtime application生命周期与profile-lock；`electron/runtime-client.ts`；`src/main/terminal.ts`、pty、agent-clis、jsonl-reader、token-usage-collector、token-usage-db、command-path。

agent detector/bundled-plugins 注册入口进行了引用与结构检查，Agent 协议状态的细节由状态专项覆盖。runtime terminal-state、agent-runtime、task-runtime、Telegram、HTTP安全与Electron桌面其余业务由其他专项覆盖，本报告不宣称独立完成这些模块逐行验证。

确认有效的保护：JSONL流式和超长行跳过；Kiro16MiB前置限制；watcher顺序读取与取消；CodeGraph进程组终止；运行锁对活PID、权限失败、无效锁和PID复用保持保守；profile TTL及fingerprint；缓存读取损坏后降级miss；已安装插件仅注册声明，不加载磁盘代码。没有把这些保护当成新问题。

## 性能基线与改进机会

独立 Node 进程，合成256字节/行、1MiB与8MiB文件，source transpile后直接调用 JsonlReader。首次观测为1MiB/4096行约8ms、峰值RSS57.8MB；8MiB/32768行约36ms、峰值RSS68.3MB。完整偏移均等于文件字节数，partial为0；20轮创建、读取、关闭各16行成功。复测原始数值在 evidence/resource/results.txt；JIT、GC、文件缓存使耗时与RSS有噪声，不能用该微测量代表整应用启动性能或证明无泄漏。

后续改进：为scheduler建立等待时长、真实工作时长与deadline诊断；全局限制发现、索引移除与探测命令并发（detector一个槽内部仍可发十余并发probe）；对watcher文件状态、usage去重和缓存设计可验证的保留/淘汰策略；把shell命令的超时与进程树终止统一，当前LocalProvider `execFile(/bin/sh -lc)`只管理直接子进程，后代清理尚未动态验证。

## 验证证据和限制

证据脚本和日志位于 `evidence/resource/`。编译器脚本 `repro.cjs` 只对固定snapshot选定TS进行transpile，不执行应用入口；运行用例文件为cases、extra、reader、remove-active。此次输出目录 `/tmp/sharkbay-audit-resource-repro`，脚本中的 __dirname 编译输出应在临时目录使用，不能直接在仓库 evidence 目录执行编译。复现时复制脚本到新的临时目录，按审计基线调整源码路径，先运行repro.cjs，再运行各mjs。只加载调度、collector、reader、CodeGraph函数与bundled纯探测模块；DB为fake，不读取home，测试SIGTERM仅发送给本轮创建的子进程自身。单次进程峰值约70MB，最多一个测试子进程、合成数据最多8MiB、每个用例预算5秒。

未运行完整ApplicationRuntime、PTY/安装器真实生命周期、实际CLI索引、多客户端和长时压力；这些限制阻止宣称整应用动态验收通过，但不削弱本报告列明的静态调用链与模块级反例。没有把任何一项关联为本机或103事故根因。


## 第二轮交叉核实与反证

### QB01 Electron 支持缺口复核

独立读取目标 package.json 与锁文件，并核对 [Electron支持政策](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) 和 [官方日程](https://releases.electronjs.org/schedule)。政策为最新三个稳定主版本；日程将Electron29的EOL列为2024-08-19，2026-11-17对应已发布的支持序列为43/44/45。因此QB-01的“29已失去官方支持”结论成立。这里只确认支持缺口，不将过期版本自动等同于已经可利用的特定CVE；真实安装包具体版本仍需产物指纹证明，不能只以开发依赖声明推断所有历史包。

### QB07 桌面构建残留复核

目标 package.json:14 的build执行runtime build、desktop tsc、Vite；scripts/build-runtime.mjs:6仅移除dist-runtime；tsconfig.node.json:19的outDir是dist-electron；Builder package.json:91起按dist-electron glob打包，排除测试、map、声明等不排除已删除生产模块的JS。配置证据支持QB-07。独立临时TypeScript工程进行了两次编译，中间删除obsolete.ts，第二次成功后obsolete.js仍存在。它验证的是发射与清理机制，不代表已检查的真实安装包含有某个具体残留。主审另有可移植复现脚本，此处不重复增加问题编号或打包产品。

### RL8 P2 fish 的 PATH 按行输出却只保留最后一行

证据：假fish可执行文件隔离复现。`src/main/command-path.ts:44-46,64-71` 对fish执行 `string split : $PATH`，其多行输出随后被通用 `.split(/\r?\n/u).pop()` 丢弃到仅最后一行。`resolveCommandPath:78-90` 依赖该搜索路径，影响Agent发现、工具探测和终端PATH准备；只在被遗漏目录中的CLI会被误报未安装。硬编码fallback、fnm/nvm发现可偶然补回某些路径，因此不宣称所有fish机器都无法找到任何工具。

使用本轮创建的、名为fish的假shell，输出 `/fixture/custom-tools` 与 `/fixture/final-bin` 两行；独立Node设置SHELL为该假shell、homeDirectory参数为临时目录且fallback=[]，实际结果只有 `["/fixture/final-bin"]`。没有执行用户shell或扫描真实CLI。

修复：fish与POSIX输出采用明确可兼容的编码和解析（或fish输出单行冒号分隔），处理启动噪声并保留所有有效目录。验证自定义目录、空目录、重复项、fish/POSIX及启动输出，不只测常见Homebrew路径。

### 正常主路径成本与可达性

- 当前UI `App.tsx:779` 的refreshProjects调用projects.scan；LocalProvider转发到scanner，`scanner.ts:75-111` 对全部configuredProjects以Promise.all进行realpath/stat和图标、dev services、Git元数据探测。并发随项目数增长，没有统一scheduler上限；每次刷新重做这些探测。属于有证据的日常性能改善机会，尚无真实CLI性能实测，不升级为已确认卡顿缺陷。
- profile module的机器冷读会启动全部启用的machine detectors，一个detector槽内部仍有多个并发探测；slot数不等于实际子进程数。仅agent清单的内置快捷路径使用includeVersions=false，避免版本命令，这个已有优化有效。
- readProjectProfile没有生产入口；不能把其fingerprint的manifest stats与各detector扫描，计入当前普通项目切换成本。该路径应与已安装插件声明机制一起作为历史机制用途核实，而不是为了清理而直接启用或删除。
- command-path只缓存shell PATH请求/结果；fnm/nvm目录发现仍在每次resolveCommandSearchPaths进行。多个工具检测共享shell请求但未共享整个搜索结果，存在重复目录读取机会；应先测量再决定缓存粒度和失效规则。

### 资源上限声明复核

- CodeGraph stdout/stderr并非严格各1MiB字节上限：判断是字符串.length，且判断后追加整个chunk，允许单chunk越界；UTF-8字节、JS字符串内存和字符数不同。此前表格“约1MiB”仅为实现中的阈值量级，不是RSS保证。应使用字节计数和截断，明确诊断截断标记。
- JSONL的4MiB限制只约束保留行的payload字节；Buffer.concat、UTF-8字符串、JSON.parse对象和消费者队列都可能额外占内存；64KiB是读取块，不是整个reader或进程内存上限。多reader/多会话的总量还需独立预算。
- Kiro读取先对打开句柄stat并固定分配不超过16MiB的buffer，后续按该size读取；文件增长不扩大本轮buffer。解码和JSON.parse仍增加内存，因此16MiB也不等于峰值RSS。
- LocalProvider命令maxBuffer=1MiB是execFile输出阈值；8秒默认/具体调用timeout作用于直接shell，不能证明后代已经全部退出。command-path的shell PATH探测timeout=5秒，不等于整个PATH发现固定5秒截止。
- 普通项目文本文件的5MiB是stat前置检查；随后的readFile未指定读取上限，文件在检查后快速增长的竞态不受同等严格上限保证。此点作为边界强化机会，未进行竞态压力实验。
- watcher、usage累计source map、profile缓存磁盘文件和scheduler队列均没有全局容量/淘汰边界；相应报告没有宣称已经有上限。

### 补充已读文件与排除项

第二轮完整审读 `src/profiles/profile-orchestrator.ts`、`src/storage/profile-cache.ts`、`src/providers/local/local-provider.ts`、`src/plugins/plugin-host.ts`、`src/plugins/plugin-manifest.ts`、`src/plugins/installed-plugins.ts`、`src/plugins/bundled-plugins.ts`，以及bundled目录的agent-detector、codegraph-detector、core-detectors、node-detector、python-detector、go-detector、rust-detector、java-detector、tool-probe共9个文件；这覆盖profiles/providers/plugins/storage当前目录下的所有源文件。补充核对command-path、scanner、file-content、application-api、application-input、Electron IPC/preload和相关renderer调用点；后者为入口追踪，不冒充全文件独立深审。

已排除：磁盘installed插件当前不会执行第三方代码（注册路径未接通且包装register为空）；探测器命令名称来自bundled常量、参数由shellQuote转义，不能仅因使用shell就认定已存在用户输入注入；project readTextFile maxBytes在读取后检查虽增加额外读取，但底层仍有5MiB前置检查，不能称为任意大小无界读取；cache文件损坏会miss，不属于不能启动的强依赖。detector的正则/字符串依赖识别是启发式信息，不应将所有误识别都提升为执行安全缺陷。


## 测试全文补审

按安全专项分配，以下20份测试已逐行读完（不是仅扫描导入或测试名），本轮没有运行它们。每份均核对setup、断言、依赖和清理；结论供tests-quality.md统一合并，避免重复编号。

| tests下的文件 | 全文审查结论 |
| --- | --- |
| app-update-lifecycle.test.ts | Electron/updater/runtime均mock，假时钟与process spy有恢复；重入、截止和sender断言有效，不证明真实签名安装行为 |
| app-updates.test.ts | 纯mock client，异步下载失败与手动状态断言有效；周期测试显式stop，不把fake updater的Invalid signature事件当真实签名验收 |
| application-menu.test.ts | 纯模板与回调测试，检查菜单项及accelerator，未见新增隔离缺陷；实际系统菜单交互不在范围 |
| browser-tabs.test.ts | Electron BrowserView完全mock，URL、bounds、新窗口和证书归属有反向断言；不模拟真实导航/页面权限，不能覆盖远程网页攻击路径 |
| caffeinate-mode.test.ts | 纯函数矩阵覆盖off/on/auto及默认值，未见新增问题 |
| caffeinate.test.ts | spawn被mock，覆盖旧进程迟到exit与重试，进程/平台mock恢复；未见新增问题 |
| codegraph-manager.test.ts | 有真实sleep子进程测试，但断言只证明Promise及时reject，没有验证后代退出；fake init路径仍会真实写固定tmp .git，见下文 |
| dev-services.test.ts | 临时manifest/脚本内容fixture，不执行dev服务；发现命令断言具体，全部临时根无统一teardown |
| github.test.ts | gh和命令发现完全mock，覆盖部分查询失败、总数与条目、鉴权失败、引号；不发真实网络，未见新增隔离缺陷 |
| harness.test.ts | 全731行已读，包含真实临时Git、shell helper和假ps/lsof；保留用户指令与exclude等有效断言；存在弱regex断言及临时根不清理 |
| ipc-channels.test.ts | 完整对象相等仅验证通道字符串表，不验证preload/handler权限和schema；有价值的契约回归，不能当安全验收 |
| node-detector.test.ts | 使用临时repo与真实LocalProvider检测项目数据，断言framework/命令/service有效；没有临时目录清理，也未覆盖无效manifest与多语言冲突 |
| project-files.test.ts | 临时目录与symlink，正反路径、懒加载和editable断言有效；无teardown，未证明读取内容的越界防护（文件边界由其他测试覆盖） |
| project-icons.test.ts | workspace glob与data URL断言有效，无网络；无临时目录清理，缺少symlink/大图等边界反例 |
| review-control-server.test.ts | 真实临时socket和部署CLI，finally stop但临时目录不删除；参数传递有效，不代表真实parent身份授权已验收 |
| review-runs.test.ts | fake terminal/provider，真实临时保留文件；错误token、symlink、失败通知重试和启动清理断言有效；dispose只在成功路径，失败时可能遗留retry timer，临时根无清理 |
| scanner.test.ts | 真实临时Git与配置，覆盖manual-only和深目录、dirty/icons；无统一teardown，旧root递归scanner的测试不代表当前app主路径性能 |
| teamwork-sync.test.ts | 真实本地bare remote，不写GitHub；新旧记录及重叠请求断言有效；环境身份finally恢复，但未清除所有继承Git环境且目录无teardown |
| token-usage-collector.test.ts | os.homedir spy将会话指向临时根、finally恢复清理；partial tail/取消/Kiro稀疏大文件有有效断言；fake DB无写入失败用例，漏掉RL3 |
| web-runtime-integration.test.ts | 全314行已读；会真正启动完整ApplicationRuntime、HTTP/WS/PTY，有全局globals恢复和正常afterAll；属于当前禁执行集合，临时config不隔离真实会话发现 |

具体缺口：

1. `tests/codegraph-manager.test.ts:38-78` 在fake runner init返回后，生产代码仍调用ensureGitExcludeEntry，实际写固定 `/tmp/sharkbay-codegraph-project/.git/info/exclude`；该用例不清除该路径。另fake init跟踪用例也有同型副作用。目录不是mkdtemp归属，测试不能按“全部runner已mock”认定零写入。改为独立临时根并在finally清理，或显式注入Git exclude操作。
2. `tests/codegraph-manager.test.ts:188-203` 的abort/timeout只检查reject和elapsed<5s；没有记录PID/进程组并确认后代已退出，漏掉“调用及时返回但后台仍在跑”的关键反例。使用假runner的cancel用例还用固定10ms等待init开始（`:112,144,170`），应以显式到达屏障代替时间猜测。
3. `tests/harness.test.ts:613-614,626-628,632-634` 使用可选捕获的相等断言，regex不匹配时会成为undefined===undefined而通过。旁边对固定命令片段的toContain无法证明环境变量和session参数存在且同值；需先断言match非null，再断言捕获值。不是这些测试全部空断言，其余文件/内容检查仍有实际约束。
4. `tests/web-runtime-integration.test.ts:59` 的runtime.start会启用真实watcher；只传临时data/config并未替换默认Agent会话目录，5秒backfill也读取真实用户历史。真实PTY默认shell还可能执行用户启动脚本。`:63-67` afterAll顺序await清理，一项清理失败会阻止后续runtime.dispose与rm；最后一个用例主动dispose，不使前面setup或失败路径自动安全。应将完整集成单列opt-in且隔离会话/shell，并使用独立清理步骤或allSettled保护全部释放。
5. 多个文件的临时目录缺少释放或仅成功后rm，与QB05属于同一测试fixture所有权问题，统一修复而非逐文件重复计数。review manager的dispose同样应放finally/afterEach；不能用当前用例通过证明失败时无泄漏。

这些补读不新增动态通过数量；完整应用测试仍未执行。
