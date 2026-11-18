# Telegram 状态和生命周期修复

对应审计 UI-02、UI-03、UI-04、UI-05、UI-07、UI-08。保留主审已经加入的 UI-01 runBackground 错误捕获及 finalizeChat try/finally、较新 turn 保护。未修改公共应用命令、App.tsx 或 Hooks manager，未启动桌面/完整 ApplicationRuntime、真实 API、Agent 或 103。

## 行为与最小实现

| 项目 | 修复后的契约 |
| --- | --- |
| UI-02 审批 | 每个请求使用随机 token，绑定当前 chat 对象的用户、chat id、PTY 所有权、turn id 和 Telegram message id；先失效请求，再发送输入，最后 await callback ack。旧、重复、畸形、跨用户/聊天/消息/turn 回调均不产生输入。通知发送在途被解绑时，迟到消息只作清理，不重新建立审批。 |
| UI-03 选择列表 | 用户维度保存当前列表 kind、rows、chat id 和 message id；按钮必须来自该消息。数字回复只解释为该用户/该聊天当前列表，显式回复某消息时也核对其 id。另一用户的刷新或 /resume 不能改变选择语义。停用与撤销清理上下文。 |
| UI-04 轮询 | start 使用共享 promise 防重复启动；generation 在 stop 时立即失效，等待 secret/getMe/commands 的旧启动不会再激活。poll 对 API 实例与 generation 固定，在每个 update 前检查有效性；stop abort 长轮询与错误退避。BotApi.getUpdates 支持 AbortSignal，转发到内部 fetch 并清理 abort listener；取消不重试。token 变更终止旧代、重置 bot offset 并在此前启用时恢复新代。 |
| UI-05 PTY | 明确采用 **Telegram 用户间独占接管**：同一 PTY 至多绑定一名 Telegram 用户；新用户接管时解绑并通知旧用户，保留 SharkBay 终端。输入、延迟 Enter、输出、状态路由使用同一归属；旧 chat 的迟到 detach 不能删除新映射。用户在另一 Telegram chat 发送普通输入也不能操作当前绑定。此规则只定义 Telegram 用户间控制，不改变桌面/浏览器既有控制协议。 |
| UI-07 内存 | 支持 transcript 的 Agent 不再保存原始 TUI 输出；其余只保留 **64 KiB UTF-8 尾缓冲**，截断不从多字节字符中间开始。结束或解绑释放缓冲；现有 progress/final 展示截断保留。 |
| UI-08 状态清理 | 移除没有生产输入源的 turnEnd、silence、settling 及其仅验证不可达分支的旧测试。只使用明确状态与 PTY 结束；未引入沉默即完成。增加 done/failed/interrupted 的显式结束回归。 |

附带保持 provider session 迟到绑定时 chat.turn 的 hookSessionId 同步，避免 /new 的 provisional terminal 身份阻止后续明确完成事件。turn id 使用随机 UUID，避免同一毫秒创建的新回合误复用审批身份。

`stopped`/`approval` 兼容标签仍保留；现有 turn/历史展示边界仍接受这些标签，没有为了删除类型而扩大迁移或改变接口。`countOnline` 等额外清理候选不在本批生产入口变更中。

## 验证

新增 `tests/telegram-state-boundaries.test.ts` 共16例，通过假 BotApi、假配置与假 terminal 验证有效审批三种输入与重复消费、跨身份/消息/turn拒绝、在途通知解绑、列表跨用户和旧消息、独占接管、singleflight启动、晚到 poll、启动验证中停用、token轮换、真实取消信号传递以及字节缓冲上限。

使用单 worker 运行：

```text
./node_modules/.bin/vitest run tests/telegram-state-boundaries.test.ts tests/telegram-background-errors.test.ts tests/telegram-turn.test.ts tests/telegram-api.test.ts tests/telegram-service.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

最终结果：**5文件、40测试全部通过**，约3.43秒（其中原API重试测试约3秒）。现有UI-01四例全部保留并通过。最初执行发现当前Vitest不支持新matcher和测试未等待getMe进入；分别改为现有matcher、明确排空microtask后重新运行通过，未修改产品行为迎合测试。

Node TypeScript配置 noEmit 检查通过，增量记录放在 `/tmp/sharkbay-telegram-fixes.tsbuildinfo`；`git diff --check` 通过。源码搜索无旧全局列表字段与 turnEnd/silence/settling。未执行全量测试或完整应用验收。
