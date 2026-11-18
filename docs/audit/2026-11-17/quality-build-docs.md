# 测试 代码 依赖 构建与文档审计

对象：`2fc9c935892d04748c01579f819da701eb163150` 的 `/tmp/sharkbay-audit-2fc9c93` 快照。未修改产品源码，未运行完整应用、安装、更新或发布。以下位置均指目标提交，不指后续工作区。

## 方法和已经完成的验证

- 清点目标提交 279 个版本控制文件；自有 TypeScript/TSX/MTS 生产模块 130 个，测试文件 82 个。清单见 `baseline.json`、`file-inventory.json`。
- 对 7 个生产入口构建 TypeScript AST 相对导入图，包括 main、server、renderer、各 preload 和 hook CLI；图包含 type-only 引用，因此可达不能证明实际执行，不可达也需检查资源和外部入口。结果见 `source-graph.json`。
- renderer、node、runtime 三份 TypeScript 配置分别 noEmit 检查均通过。使用现有锁文件对应的本地依赖，通过只读依赖链接解析，不安装依赖；结果见 `typecheck-results.json` 和对应日志。
- 审查后串行运行 13 个模块测试文件，104 个测试通过，2.20 秒；无真实应用启动。命令、文件列表和输出见 `selected-tests.json`、`selected-tests.log`。覆盖构建规则、资源复制、mock 更新器、界面纯逻辑、JSONL、通知合并等，不代表所有测试或完整系统通过。
- README 与 docs 下 Markdown 的相对文件链接扫描未发现失效目标；未验证外链可用性和 Markdown 锚点。文档语义仍存在以下漂移。
- 静态检查全部测试文件的导入和副作用标记；该分类只能用于安排深审，不能自动授权执行。未直接运行全量测试。

## QB-01 P1 Electron 发布基线长期脱离上游支持

证据：静态确认。`package.json:67` 声明 Electron `^29.1.0`，锁文件实际为 `29.4.6`。主窗口和项目浏览器均使用其 Chromium；独立 Node runtime 不会更新 Electron 内置 Chromium 和 Node。升级补丁不会跨过此主版本限制。

影响：产品持续分发不受支持的浏览器基础，尤其项目内嵌网页扩大了暴露面。这里确认的是支持与补丁缺口，未声称某个 CVE 已在 SharkBay 中成功利用。

上游只支持最新三个稳定主版本；官方当前日程列出 43、44、45 作为支持序列，29 已远离支持范围。[支持政策](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)、[发布日期程](https://releases.electronjs.org/schedule)。

建议：独立安排受支持主版本迁移，核对 BrowserView、preload、权限、签名与 updater 的变化；建立随包 Electron/Chromium/Node 版本清单和定期维护检查。验收需在隔离桌面环境执行，当前未启动应用。

## QB-02 P3 已安装插件机制没有生产入口

证据：静态确认用途缺口，不直接认定应删除。`src/plugins/installed-plugins.ts:17` 定义扫描，`:44` 定义 manifest 包装；生产源码没有调用者。`plugin-manifest.ts` 仅被该模块与 `tests/plugin-manifest.test.ts` 引用；实际 `bundled-plugins.ts`、`core-service.ts` 使用 bundled 注册。AST 从全部已知生产入口均不可达，全文检查亦未发现字符串或工具入口。

影响：维护了一套具有 installed/untrusted/capability 语义但未接通的结构和测试，易被误认为实际能力；其功能也不能成为当前“任意磁盘插件已能执行”的安全结论。

建议：确认产品是否保留该未实施提案。保留则明确状态与接通条件；不需要则按模块连同专属类型、测试和文档评估清理。不要为了消除孤儿项直接启用外部代码加载。验收应证明仅 bundled 行为保持，或新能力有独立授权与安全验证。

## QB-03 P3 空定价模块失去用途

证据：静态确认。`src/main/token-usage-pricing.ts` 仅包含 `ModelPricing` 类型与空的 `DEFAULT_PRICING`；全部生产入口不可达，源码与测试无消费者。当前 collector 使用 provider 提供的 credits 或 null，未使用该模块估算成本。

建议：作为独立小批清理候选核实历史用途后移除；不要顺手新增价格表或改变现有计费含义。验收为无剩余引用、类型检查通过及现有 usage 行为保持。

## QB-04 P2 新旧产品文档混合而缺少统一事实表

证据：静态确认。`docs/product.md:34` 称文件操作打开终端编辑器，当前 `src/renderer/App.tsx:11` 引入 CodeEditor 并存在内置编辑保存；该产品说明也遗漏了 `src/server/http-server.ts`、`src/renderer/bridge/web-bridge.ts` 提供的共享 runtime/浏览器访问能力。desktop-first 本身仍可作为定位，不单凭浏览器入口将其判错；桌面最小宽度 1180 仍与 `electron/main.ts:172` 一致，因此这一具体值也不列为错误。

`docs/release.md:175-176` 称 Builder 全包含编译测试，但 `package.json:92` 已明确排除 `dist-electron/tests/**/*`，构建测试也验证配置中存在排除项。`docs/index.md:23` 将代码与测试无条件设为权威，与根 AGENTS 中产品约束应独立约束实现的要求存在判断规则冲突。

第二轮独立核对：`docs/execution-target-profiles.md:1396-1406` 的 Implementation tracker 把旧 `electron/core-host.ts` / `core-client.ts` / utilityProcess 方案标为 Done(MVP)，还称已安装 manifest 扫描已接入；目标快照实际采用独立 Node runtime，旧文件不存在，scanner 没有生产调用。这是已实施状态记录错误，不能仅当作未来设计差异。

影响：贡献者、Agent 和发布人员会基于过期假设理解能力、风险和操作方式；更新某一份文档不能解决多处定义的持续漂移。

建议：建立产品术语、功能入口、运行形态、存储与发布事实表；每项只指定一个规范入口，其他文档链接引用。将提案与现状明确标注并归档。验收应逐条核对实现与产品约束，保留文档链接扫描，不以“链接没有坏”代表文档正确。

## QB-05 P2 测试环境依赖和清理职责存在缺口

证据：静态确认。`tests/profile-orchestrator.test.ts:45-54` 调用真实 `LocalProvider` 扫描机器并断言存在 codex；运行结果依赖开发者机器，而非自包含 fixture。该文件多次通过 `makeTestRuntime` / `makeTempRoot` 创建目录，没有对应 teardown；`tests/helpers.ts:7-16` 也不登记清理。许多测试确有 finally/afterEach，因此不将整个测试集一概判为泄漏。

影响：无 Codex 的 CI 或干净机器可能失败，重复运行留下目录；测试还会发现真实机器 CLI，而临时配置不能隔离这种副作用。当前没有运行该机器探测测试。

建议：机器真实探测单列 opt-in 环境验收，确定性测试注入假 provider；fixture 建立明确释放责任，失败也清理。验证需在不预装 Agent CLI 的环境运行对应模块测试，并检查测试目录、进程和监听器结束后的状态。

## QB-06 P2 CodeGraph 手动边界测试只检查特定写法

证据：静态确认验证范围。`tests/codegraph-manual-index.test.ts:12-14` 只查名为 `useEffect` 的调用中是否出现字面 `ensureCodeGraphStatus(`。若 effect 调用间接 helper，或换用其他 hook/运行入口，该检查仍可能通过；按钮正则同样只证明源码出现该文本。

影响：已知资源边界缺少能约束真实调用行为的测试。这里未判定当前版本仍会自动索引；测试薄弱与生产缺陷分别记录。

建议：以假 bridge/索引启动器记录项目打开、切换、文件变化与手动点击的实际调用，覆盖取消与失败；保留有价值的静态限制作为补充。验收用故意引入的间接自动调用验证测试能够失败，再恢复源码。

## QB-07 P2 桌面构建输出未清理 可能将删除的模块继续打包

证据：静态确认构建路径，并通过临时双次 TypeScript 发射复现旧 JS 残留。`package.json:14` 的 build 依次运行 runtime build、`tsc -p tsconfig.node.json` 和 Vite；`scripts/build-runtime.mjs:6` 只删除 dist-runtime，桌面 dist-electron 无对应清理；Builder 按 `dist-electron/**/*` 收集输出。脚本 `evidence/build-residue-repro.py`，主审重放 exit 0，输出见 `build-replay.log`。

触发：在同一工作目录编译过某 TS 模块，之后删除或重命名源文件，再构建。TypeScript 发射新文件不会负责删除旧文件，旧 JS 即可留在桌面包候选集中。未声称目标提交的某个实际安装包已经包含该残留，也未构建或启动安装包。

建议：干净构建 desktop 输出，或在隔离 staging 目录构建并校验产物白名单。加入“两次构建之间删除模块”的小型发射回归，再对完整产物清单确认无孤儿内容。

## QB-08 P2 开发与运行依赖存在未处置的公告版本命中

证据：用户授权后 npm 官方批量查询成功，锁文件637条依赖记录中返回33个包级告警，npm分级为Critical 4、High 23、Moderate 5、Low 1；这些是聚合包级结果，包含间接传播，不是33个已证明的产品漏洞。执行exit 1表示发现告警，不是查询失败。完整清单、版本与依赖链见 [dependencies.md](dependencies.md)、`npm-audit.json` 和 `dependency-triage.json`。

实际范围：Vitest/Tinypool/shell-quote/tar 的Critical来自测试/开发/构建工具，必须分别满足UI/API暴露、额外原型污染来源、特定对象参数或不可信归档进入处理等前提；当前固定命令与静态资源产品不自动满足。js-yaml4.1.1通过electron-updater进入更新元数据解析，输入来源为配置的GitHub发布源，需单独控制并回归。Electron虽标dev却随桌面分发，已由QB-01计数，避免重复。根builder-util-runtime9.5.1的告警不能套用到updater实际使用的已修复嵌套9.7.0。

影响与处置：工具链和更新解析依赖缺少持续公告分诊与更新防线。后续按运行期、构建期、开发期分别升级并验证，不能直接audit fix或把上游Critical转为SharkBay P0。验收包含升级后重新查询、正确版本副本解析、实际产物内容与相关行为回归。当前未安装、升级或执行攻击验证，处理状态待实施。

## 依赖公告核对与误报排除

- 锁定 Vite 5.4.21 落在 [GHSA-rq7h-c2jc-7f22](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22) 的版本范围。但公告同时要求开发服务网络可达、特定导入路径、敏感文件未被 deny、非 Windows。默认 dev 使用 127.0.0.1，未确认该特定导入路径，正式包加载静态资源；记录为开发工具链维护项，不能宣称已存在正式应用远程文件泄露。
- 锁定 Vitest 1.6.1 已修复 [GHSA-9crc-q9x8-hgqq](https://github.com/vitest-dev/vitest/security/advisories/GHSA-9crc-q9x8-hgqq)，本轮也没有启用 API/UI 服务；排除该公告作为当前已确认 RCE。其他公告需按各自范围核实，未完成全依赖漏洞数据库穷举。
- 锁文件共 638 个 package 记录，含根项目，非 638 个独立运行时依赖。用户明确授权后完成批量元数据查询；未运行安装脚本、自动升级、audit fix 或上传私有源码。

## 结构改进机会

`App.tsx` 6888 行、harness 1105 行、Telegram service 1004 行，共享与 renderer 类型分别 1069/874 行。大小用于定位阅读与变更热点，不作为缺陷证据。实际缺陷中的文件创建、状态回写、跨聊天上下文等问题说明，应按资源与状态所有权拆出稳定职责，优先减少多处维护同一规则；不安排没有行为验收的大规模重写。

## 当前局限

本轮没有运行真实桌面、完整 runtime、自动更新、真实大仓库索引或远程部署。没有据此给出整机性能、GPU 行为、安装包兼容或无漏洞保证。依赖完成锁文件批量查询和针对性主源复核，不是全部上游公告的利用验证或扫描认证。测试源文件的进一步断言和副作用深审另见测试专项。
