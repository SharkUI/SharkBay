# Agent 状态与证据

状态模型参考 Orca 729ee62f379。此文覆盖旧 hook-based-agent-status 设计中的三态、静默即停止及查看即删除约定。

用户始终操作同一个 agent 终端：状态表达执行事实，未读表达是否查看。查看完成标签确认提醒，不删除完成事实；查看等待请求不会替用户回答或解除等待。

| 执行事实 | 显示 | 查看行为 |
| --- | --- | --- |
| working | Working | 保持 |
| waiting | Waiting for input | 保持至问题或审批解决 |
| blocked | Blocked | 保持至程序报告恢复 |
| done | Done / Failed / Interrupted | 确认独立的未读提醒 |
| 会话边界，尚无回合 | Idle | 无完成提醒 |
| 30 分钟没有新证据 | No recent update | 不推断完成 |
| 尚无证据 | Unknown | 不推断执行或完成 |

## 状态来源

- renderer 精确终端归属优先于恢复别名；恢复别名仅在同项目、同 agent、唯一标签且没有实时归属冲突时使用。重连快照保留记录自身的终端 ID；提示词显示优先使用终端自己的缓存，不跨标签读取 provider session 的最新文案。
- 子会话事件保留父终端的 provider 身份，子 Stop 不得替换父记录；不同 provider 只有 SessionStart/UserPromptSubmit 能建立新归属。旧 PID 解析完成后必须核对当前 revision，不能先向缓存终端发布结束状态。
- hook CLI 携带 SHARKBAY_TERMINAL_SESSION_ID 和启动标识，优先精确绑定；旧 CLI 保留已有 PID/显式恢复关联。不得用唯一项目标签猜测会话归属。
- Codex 共享 app-server daemon 的 hook 可继承首个客户端的终端环境；该环境不能覆盖已建立的其他 provider 身份。优先匹配同目录 Codex 终端通过输入栏提交、尚待确认且唯一的提示词，再使用已有 provider 绑定；未知 provider 的 SessionStart/提示词不得覆盖另一个已绑定会话。无法确认时忽略冲突 hook，继续使用该 PTY 自己的 OSC 状态；原生 CLI 输入未经过输入栏时，可能暂时缺少 provider 绑定。
- Codex 异步问题按 tool_use_id 与问题索引保持，PostToolUse 不代表已回答；回答 envelope 逐项解除，普通新消息或回合结束清理。
- Claude 的并行工具完成不能解除另一个 tool_use_id 的待回答问题；子 agent 单独跟踪，其结束不能结束父回合，父 Stop 也不代表子任务已结束。
- 子 hook 的失败/取消不写入主任务结果。程序接管已结束 provider 回合后，旧 hook 子任务清单失效，旧执行事件即使没有 turn_id 也不能重开或结束 OSC 工作。OSC 子任务保持整体 working 时，主 Stop 不解除保持；仅对应 OSC 子结束或会话边界解除。新主 prompt / SessionStart 恢复 provider 执行跟踪。
- Claude 专属 hook 的安装、卸载与安装状态检查使用同一事件范围，卸载保留用户自己配置的非 managed hook。
- Claude MCP Elicitation 保留独立事件身份，以子归属、server 和 elicitation_id 匹配请求/回答；允许在回合外或 OSC 持有期发起等待。等待只覆盖展示，不写入主状态/结果或改动其证据时间；全部匹配回答后显露原有（或等待期间更新的）执行事实。新主 prompt/会话边界清理请求；不匹配回答无效。等待单独过期，不销毁原完成结果。
- 有效 OSC 会话边界（包括 clear/RIS）独立清理 Elicitation 及专属计时器，即使执行仲裁保留同态的 hook done/failed/interrupted 事实，也不保留旧对话；结果和原证据时间继续保持。普通非边界 OSC 完成保留待回答对话。首次对话请求可绑定尚未绑定 provider、以物理终端 ID 占位的 OSC 记录，但要求终端、agent、cwd 和已有启动标识匹配；回答不能抢先绑定，已绑定身份不得被其他 provider 请求替换。
- Claude hook 提供后台任务清单或 session_crons 时，后台 agent 保持 working，只有后台命令/cron 则显示 monitoring，空清单解除保持。
- 主机读取 PTY 的 OSC 7501 / OSC 9999 结构化信号。waiting/blocked 与回合结果分别映射；子记录仍工作时保持整体 working。
- hook 优先于弱屏幕推断；OSC 与 hook 冲突通常须连续静默两分钟，旧 working/waiting 不能重开已结束回合。完成后开始的新工作进入 waiting 时立即让出，不延误用户回答。新 hook 取消等待中的 fallback。
- 对齐 Orca `server/program-status/hook-precedence.ts`：旧 OSC waiting 与 working 都不能重开 hook 已完成的回合；只有在完成之后开始的新工作才允许覆盖。`hooks.log` 的 status 记录发布后的状态、来源证据、回合与终端身份，诊断不记录提示词或回答。
- Codex 当前 turn_id 的 rollout 生命周期记录补足缺失的 Stop / Interrupt。增量读取，每次至多 256 KiB，积压过大时读取近期尾部并丢弃首条不完整行；有界缓存已观察的回合结果，允许 prompt hook 晚到。不从任意历史消息推断当前回合状态。
- 证据保留来源、接收时间、单调 revision、状态开始和回合开始时间。证据过期不更新时间、不产生完成提醒。
- 结构化证据过期为 unverifiable 后，Codex 当前屏幕的工作或待回答指示可用于终端、项目及 Island 显示兜底；空闲提示符和旧完成文字不解除过期，也不覆盖有效 hook 的完成/失败/等待事实。

## 投影和通知

状态管理器逐条处理 hook 与 OSC，查询/重连快照始终返回最新事实。同一终端、同一执行状态的重复通知及其 status 诊断记录以 200ms 为窗口合并，首次立即发送，窗口结束发送最新快照；窗口不会因持续事件而延后。状态、终端/provider 归属、提示词、回合及来源证据切换立即发送，并取消更早的待发通知。revision 和 observedAt 仍取原始事件，不以发送时间刷新；原始 hook 诊断记录继续保留。关闭终端、替换 provider 或释放管理器会清除对应队列，防止旧进度覆盖完成结果或新会话。

终端、项目汇总、Island 使用同一显示状态。项目汇总严格按红 > 黄 > 蓝 > 绿 > 灰排序，同色内部保留既有顺序：failed > waiting > blocked > working > monitoring > done > interrupted > unverifiable > idle > unknown。已读只影响提醒，不改变聚合执行事实。Island 保留既有稳定等待时间，unknown/过期/idle/用户中断不自动展开。

状态存储仅是本地执行投影，不新增身份、权限或云端来源。Orca 的 SSH/tmux、多机 authority、远端恢复和完整后台任务明细视图不在本地迁移中引入；现有 provider 边界继续负责各自执行环境。

## 统一状态色

所有状态指示（终端标签、项目胶囊、Island 小块/圆点/文字/整体标记、Telegram 徽标）遵循同一分组：

- 蓝色 #3b82f6：working、monitoring。
- 绿色 #2f7d54：done。
- 黄色 #febc2e：waiting、blocked。
- 红色 #ff5f57：failed。
- 灰色 #888888：interrupted、idle、unverifiable、unknown。

主题、进程退出、已读确认不改变状态色。未读仅影响外圈、闪烁、光效与通知，确认完成提醒后保留绿色，确认失败提醒后保留红色。Island 整体颜色按红 > 黄 > 绿 > 蓝 > 灰汇总。

## 再审 Orca 对照记录

参考仍为本机 Orca `729ee62f379`，此次修复已有状态链路中的遗漏，没有扩展产品范围。

| 规则 | 此次对齐 | Orca 源码依据 |
| --- | --- | --- |
| OSC 7501 的 idle | 同一次 invocation 保留 done/error；Codex 启动工作后的 idle 是空闲，OpenCode 工作后的 idle 是完成；子任务不能保持会话边界 | `shared/program-status/agent-status-projector.ts` |
| 程序结束及重启 | OSC 133 A 释放 live 记录、保留结果；新 invocation 不继承旧结果；RIS 清除记录；无 program 记录的 shell 控制符不提供完成证据 | `shared/program-status/records.ts`、`agent-status-projector.ts` |
| hook / OSC 仲裁 | 9999 与 7501 都记录有序的 working 转换；新等待立即接管；两个来源的子任务清单不能互相重开/结束回合；OpenCode 跨标签 live 广播不得覆盖本标签 hook | `main/agent-hooks/server/program-status/hook-precedence.ts`、`facet-store.ts` |
| 原生 OSC 9999 | 保留有效 mainAgent 的结果、主任务状态及 monitoring；执行中的 interrupted/sessionBoundary 不得泄漏成结果 | `shared/agent-status/contracts/agent-status-types.ts` |
| provider 回合上下文 | OSC 接管保留 turn/transcript，迟到旧 Stop 不得结束当前回合；provider 已结束后不再用旧 rollout 结束新 OSC 工作 | `shared/agent-hook-listener/providers/codex/codex-state.ts`、`codex-transcript-poll.ts` |
| rollout 追读 | 近期尾部有界读取，保存按 turn ID 索引的结束事实，仍只结算精确当前回合 | `codex-rollout-jsonl-cursor.ts`、`codex-subagent-transcript.ts` |
| 等待与子任务 | 主任务自己的 waiting/blocked 优先于子任务等待；异步回答逐项容错，坏条目不阻止其他有效回答 | `shared/agent-status/lifecycle/agent-lead-status-fold.ts`、`codex-async-questions.ts` |
| 新会话 | 归一化 SessionStart 为 idle；Claude compact/子 SessionStart 不重置主任务，缺少 source 的旧 hook 保留兼容 | `claude-events.ts`、`claude-session-start-sources.ts` |
| 状态顺序 | 同一 authority 按 revision；跨 authority/旧记录按时间兜底；实时接收与快照投影共用比较规则 | `shared/agent-status/contracts/agent-status-observation.ts` |

上表缩写路径均相对 Orca `src/`。项目胶囊按用户要求使用红 > 黄 > 蓝 > 绿 > 灰；Island 整体颜色及小块顺序保留原有通知策略。精确终端归属、查看不解除等待、已读不删除完成事实、弱屏幕不覆盖 hook、过期不伪造完成已在现有回归中继续验证。

此次不代表完整移植 Orca 的全部 provider、远端恢复、后台任务明细与 UI，也未对每个 CLI 的真实进程逐一现场验收。当前运行实例须加载新构建后才能验证实际显示。
