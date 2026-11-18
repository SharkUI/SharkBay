# 模块 资源 状态 测试与文档清单

目标提交 `2fc9c935892d04748c01579f819da701eb163150`。原始文件表与内容指纹见 `baseline.json`，文本规模见 `file-inventory.json`，TypeScript 静态导入关系见 `source-graph.json`。这些机器清单表示范围，不自动证明每一行已审阅或每一分支已运行。

## 模块与主要入口

| 模块组 | 入口和副作用 | 审查证据 |
| --- | --- | --- |
| Electron/main 与 preloads | 窗口、IPC、runtime 发现、浏览器、更新和桌面资源 | 安全、状态与构建专项；真实窗口验证延后 |
| server/control/application runtime | HTTP/WS、owner socket、命令分发、配置单写入、服务初始化和退出 | 安全与资源专项；静态调用链完整应用不启动 |
| core/providers/profiles/plugins/storage | 调度、索引、工具安装、机器/项目探测、缓存 | 资源专项两轮；profile 与 installed plugin 的未接入边界明确区分 |
| main 文件/Git/协议 | 文件 CRUD、worktree、clone、harness、任务镜像、review/artifact | 安全专项及 UI-06；临时 Git 与文件模块复现 |
| Agent/hooks/terminal | PTY、转录读取、OSC/hook、状态归属、headless screen、会话恢复 | 资源与状态专项；真实 CLI/PTY 集成延后 |
| Telegram | 配对、poll、选择、审批、路由、turn、transcript、展示与 API | 状态专项，假 API 反例；真实网络不调用 |
| renderer/island/find | 界面契约、项目刷新、文件编辑、状态投影、跨端 bridge | 状态专项两轮，纯逻辑测试；App 关键业务深审，其余分支按专项说明抽样 |
| shared | schema、命令、事件、共享与镜像类型 | 跨入口追踪与类型检查；静态可达包含 type-only 引用 |
| scripts/config/package | 编译、复制、签名、发布、验证脚本副作用 | 构建专项，现有配置与纯复制测试；未创建或启动安装包 |

审查深度在专项报告中标明：静态全文、关键调用链、结构扫描、模块反例、未执行的集成。130 个生产 TS 模块的导入图不是符号级可达性证明；例如整个 profile 文件可被导入，但 readProjectProfile 函数仍可能没有产品入口。

## 资源所有权与边界

| 资源 | 创建/拥有者 | 上限、释放与发现 |
| --- | --- | --- |
| 调度槽与 deadline | JobScheduler，按 target | 默认 2 槽；嵌套等待与取消契约见 RL1/RL2 |
| 索引 CLI 与项目 jobs | CodeGraphManager | 主动超时/取消有进程组保护；信号退出与禁用并发见 RL4/RL5 |
| JSONL reader | 会话 reader/usage scanner | 64 KiB 块、4 MiB 行上限，释放文件句柄；1/8 MiB 微测和 20 轮读取 |
| Kiro JSON | usage scanner | 16 MiB 前置限制，超限跳过的统计完整性代价需显式诊断 |
| Usage 批队列/SQLite | runtime collector/DB | 批事务和去重存在；失败丢批与 timer 错误见 RL3 |
| 机器/项目 profile | cache/orchestrator | TTL 与 fingerprint 存在；启停失效与未接入路径见 RL6 |
| PTY/headless 输出 | runtime terminal manager/state | 退出和控制权由 runtime 管；完整生命周期后验，不能根据 JS 堆限制推断原生内存上限 |
| Telegram raw turn 输出 | TelegramService.chat | 没有原始缓冲上限，UI-07；显示截断不释放原始 buffer |
| watcher/去重 map/磁盘缓存 | 各读取与缓存模块 | 有取消和部分生命周期清理，长期保留/淘汰是独立改进机会，未做长时认证 |
| profile 锁与恢复 guard | acquireProfileLock/release | wx、token、ESRCH-only 和恢复互斥有效；保守拒绝时需诊断 |

详细创建、释放、字符与字节单位、进程与后代区别见 `resource-lifecycle.md`，不把一个模块的上限扩展为全应用保证。

依赖清单与33条包级告警见 `dependencies.md`、`dependency-triage.json`；运行期/构建期及嵌套版本复核见 `dependency-runtime-review.md`。开发标记不能直接排除实际随包分发的Electron，目录中存在optional依赖也不等于实际调用。

## 状态机制

`states-ui.md` 给出 AgentHookStateManager、ProgramStatusReader、CodexTurnReader、AgentRuntime attribution、TerminalState、renderer hook projection/unread、TaskRuntime、Telegram chat/turn、editor、browser bridge 和 island 的归属与用途。

主要结论：Agent 执行事实、终端屏幕证据、界面未读和 Telegram 活动 turn 语义不同，不应因都叫“状态”就直接合并。真正的问题集中在审批请求身份、跨用户列表、PTY→chat 索引、轮询 generation 及未触发的 turn 结束分支。按写入者、消费者、输入身份、迁移、恢复与通知分别收敛。

## 遗留与简化候选

| 候选 | 用途证据 | 决策与验证 |
| --- | --- | --- |
| installed-plugins / plugin-manifest | 无生产扫描调用，manifest 仍有单元测试 | QB-02；标注未实施或评估删除，不能自动启用磁盘代码加载 |
| token-usage-pricing | 空定价表，无生产和测试引用 | QB-03；核实历史意图后小批删除，不新增定价功能 |
| readProjectProfile 路径 | 核心转发/provider 有定义，未找到公共命令和 UI 消费者 | 资源专项反证；未接入设计候选，不认定为当前项目 UI 性能缺陷 |
| Telegram turnEnd/silence/settling | 测试有输入，生产 service 无来源 | UI-08；明确契约后删除或设计有效来源，不能把沉默当完成 |
| countOnline/editorIgnoredExtension | 辅助函数或空导出缺少生产消费者 | 状态专项保留为候选，使用符号关系、外部入口和测试依赖再次核实 |
| renderer/shared 镜像类型 | 两处分别维护，类型检查无法自动证明语义等价 | 契约治理机会；从公共传输类型减少独立定义，保持客户端能力差异 |

App 6888 行、harness 1105 行、Telegram service 1004 行为维护热点。文件规模不自动构成缺陷，也不作为删除或整体重写理由。

## 测试清单

82 个测试文件与 helpers 的逐文件分类、阅读深度和副作用说明见 `tests-inventory.md`，断言、隔离与真实实现差距见 `tests-quality.md`。13 个被运行的文件名单与结果见 `selected-tests.json`；其他文件的静态检查不能写成测试通过。

## 文档差异

| 文档 | 冲突或缺口 | 处理方向 |
| --- | --- | --- |
| product.md | 终端编辑器说明过时，遗漏 shared runtime/WebUI | 按现有产品规则描述编辑与多端能力；保留仍有效的 desktop-first 定位 |
| release.md | Known Packaging Note 与现有 tests 排除规则不符 | 区分编译输出、打包过滤和实际包验收 |
| execution-target-profiles.md | tracker 仍将 utilityProcess/core-host/core-client、installed scanner 标已完成 | 分清历史实现、现状和未来提案，修改“已完成”事实 |
| roadmap.md | mobile/small-screen non-goal 与已接入移动布局不一致 | 明确移动体验当前支持范围与质量承诺 |
| tasks.md/协议说明 | 安装前提与 local-only 任务行为有漂移 | 区分本地记录、GitHub 权限和同步行为，不混为同一前提 |
| index.md/根指令 | “代码和测试始终权威”不能覆盖产品规则 | 用户与产品决策定义应有行为，代码/测试/运行证据说明实际行为 |
| hooks/Telegram 注释 | three-state/旧别名、silence tick 来源与现状不符 | 状态定义与生产事件来源共同维护 |

相对文件链接没有坏不能证明以上陈述正确；历史设计本身可以保留，但角色和实施状态必须准确。
