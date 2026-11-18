# 状态 界面和终端测试全文审读记录

审计输入：`2fc9c935892d04748c01579f819da701eb163150` 的固定快照。本记录供测试总审合并；没有运行以下测试，尤其没有运行真实 PTY、socket transport 或配置安装用例。下表的“全文”指已检查测试正文、fixture、mock、断言和清理代码，不代表运行通过。

## 文件级覆盖

| 文件 `tests/*.test.ts` | 全文行数 | 类型与副作用 | 断言及质量结论 |
| --- | --- | --- | --- |
| agent-status-coalescing | 157 | Fake timers，临时日志，真实纯 manager；connector 仅 normalize | 200事件→2通知、持续流200ms、即时快照、语义变化、清理均有行为断言；afterEach dispose/rm/恢复时钟良好 |
| agent-status | 567 | 前半 fake timers/临时transcript，末尾真实Unix socket与child hook CLI | 乱序、身份、OSC/hook、elicitation、子Agent、时效有丰富正反断言；资源登记afterEach，socket finally stop；child Promise无单独硬超时和kill兜底，依赖测试框架超时，未运行 |
| artifact-runs | 167 | 临时repo、假的Agent/PTY、真实文件预留、5ms重试 | 验证结果/路径/token以及失败空文件清理；临时repo无删除，dispose在断言之后而非finally，断言失败会遗漏timer清理 |
| browser-tab-close | 69 | AST抽取真实App函数到vm，假bridge/state | 覆盖移除与下一tab选择、等待close、错误后清理；比只正则检查源码强，但不是React挂载或真实BrowserView验收 |
| codex-input-state | 199 | 纯屏幕字符串与hook合并 | 正例、滚动历史、窄窗、队列、partial redraw、过期证据与权威冲突均有实际返回值断言；真实CLI布局兼容性仍需样本更新 |
| hook-sessions | 140 | 模块级临时根、os.homedir mock、多类临时session读写 | 模型补全、subagent/app-generated过滤有内容与数量断言；无目录清理和fakeHome重置，见问题R4 |
| island-auto-expand | 221 | 完整HTML script在fake DOM/vm运行，fake timers | 自动/手动展开、稳定阈值、取消、聚焦和关闭脉冲断言有效；afterEach清timer；不覆盖真实DOM布局和窗口行为 |
| opencode-hooks | 155 | normalize纯逻辑；覆写私有路径后安装到临时config/plugin目录 | normalize正反、安装文件与配置、卸载检查；finally rm良好；生成插件仅字符串检查，未验证真实OpenCode事件接入 |
| reasonix-hooks | 139 | normalize；真实manager日志；临时config安装；CLI生成文本检查 | payload与保留用户hook断言有效；manager使用固定/tmp/sharkbay-project真实写日志，见R1；CLI transport仅文本存在性，不证明事件到达 |
| renderer-workflow | 76 | 纯函数 | 尺寸、候选、URL分块/ANSI、model格式有实际输出断言；未覆盖IPv6 loopback和跨客户端localhost语义，不把这些遗漏当成已验收 |
| task-detail-helpers | 109 | 纯fixture | title索引、grapheme、文件操作路由、commits兼容、artifact路径提取有明确预期；不直接证明后端路径权限 |
| tasks | 231 | makeTempRoot，真实文件扫描 | task去重/优先级、sections、commits及artifact/review叠加有结果断言；临时目录不清理，未覆盖损坏/超大输入和watcher生命周期 |
| telegram-ansi | 41 | 纯字符串 | CSI/OSC/CR/退格/空内容断言有效；有限样本不证明任意TUI重绘可还原，当前产品对支持transcript的Agent已有避免原始PTY策略 |
| telegram-render | 108 | 纯fixture与传入now | 列表按钮、选择、长度、分块有断言；仅验证parseSelection不能覆盖service全局列表上下文，UI-03仍能存在 |
| telegram-transcript | 258 | 合成provider记录，纯解析 | 明确检查排除thinking、end_turn、tool边界、last-turn切片、异常行与fallback；未验证runtime cursor读取/轮询竞态，不能将其等同端到端正确 |
| telegram-turn | 115 | 纯事件序列与显式时间戳 | 断言真实状态/action与负例；主要使用stopped/approval兼容别名，未覆盖全部新done/failed/interrupted/monitoring表现；turnEnd/silence生产不可达，关联UI-08 |
| terminal-approval-detector | 151 | fake timers、增量字符串、真实纯detector | 退避/去重/重入、untrack、chunk分割、ANSI与scrollback负例均有行为断言；多数在advance后无未到期timer，未验证组件dispose清理，不作全面无泄漏保证 |
| terminal-bootstrap | 115 | mock PTY，临时Git仓库和配置，fake timers | 精确验证bootstrap内容和延迟Enter；session finally close，但目录未rm；是模块级验证，不运行真实模型 |
| terminal | 457 | 部分纯函数，部分真实登录shell/PTYS、临时Git仓库、环境stub | 输入/标题/路径/notify/session环境有真实断言，finally关闭PTY和unstub env；普通output case可由输入echo满足，见R2；真实登录shell会读取机器环境，非完全自包含单测 |

合计：19 个测试文件、3475 行正文已全文阅读。没有将导入/测试名搜索计为本轮全文阅读。

## 需要合并到测试问题台账的证据

### R1 固定临时路径仍会发生真实写入 P2

`tests/reasonix-hooks.test.ts:58-70` 使用真实 AgentHookStateManager，以固定 cwd `/tmp/sharkbay-project` 调用 handleMessage。`state-manager.ts:49-58,361-370` 会 mkdir 并 append `.sharkbay/logs/hooks.log`，因此该用例不是纯内存测试，也不使用自身拥有的mkdtemp目录；反复或并行执行会污染同一目录，现有文件也会被追加。normalize-only用例的假路径没有此副作用，不能笼统把所有出现/tmp字串都认定为写入。

建议使用独占fixture根，并在finally/afterEach清理。未实际运行此用例，未检查或修改该真实固定路径。

### R2 回显文本能使“命令执行成功”断言误通过 P2

`tests/terminal.test.ts:305-316` 只等 `event.data.includes('sharkbay-terminal-ok')`，发送的printf命令本身含同一字符串，终端回显即可满足，不能证明命令执行。相邻initial command用例特意通过base64生成标记并断言不出现命令原文（`:392-403`），说明已有更强的测试模式。

建议生成不会以明文出现在输入的标记、核对独立退出/结果文件或分离echo；用只回显不执行的假PTY反例验证此测试会失败。未运行PTY或做源码变异。

### R3 失败时清理责任不完整 P2

`tests/artifact-runs.test.ts:11-62,66-85` manager有重试timer，dispose只在全部断言之后。前面的expect失败时没有finally/afterEach承担dispose；fixture repo也没有rm。`tests/agent-status.test.ts:553-559` child生成CLI传输Promise没有自有timeout/kill，测试超时后也没有显式捕获child句柄并结束；bridge的finally stop并不等于结束子进程。

建议把manager、child、fixture的清理登记在创建成功后立即建立；框架超时不应是清理机制。不要将潜在失败路径误记为本轮实际遗留了进程，本轮未执行。

### R4 多文件fixture目录与状态未复原 P3

`hook-sessions.test.ts:15` 模块级mkdtemp以及每case仓库/home均无删除；`fakeHome`跨case保留，后续未设置的Gemini case会继承前一case的fake home。`tasks.test.ts`、`terminal.test.ts` 与 `terminal-bootstrap.test.ts` 通过makeTempRoot/makeTestRuntime创建目录，也没有目录teardown。helpers自身不登记清理，这些文件不能依靠“fixture名字是temp”推断资源已释放。

建议建立显式fixture生命周期；共享helper允许返回cleanup，或集中登记afterEach/afterAll。terminal已有PTY close和env恢复应保留，不把目录泄漏扩大为所有资源都未清理。

### R5 测试与生产契约没有贯通 关联已有UI-08和QB-06

- `telegram-turn.test.ts:83-102` 测试的turnEnd/silence由生产service不发送；对应settling只在测试中可达。应先决定现行产品的结束证据规则，再清理或接通，不盲目启用“沉默即完成”。
- OpenCode安装与Reasonix CLI测试使用toContain检查生成脚本，不能证明真实provider兼容。已有agent-status末尾的真实受控socket transport提供更强验证范式，但仍不代替安装后的Agent验收。
- AST提取browser-tab-close的真实处理函数保留了实际行为测试价值；其限制是替换React和宿主，并非所有源码相关测试都应删除。

## 保留的有效做法

- agent-status/agent-status-coalescing登记manager与目录并在afterEach释放，时钟固定且测试清理不依赖成功路径；不要为“减少测试文件”删除这些负例。
- codex-input-state对过期证据与真实未回答问题分开断言，有助于防止恢复旧三态假设。
- island全脚本vm测试对展开时序和取消做细粒度控制，明确限定为纯逻辑而非真实窗口验收。
- terminal环境隔离用例将脚本放在临时repo，执行假Agent而非真实模型，且finally恢复stub环境；应进一步隔离登录shell初始化并补fixture删除。
