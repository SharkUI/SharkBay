# 测试工程质量审计

固定基线：`2fc9c935892d04748c01579f819da701eb163150`。本分项只做静态阅读，没有执行测试、构造攻击或启动应用。其他分项执行的测试结果由主审单独记录。

## 范围和阅读深度

源码快照有82个 `.test.ts`，共9751行，另有共享 `tests/helpers.ts`。本审查员完成43个测试文件及helpers的全文人工阅读、9个长文件的关键段抽样和30个文件的结构初筛。资源/生命周期审查员另完成20份全文阅读，在 [resource-lifecycle.md](resource-lifecycle.md) 逐项记录；状态/界面审查员完成另19份全文阅读，见 [tests-state-ui-review.md](tests-state-ui-review.md)。团队全文覆盖82/82，分工不重叠。逐文件归属见 [tests-inventory.md](tests-inventory.md)，本审查员的抽样与初筛保留原标注，其他人的全文阅读单列说明；这不代表动态测试全部通过。

[evidence/tests-metadata.json](evidence/tests-metadata.json) 是只读文本提取的 imports、测试标题及mock/文件/进程线索；其中标题计数可能受参数化测试及字符串干扰，不用来证明测试总数、实际副作用或人工审查完成。安全报告中的复现结果只用于解释测试缺口，不属于本次测试质量工作的执行结果。

## 主要判断

测试套件并非全无有效断言：状态归属、取消、字节偏移、真实headless terminal序列化、锁竞争和Git本地同步已有实质回归用例。但快测、主机集成与完整runtime混在同一默认集合，fixture清理与副作用隔离不统一，部分重要产品行为仅有源码形态检查，持久化与业务边界仍有明显空白。因此“全量测试通过”应解释为当前用例集合通过，不能解释为全项目的隔离性、数据安全和可靠性已得到证明。

本分项提出4项P2测试工程问题/验证缺口。它们不替代关联产品缺陷的独立严重程度。

## TQ1 fixture生命周期没有统一清理，部分定时器可在清理后重建目录

- **位置**：`tests/helpers.ts:6–15`；`tests/agent-clis.test.ts:9–42`；`tests/config-migration.test.ts:14–107`；`tests/path-safety.test.ts:8–25`；`tests/prompt-store.test.ts:10–16,19–70`；`src/main/hooks/prompt-store.ts:90–117`。
- **静态确认**：makeTempRoot和makeTestRuntime只分配目录、不注册清理，多个全文审查的调用方也没有finally/afterEach清理。createGitRepoFixture只是创建空`.git`目录，不是真实Git仓库；它适合无VCS文件profile测试，不能覆盖Git/worktree行为。
- **延迟副作用**：prompt-store测试调用record会安排500ms写入；afterEach只rm目录，没有对每个store调用flushSync取消定时器。定时器若在同worker后续用例期间触发，flush中的mkdirSync会重建已删除目录并写入旧fixture。该链路静态确认，未为本报告运行测试重现。
- **影响**：重复运行积累临时数据，污染测试生命周期；清理结果不能证明所有异步资源结束，未来改成共享fixture或非唯一目录时风险更大。这里没有真实用户目录被写入的证据。
- **最小改进**：共享fixture返回显式清理句柄或注册测试清理；先取消/flush定时器、stop/dispose被测对象，再删除fixture；即使断言或初始化失败也执行cleanup。
- **验收**：一组用例结束及超过最长延迟后，专属临时目录仍不存在；无悬挂进程、timer或监听器。不要只等待固定sleep掩盖资源未释放。

## TQ2 默认测试集合混合真实机器探测和完整runtime，缺少执行分层

- **位置**：`vitest.config.ts:10–19`；`tests/profile-orchestrator.test.ts:45–53`；`tests/agent-clis.test.ts:9–42`；`tests/web-runtime-integration.test.ts:1–66`；`tests/profile-lock.test.ts:18–23,42–68`。
- **静态确认**：默认include匹配全部测试。profile-orchestrator实例化真实LocalProvider并调用readMachineProfile，执行主机工具发现和版本探测；只有data-dir是临时的。agent-clis传入fake home的用例仍调用真实command resolver。web-runtime-integration在beforeAll显式启动完整ApplicationRuntime、HTTP/WS和控制socket，并创建真实PTY。锁测试也创建受控Node子进程，虽非应用启动，仍需独立资源和清理预算。
- **影响**：执行`npm test`并非只运行无副作用单测；测试结果依赖当前主机shell、CLI、Git和网络接口。单纯临时config不能保证不会读真实Agent目录、加载用户shell初始化或启动后台监听。
- **补审确认的固定路径写入**：资源审查员全文检查 `codegraph-manager.test.ts:38–78`：即使CodeGraph命令是fake，成功init后的生产 `ensureGitExcludeEntry` 仍写固定 `/tmp/sharkbay-codegraph-project/.git/info/exclude`，没有专属fixture和清理。状态审查员发现 `reasonix-hooks.test.ts:58–70` 使用真实manager处理固定cwd `/tmp/sharkbay-project`，经 `state-manager.ts:361–366` 创建并追加 `.sharkbay/logs/hooks.log`。后者已由本审查员再次静态核对。两例都说明“mock了外部命令”不等于其余文件副作用已隔离。
- **误报排除**：真实集成测试具有验证价值，不建议删除；install-tool.test.ts使用InstallTestProvider覆盖runCommand和机器profile，并不真的运行npm/curl安装。不能仅因为测试源码包含安装命令就认为已执行安装。
- **最小改进**：按纯逻辑、临时文件、受控进程、主机探测和完整集成分project/配置；默认快测禁止真实外部入口，真实探测与runtime集成显式选择，设置资源与清理契约。通过参数注入而不是默认目录发现实现隔离。
- **验收**：默认快测在无Agent CLI、无真实用户会话和禁网环境通过且不启动应用；集成集合明确声明真实能力及环境，失败后没有残留。

## TQ3 源码形态检查不能证明运行时行为边界

- **位置**：`tests/codegraph-manual-index.test.ts:7–19`；`tests/build-config.test.ts:24–82`；`tests/terminal-close-resize.test.ts:8–45`；相关分类表中的源码检查用例。
- **静态确认**：CodeGraph用例只寻找名称精确为useEffect的call，并在其文本内匹配ensureCodeGraphStatus。若effect调用封装函数、别名effect或由其他事件调度索引，检查不会遍历调用关系。按钮onClick存在只证明有该字符串，不证明自动索引路径不存在。
- **范围区别**：build-config断言配置字段，不能证明最终安装包按配置收录，也不能证明签名有效。runtime-packaging有实际调用Electron Builder复制库的更强证据，但仍不覆盖实际打包产物。terminal-close-resize抽取并执行真实handler，比纯字符串检查有效，但其VM上下文仍被替换，未验证React渲染、事件绑定和端到端控制权。
- **影响**：修改可以保持源码检查通过却破坏产品契约；重构也可能在行为正确时仅因名字或代码位置变化导致测试失败。
- **补审确认的弱断言**：`harness.test.ts:613–614,626–628,632–634` 比较两个正则可选捕获 `match(...)?.[1]`。若双方都未匹配，`undefined`相等仍通过；相邻的普通文本存在断言不能证明两个ID确实被提取且值一致。应先断言两个match均非空，再比较值。
- **补审确认的回显误判**：状态审查员指出 `terminal.test.ts:305–316` 的printf输入包含其断言查找的 `sharkbay-terminal-ok` 字串，终端echo输入本身即可满足输出断言；应让预期marker不直接出现于输入，或检查独立进程执行结果。
- **最小改进**：保留少量有意的静态架构约束，同时用可注入的业务动作测试选择项目、文件事件与手动维护的实际调用；后续授权环境内补打包产物与真实桌面边界验收，不把它们混入快测。
- **验收**：自动入口通过任何封装触发索引都能被行为测试发现；合法重构不因文本布局失败；报告分别列配置、复制、产物、启动和签名的证据层级。

## TQ4 风险到测试的映射不完整，部分重要边界只测正常路径或纯映射

| 业务/风险 | 当前证据 | 缺失的有效回归 |
| --- | --- | --- |
| 新建文件与文件夹 | file-boundaries测越界与rename；UI新建路径复用覆盖写入，关联界面分项已确认 | 新建同名必须保留旧内容，目录同名与现有.gitkeep，保存与新建语义分离 |
| linked worktree协议与同步 | helpers使用空`.git`目录；task-runtime-install使用普通git init；harness/install正常场景 | 真实git worktree/gitfile、安装部分失败后状态、正确Git路径与index保留 |
| SQLite持久化与SQL聚合 | token-usage-db.test.ts全文只测JS行映射与token计算；collector用强制类型转换的假DB | 临时真实SQLite的唯一约束、事务失败、迁移、SQL聚合与JS公式一致性、恢复后重复扫描 |
| JobScheduler | job-scheduler.test.ts只有dedupe成功与单target并发上限两例 | timeout后真实任务仍运行、拒绝与重试、取消、跨target、队列继续推进与迟到完成 |
| Git文件名与镜像一致性 | git.test.ts覆盖ASCII和首字符；同步已有成功push与更新测试 | 中文/控制字符/rename双路径；远端删除、成功空树与读取失败的区别 |
| hooks配置保留 | hooks-connectors测试正常合法配置的安装卸载与迁移 | 非法JSON/TOML、读权限错误、写失败、并发修改时不抹除用户配置 |
| LAN认证模型 | web-runtime-security明确将LAN无cookie访问视为成功 | 安全需求级别的授权与撤销契约；若设计调整，测试也要按新的威胁边界更新 |

这些是静态覆盖缺口，不以缺少某个测试直接断言所有相关实现都有bug。文件新建、worktree和Git文件名等已有其他审计分项的具体缺陷证据；新增测试应针对这些契约和反例，避免只增加实现镜像或用例数量。

## 断言与mock的正面证据

- `agent-session-reader.test.ts`注入两种会话根，验证UTF-8偏移、partial append、truncation并停止watcher；比只测解析函数更能覆盖真实读取边界。
- `file-boundaries.test.ts`真实临时symlink与外部邻居路径，并检查失败后原文件仍保留；不只断言某个函数被调用。
- `profile-lock.test.ts`区分同进程竞争、独立进程竞争、活PID、EPERM和配置锁冲突；仍需关注平台与进程观测环境。
- `terminal-state.test.ts`使用真实headless xterm解析快照、alternate screen和颜色，且dispose observer与state；不是只比较发送字符串。
- `telegram-api.test.ts`注入fetch，验证重试次数、429和请求body；没有真实Telegram发送。`telegram-service.test.ts`只覆盖submit序列，不能由文件名推断整个service已验证。
- `task-runtime.test.ts`对同步生命周期的mock适合验证调度归属，但没有覆盖TeamworkSync内部行为；后者应由真实临时Git仓库测试承担。

## 建议实施顺序与验收

1. 先整理测试分层与fixture生命周期，确保执行检查本身可控。
2. 将已发现的数据损失、worktree和状态/调度缺陷补成最小契约回归；每项能够在对应错误实现上失败。
3. 对存储、取消、并发、失败恢复补真实临时组件验证，保留mock用于外部边界，明确mock未验证的行为。
4. 将资源与长时间测试单独运行；固定预算、时钟与观察指标，针对不稳定用例调查，不盲目重复所有测试。
5. 发布阶段分别验收配置、产物和安装行为，更新测试说明，避免用一个绿色总数替代各层结论。

本报告不提供本分项新执行的通过率、性能数字或mutation score。未执行的完整runtime、真实机器探测、攻击验证和故障注入保持未执行状态，不记为通过。
