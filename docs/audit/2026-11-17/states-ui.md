# 状态并发与界面业务审计

对象：`2fc9c935892d04748c01579f819da701eb163150`，输入固定为 `/tmp/sharkbay-audit-2fc9c93`。报告中的行号均对应此提交。本专项未修改产品源码，未启动完整 runtime、Electron 或 Telegram 网络连接。

## 结论

发现 3 项 P1、4 项 P2 和 1 项 P3。最重要的问题是普通 Telegram 网络故障可导致共享 Node runtime 退出，以及“新建文件”使用覆盖写入接口导致现有文件被清空。Telegram 的用户、列表、审批请求和 PTY 生命周期之间还存在多个身份及归属缺口，符合长期功能叠加后状态契约未贯通的特征。

这些问题均由独立业务链路检查得到，不构成对历史整机卡顿根因的判断。安全专项对 UI-06 的后端覆盖语义做了交叉确认。

## 已确认发现

### UI-01 P1 Telegram 附属网络请求失败会成为未处理 Promise 拒绝

- 证据：已复现；`src/main/telegram/service.ts:808,827-828,846,877` 对 editMessageText、sendChatAction、deleteMessage 使用 `void`，没有 rejection handler。`src/main/telegram/api.ts:105-106,122-143` 的 API 请求最终会 reject，typing 请求不重试。源码中没有全局 `unhandledRejection` 处理。
- 触发链：已进入会话且 Agent 正在工作 → startTyping 或 progress edit / approval cleanup → 网络断开、超时、机器人被屏蔽或消息不存在等 API 错误 → 无人接住拒绝。`pollLoop` 的 per-update catch 不覆盖这些脱离调用栈的 Promise。
- 复现：只构造 TelegramService 并注入会 reject 的 `sendChatAction`；隔离 Node 子进程以状态 1 退出。实际应用没有启动；当前测试 Node 为 v24.14.1。共享 runtime 将该 service 与 PTY 放在同一进程，因而存在整体会话中断风险；未在真实应用内执行故障注入。
- 最小修复：为全部 best-effort 异步副作用统一捕获并分类记录错误；对 finalizeChat 等由事件触发的异步函数也核查拒绝传播。不能以空全局 handler 代替局部错误与清理策略。
- 验证：分别注入网络、400/403、重试耗尽和取消错误；进程存活，业务可继续且无无界重试。

### UI-02 P1 审批按钮缺少请求身份 可向另一会话误发送确认

- 证据：已复现；`service.ts:352-366,836-848,976-982`。所有审批按钮仅携带 `akey:y/n/enter`，收到回调后通过 userId 查找“当前”chat，直接向其 PTY 发送 y/n/回车。
- 触发链：用户在会话 A 收到审批消息 → 切换会话 B → A 的按钮回调迟到或旧消息删除失败后再次点击 → 操作被送到 B。代码没有比对 callback message id、chat id、terminal id、turn/request id 或 B 是否正等待审批。
- 保护条件：发送者必须已配对；这是已授权用户操作对象被错误归属的问题，并非无认证攻击。
- 复现：将用户绑定到 pty-B，注入表示旧 A 消息的 `akey:y` 回调；实际捕获输入为 `{id:'pty-B',data:'y\r'}`，B 没有活动审批也会接受。
- 最小修复：为每项审批绑定不可复用请求 token、用户/聊天/终端/turn 与消息 id，结果只应用到仍活动的原请求；失效回调返回过期，不发送输入。
- 验证：跨会话、跨 turn、重复按钮、删除失败、停用或撤销后的迟到回调均不产生输入；有效按钮只应用一次。

### UI-03 P2 会话列表的选择上下文跨用户共享

- 证据：已复现；`service.ts:170-172,328-332,462-491,576-601`。`lastSessionRows`、`lastResumeRows`、`lastListKind` 是 service 全局字段。
- 触发链：用户一看到列表 A；另一用户刷新出不同列表 B，或发送 /resume 改变 lastListKind；用户一回复数字 1，被解释为另一份列表的第一项。单个用户打开旧消息后数字回复也有同类问题。
- 复现：用户一列表仅 A、用户二列表仅 B，用户一回复 1 后 chat 实际绑定 pty-B。
- 保护条件：按钮自带 session id，通常不会因为排序变化选错，但 parseSelection/enterChat 仍依赖最新全局列表，可能把原按钮判为过期。数字选择存在明确误选。
- 最小修复：按用户和聊天存储选择上下文，绑定列表版本或消息 id；不同列表种类分别管理。数字回复需明确使用哪份当前列表。
- 验证：至少两用户、交替 /sessions 与 /resume、不同 limit 和动态会话变更，旧上下文不能改变另一用户的选择。

### UI-04 P2 停用并未阻止在途轮询结果执行

- 证据：已复现；`service.ts:240-275,292-304`。stop 仅清 polling 布尔值；getUpdates await 返回后无代际和 polling 检查，直接遍历 handleUpdate。
- 触发链：已有长轮询 → 用户停用 Telegram → 原轮询返回已授权用户的 /new、选择或提示等更新 → 仍可执行命令和外部副作用。快速重新启用还可能使旧 loop 与新 loop 同时存续，start 的 polling 判断发生在异步 secret/getMe 之前。
- 复现：注入 pending getUpdates，开始 pollLoop，调用 stop 后再返回更新；handleUpdate 仍被执行 1 次。
- 最小修复：启动任务 single-flight，stop 增加 generation 并 abort 在途 poll；await 返回后及处理每项 update 前检查 generation 和 enabled。token 更换也应切换 polling generation 并处理 offset 归属。
- 验证：停用、启停竞争、并发 start、token 更换、长轮询失败后恢复，只有当前一代可调度消息。

### UI-05 P2 多用户绑定同一 PTY 时路由被覆盖且可被另一用户清除

- 证据：已复现；`service.ts:169,610-637,720-757,912-917`。chats 可同时容纳多用户，但 ptyToChat 只保存一个 userId；registerChat 无独占检查，detach 无所有者比对地 delete(ptyId)。
- 触发链：用户一与用户二进入同一终端 → 第二个覆盖输出路由，但第一个仍可发送输入 → 第一位 /stop 或 idle 清理 → 删除第二位的输出路由；feedStatusChange 又仅 find 第一位匹配，状态与输出可分发给不同用户。
- 复现：两位注册同一 pty，detach 第一位后第二位 chat 仍在，但 ptyToChat 已无该终端。
- 最小修复：明确远程控制是独占还是多订阅。独占需原子接管并通知旧用户；多订阅需 terminal→Set<chat>，状态和退出同样广播。至少删除映射前核对所有者。
- 验证：双用户进入、接管、退出、撤销、超时和终端结束，输入控制与输出/状态订阅一致。

### UI-06 P1 新建同名文件会清空现有文件

- 证据：静态确认并经安全专项交叉检查；`src/renderer/App.tsx:4831-4847`、`src/main/file-content.ts:40-55`。
- 触发链：Files → New file → 输入现有相对路径 → 调用 projects.writeFile(content:'') → 后端经安全路径解析后 fs.writeFile 默认覆盖 → 原文件内容被截断为零。New folder 同名路径还会覆盖既有 `.gitkeep`。
- 保护条件：项目包含与大小边界能够保护越界和超大输入，不能保护“新建”操作的不得覆盖语义。编辑保存需要覆盖，因此不能直接把原 writeFile 全部改成 exclusive。
- 最小修复：明确 create 与 save 的不同契约，为创建加入独立命令或 createOnly，后端使用原子 exclusive 创建而非前端 exists 检查；创建目录使用明确 mkdir 语义。
- 验证：临时仓库中预置非空文件，新建同名必须返回 exists 且字节不变；并发创建仅一个成功；普通保存仍正确。

### UI-07 P2 Telegram 只截断显示结果 未限制原始 PTY 缓冲

- 证据：静态确认；`service.ts:733-740,853-870,872-908`。活动 turn 的每段输出都执行 `chat.buffer += data`，progress 仅截断显示，final fallback 到完成时才取尾部。
- 影响：输出密集或因 hook 缺失长期不结束的 turn，内存随原始输出增长；即使 transcript.supports 为 true、不需要 PTY 文本，也保留全部原始 TUI 重绘。没有把这一点当作历史整机卡顿根因。
- 最小修复：支持 transcript 的 Agent 不保留无用途原始输出；其余使用按字节限制的尾缓冲。明确截断提示，结束/取消释放。
- 验证：固定帧反复输入，测量缓冲和内存达到稳定上限，最终摘要保持所需尾部。

### UI-08 P3 Telegram Turn 存在仅测试可达的结束机制与陈旧模型说明

- 证据：静态确认；`src/main/telegram/turn.ts:35-36,103-115` 的 turnEnd/silence 事件及 settling 状态在生产调用处没有对应输入，只有 `tests/telegram-turn.test.ts:83-102` 使用。注释声称 caller 会提供 silence tick，但 service 没有该调用。`hooks/types.ts:46` 仍写 three-state，实际别名已包含十余种显示状态；`telegram/types.ts:32` 保留 stopped/approval 旧别名。
- 影响：测试覆盖造成对生产兜底能力的误解，维护者难以知道哪些状态可以实际发生。此项不证明这些接口一定应删除，也不建议未经协议判断就接入基于沉默的自动完成（长时间思考不能等同完成）。
- 处置：决定是否有生产契约需要 turnEnd/silence；需要则设计正确来源及时间语义，不需要则删除不可达分支及仅验证该分支的测试并更新说明。状态别名在迁移审查后再清理。

## 状态机制和归属清单

| 机制 | 归属与数据 | 主要约束与结论 |
| --- | --- | --- |
| AgentHookStateManager | runtime 持有，terminal/provider identity→lead、children、questions、elicitation、evidence | 必需；不能与界面状态简单合并。关注身份、turn 版本、OSC/hook 权威仲裁与陈旧证据。200ms 通知合并保留即时 snapshot 与语义变化，不是待删除状态机 |
| ProgramStatusReader | 每 PTY 的 OSC 输入解析和 roster | 必需；增量解析有 8192 pending、128 records 边界，reset 清理和 query 不等同工作状态 |
| CodexTurnReader | 对当前 transcript 中 turn outcome 的受限增量读取 | 必需但属于补充证据；不能用屏幕静默替代明确生命周期 |
| AgentRuntime attribution | PID/terminal/provider 映射、pending prompt、lastPrompt | 应保留显式身份投影；异步 ps 后的 revision 检查是有效保护。后续可收敛分散 Map 的生命周期，不凭数量判冗余 |
| TerminalState | core PTY→headless screen/sequence，client owner | 必需；queue 保证 snapshot/resize 与输出顺序，排队 resize 重查控制权。输出队列边界由资源专项另审 |
| Renderer hook projection | hook entries→terminal snapshot→screen evidence merge→project pill | 派生状态应保持纯计算；显式 terminal attribution 高于恢复 alias，authority/revision 过滤旧快照是有效保护 |
| Renderer unread attention | acknowledged turn key 与实际执行状态分开 | 必需；看到通知不能等同回答问题或改变真实执行状态 |
| TaskRuntime | 每 repo 的任务 watcher 和 TeamworkSync | 应保留投影与实际 GitHub/协议规则的区别；其并发初始化、清理路径由资源与安全专项交叉审查 |
| TelegramService chat/PTY/turn | user→chat、PTY→user、turn、approval、list、poll enabled | 存在 UI-02 至 UI-05 的身份和所有权冲突，应先确定契约，再合并状态或简化索引 |
| Telegram Turn | awaiting/working/settling/done，sawWorking/approvalHeld | active turn 与 Agent 执行状态语义不同，应保留主边界；settling/turnEnd/silence 按 UI-08 决定用途 |
| Renderer editor | content/savedContent/loading/saving/error | dirty 与保存中修改能够分别表达；需增加 create/save 契约和外部修改冲突保护，前者为 UI-06 |
| Browser bridge | connection/clientId、terminal owner/session、frame sequence、attached | 多端必须保留本地连接投影；后端校验才是控制权事实。listTerminals 与控制事件的快照版本竞争需后续集成验证 |
| Island | renderer 发送的 tab 状态、unread 与展示/自动展开状态 | 是表现层投影；不应独立发明 Agent 生命周期。真实窗口布局和用户输入验证当前延后 |

## 界面异步与结构检查

- `App.tsx:819-827` refreshDetail 没有请求代际。切换 A→B 后迟到的 A 结果可以覆盖 B detail；`ProjectDetailPane` 的 `currentDetail = detail?.uri === candidate.uri ? detail : null` 防止把 A 数据作为 B 展示，因此当前确认影响是 B 面板可能暂时变空直到下一轮刷新，而不是跨项目操作误路由。记录为改进机会，不另作高危发现。
- Tasks tab 的请求取消标志、Files 首次加载取消标志、ProjectStart request version、UpdateHint receivedEvent 均是有效保护；类似规则可以提取为明确的异步读取契约，但不要求为单一用途新增通用框架。
- Files 的部分 catch 路径和同项目并发刷新未统一采用 generation；列表和 ownership 的旧快照可能覆盖较新事件。需要最小 DOM/桥接测试补证，当前不宣布数据损失。
- `App.tsx` 有 6888 行，混合窗口级配置、项目数据、终端生命周期、编辑器、任务与设置。行数不是缺陷证明，但 UI-06 与异步读取契约散落显示业务操作边界不清。建议按命令/状态归属拆职责，每批保持行为而不是整体重写。

## 验证记录

可重复脚本：[evidence/reproduce-state-defects.cjs](evidence/reproduce-state-defects.cjs)。运行命令：

```text
node docs/audit/2026-11-17/evidence/reproduce-state-defects.cjs /tmp/sharkbay-audit-2fc9c93
```

脚本只从固定快照转译 Telegram 纯模块到独立临时目录，注入假配置、API、terminal 与用户；不调用 start 或 init(enabled:true)，不读取真实会话、不打开端口。主脚本退出 0；断言 5 项已确认行为；其中未捕获拒绝子进程预期退出 1，其余断言成功。当前运行 Node v24.14.1，使用仓库已安装 TypeScript 转译器，不安装依赖。临时输出约数十 KB，计时约 0.1 秒，没有压力测试。

没有运行全量 npm test 或现有应用集成脚本。没有运行界面、安装、真实 Telegram 或真实 Agent 兼容性测试。

## 覆盖及限制

- 深审：Telegram service、turn、session-registry、dispatch、API；state-manager、program-status、codex-turn-reader；terminal-state；shared Agent status 与 renderer hook-snapshots/codex-input-state；App 的全局刷新、终端挂接、编辑保存、Files 创建、任务订阅和 CodeGraph 手动入口。
- 交叉审查：agent-runtime 的消息身份归属和清理、task-runtime 的 watcher/sync、runtime/telegram-runtime 的注入关系；schema/应用命令与事件按入口调用关系检查。
- 抽样检查：其余 App 设置与浏览器交互、island 表现状态、Agent connectors 的配置/normalize 契约、project-start、terminal-create-menu、update-hint、CodeEditor。没有声称 6888 行 App 与 HTML 中每一分支均经过动态验证。
- Agent CLI 当前版本协议、跨机器、多客户端与真实 Electron 交互受现有限制未运行；相关静态结论不代替这些验收。
- 用途清理候选包括 `countOnline`（生产无调用、测试在用，且只识别旧 working/approval）与 `editorIgnoredExtension`（空导出无消费者）；删除前由总审调用图结果统一核对，不以搜索一次无引用作为最终删除依据。

## 第二轮交叉复核

### 孤儿候选的反证结果

- **QB-02 确认用途缺口，保留决策条件**：读取 `src/plugins/installed-plugins.ts`、`plugin-manifest.ts`、`bundled-plugins.ts`、`plugin-host.ts`，核对 `src/core/core-service.ts:444` 的实际注册入口。当前只遍历 bundledPlugins 注册；src/tests/scripts 内全文符号搜索没有找到 scanInstalledPlugins、installedPluginsDir 或 declarativeInstalledPlugin 的生产消费者，parsePluginManifest 的生产引用仅来自该不可达扫描模块。没有磁盘 installed 自动发现入口，manifest main 字段也未被这里执行。此结论支持“未接通的结构”，不支持“应该启用它”或“任意磁盘插件已可执行”的判断。
- **QB-03 确认**：`src/main/token-usage-pricing.ts` 只有 ModelPricing 与空 DEFAULT_PRICING，限定自有代码/脚本搜索没有消费者；可列清理候选，仍应结合成本数据的历史决策后移除，不能借机添加猜测的价格。
- **补充候选**：`electron/preload.mts:363` 暴露 dock.updateBadge，但唯一 main handler 在 `electron/main.ts:419-425` 已注释，src/renderer 没有生产调用。属于退役入口与类型/IPC常量的协调清理候选，不能用它宣称当前通知功能故障，Island 是现有明确替代方案。

### QB-04 文档漂移的确认与修正

| 资料 | 对照结果 | 处理 |
| --- | --- | --- |
| `docs/product.md` | 内置 editor 与 WebUI 能力未反映；desktop-first 本身是产品定位表述，不能当作错误；1180 桌面最小宽度与 main 一致 | 保留合理定位，补充现状并修正 terminal-editor 描述 |
| `docs/execution-target-profiles.md:1396-1408` | Implementation tracker 把 electron/core-host.ts、core-client.ts 和 utilityProcess 隔离标为 Done；这两个文件已不存在，当前独立 Node runtime 由 ensureRuntime 连接。installed manifest scanner 被写成已读取，但生产未接通 | 强事实漂移，归入 QB-04；将实施 tracker 与未来设计分开 |
| `docs/roadmap.md:3,41` | 自称当前现状，却把 Mobile/small-screen support 列为 non-goal；mobile-layout.ts、visualViewport 和 App 已存在 Web 移动布局 | 更新阶段身份与已实施列表 |
| `docs/tasks.md:7-15` | 安装说明称必须 Git、GitHub origin 和 write/admin；task-runtime.ts 有 installLocalOnlyProtocol 退化路径，非 Git 或无权限也可安装本地 harness | 补充本地模式与同步模式的不同前置条件 |
| `docs/release.md`、`architecture.md` | 旧 compiled tests 全包含说法与 package.json 排除规则冲突 | 修正文案，真实产物仍需独立验收 |
| `docs/shared-runtime-plan.md` | 明确已确认 shared runtime 边界与分阶段验收；其边界能解释客户端退出保留 runtime 与 Agent | 保留为设计决策依据，补当前实施状态，不能据旧桌面退出语义要求杀 runtime |
| `docs/workspace-agent-platform.md`、`workspace-model.md`、`tasks-protocol-helper.md` | 文内明确有未来目标、设计目标或 Draft，但索引没有完整角色/生效状态说明 | 不逐条把未实施提案判为实现缺陷；补充提案/取代/现状标记 |
| `docs/agent-status.md` | 明确替代旧三态、静默即停止和查看即删除约定 | 保留其当前契约；UI-08 中旧注释需要对齐，不能为接通旧测试而恢复过期语义 |
| `docs/shared/README.md`、`docs/index.md` | HTML 已标为历史设计；“代码和测试无条件权威”的判断规则缺少产品约束层 | 保留历史标记，修正规则优先级 |

上述结论合并到主审 QB-04，不另计重复发现。

### 新增静态覆盖与误报排除

- 完整读取的 renderer 小模块：`main.tsx`、`sharkbay-api.d.ts`、`workflow.ts`、`prompt-search.ts`、`mobile-layout.ts`、`clipboard.ts`、`project-start.tsx`、`terminal-create-menu.tsx`、`update-hint.tsx`、`code-editor.tsx`、`bridge/runtime-status.tsx`、`bridge/web-bridge.ts`、`hook-snapshots.ts`、`codex-input-state.ts`。`types.ts` 按跨端方法契约定点检查，不把类型文件搜索写成逐行全文审读。
- `color-schemes.ts` 是自动生成元数据；检查类型、导出与查找实现，对完整数组做 AST 结构验证，526 个 id 全部唯一，10520 个颜色字段均为六位 hex。没有将 526 条数据伪称为手工逐条审读，也没有为静态元数据新增状态机。
- 完整读取桌面流程：`electron/main.ts`、`ipc.ts`、`preload.mts`、`island-preload.mts`、`find-popover.ts`、`find-popover-preload.mts`，及 `src/main/browser-tabs.ts`、`src/find-popover/find-popover.html`。追踪 app→runtime、窗口与 BrowserView、find popover、Island、配置/主题与更新的调用关系。
- **排除误报**：BrowserManager 的 file: 支持是现有 artifact 展示路径，架构文档仅 http/https 的说法不能作为禁用 file: 的依据；其 BrowserView 无 Node、启用 sandbox、与主 preload 分离。私有地址证书放行也有明确范围函数，按产品安全策略另评估，不误写成无条件忽略所有证书。
- **跨客户端差异**：Electron 的菜单、分享、更新、Island 与原生浏览器属于已确认的桌面能力保留，WebBridge 缺少这些接口不自动是缺陷；共享项目、终端、review/artifact 业务应保持同一 runtime 契约，当前 static wrapper 的方法映射已交叉核对。
- **仍待动态验证**：find-in-page 异步结果跨 browser/request 的归属、控制权 list snapshot 与后续事件竞态、窗口大小/缩放/焦点、真实剪贴板、主题切换后的 editor 历史和移动键盘。没有启动 UI 或 runtime，也没有把这些未运行项目标成通过。
