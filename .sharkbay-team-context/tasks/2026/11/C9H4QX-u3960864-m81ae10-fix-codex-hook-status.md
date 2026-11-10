---
kind: sharkbay_task
taskId: C9H4QX-u3960864-m81ae10
taskTag: C9H4QX
mode: task
title: Diagnose and fix Codex hook status
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a18b67-b8c9-7431-a5e8-0e7336ccf752
branch: main
createdAt: 2026-11-10T05:37:03Z
updatedAt: 2026-11-10T14:01:26Z
completedAt: 2026-11-10T14:01:26Z
---

## Summary

修正 Codex hook 与 live terminal 的状态合并：用显式会话 ID 关联恢复标签，working hook 不再被输入提示符推断的 stopped 覆盖，并识别长输入及底部空行中的 Working/待回答页脚。待回答为 approval，stopped 聚焦后清除，汇总保持 approval > stopped > working；Island 仍在 stopped/approval 稳定 1000ms 后展开，提醒消失后收起并保留手动查看。

## Files

- src/main/hooks/connectors/claude-family.ts
- tests/hooks-connectors.test.ts
- src/renderer/App.tsx
- src/renderer/codex-input-state.ts
- tests/codex-input-state.test.ts
- tsconfig.node.json
- src/island/island.html
- tests/island-auto-expand.test.ts

## Work

- 已读取任务协议、根目录指令，并用 CodeGraph 定位 CodexConnector。
- 假设异常位于 Codex hook 配置、事件传递或状态映射；先核对本机版本及事件证据，再决定修复范围。
- 工作区已有其他未提交改动，保留其内容并避免修改无关文件。
- 计划：核对官方协议和本机配置 → 复现异常并补回归测试 → 最小修复并验证相关状态转换。
- 已读相关历史任务 C7X9Q2-u3960864-m81ae10（Codex TOML schema）和 H6N9K2-u3960864-m81ae10（恢复后的状态映射）。
- 本机 Codex 0.167.0 的 hooks 功能开启，已有七项有效事件的信任记录；项目日志确认 UserPromptSubmit、PreToolUse、PostToolUse、Stop 仍正常抵达，未见同 turn 的工具事件晚于 Stop。
- 官方新增独立 Interrupt 生命周期事件，现有 Codex connector 未订阅或归一化该事件；先用受控中断复现确认，再做针对性修复。
- 用户截图明确为 request_user_input_async 待回答提示；该工具的 PreToolUse/PostToolUse 立即成对返回，问题仍待回答，不能把 PostToolUse 当作用户已回答。
- 已在真实 SharkBay 中查看折叠和展开的提问界面，未回答或提交该问题。采用现有三态语义：待回答显示 stopped，权限审批保持 approval，回答后回到 hook 状态。
- 在 renderer 读取 xterm 当前 live screen 的提问页脚作为状态覆盖，不修改 Codex 信任配置，也不把历史提问文本当作未完成请求。
- 已实现折叠、展开、多问题和窄终端换行识别；提问状态覆盖用于项目状态、终端指示灯和 Island，已有 approval 保持更高优先级。
- 补上 Codex Interrupt 订阅及 turn_end 归一化，保持 Claude/Qwen 原行为；Node TypeScript 项目显式包含新增纯 renderer helper，供回归测试导入。
- 用户补充第二张截图：Codex live terminal 正在 Working，但其项目没有 working 指示。实际本机存在 PPID=1 的 Codex app-server daemon，原有 PID 祖先关联不再覆盖此运行方式，多标签时唯一项目/agent fallback 也不可用。
- 扩展同一个 live-screen 读取：按 Codex 终端本身的 working/idle/question 状态补足项目、标签和 Island 显示，不猜测跨标签 hook session 归属。
- 最终变更保留所有既有未提交改动；未提交代码、未改用户 Codex 配置、未替换或重启正在运行的 /Applications/SharkBay.app。
- 用户补充回归截图：Working 进度行在 `(… esc to interrupt)` 后附带 `· 1 background terminal`，上一版行尾匹配过严，导致回退到 stopped。重新打开本任务，先补该真实格式的失败测试，再允许进度行的附加计数。
- 真实窗口确认活动 Codex 标签为 working、同项目旧标签为 stopped，项目因既有优先级显示 stopped；读取相关团队任务 R7K4M9-u3960864-m81ae10 后，用户明确要求保留 approval > stopped > working，未修改汇总实现。
- 用户明确更正：Codex 待回答问题应显示 approval，覆盖此前本任务的 stopped 假设；提问展开/折叠都按同一规则处理。
- 已允许进度行包含 background terminal(s) 等附加计数，并保留原有项目优先级；当前项目显示 stopped 可来自另一个 stopped 标签，不能据此认定活动标签误判。
- 用户进一步明确：聚焦 stopped 标签表示已查看，应清除该提醒；本次重新打开原任务，覆盖 Codex live-screen 与 hook 两条来源，保持 approval/working 及汇总优先级不变。
- 参考团队任务 S6K9Q2-u3960864-m81ae10、Q7K4N8-u3960864-m81ae10、V8KR2T-u3960864-m81ae10；最新用户要求覆盖旧的 stopped 延迟清除约定，仍须避免后台或无焦点窗口误清除。
- 计划：补 stopped 焦点确认回归 → 最小接入焦点与状态派生 → 验证新活动恢复提醒、相关检查及实际渲染。
- 实现按终端保存 stopped 的已查看标记，聚焦标签、返回项目/窗口或直接操作终端时确认；统一作用于 hook、Codex live-screen 和 Review 状态，新的 working/approval 会重新允许后续 stopped 提醒，关闭标签会清理标记。
- 使用隔离 Electron/Vite 渲染真实 TerminalPane/xterm，模拟 preload 和受控窗口焦点；修复前确认点击 stopped 后标签、项目和 Island 均未清除，修复后 23 项状态流检查通过。未操作实际 agent 会话。
- 用户反馈 Island 在只剩 working/unknown 时仍自动展开，并提出可能存在瞬间 stopped；重新打开本任务，读取团队记录 E3K9W2-u3960864-m81ae10、I7P3W9-u3960864-m81ae10，定位到 working → 任意非 working 会立即触发展开，且提醒消失后面板仍可保持自动展开。
- 计划：对实际 Island 脚本补 transient stopped/unknown 回归 → 每会话 stopped/approval 稳定 500ms 才展开，恢复活动/关闭即取消，已自动展开且提醒全消失则收起 → 保留手动查看行为并做真实渲染验证。
- 已实现每会话独立的 500ms 稳定确认，unknown 不触发展开；working 历史跨 unknown 保留以避免漏掉真实后续停止。用户手动打开/悬停后视为主动查看；自动展开且提醒全清除时收起，同时取消旧的窗口缩小回调以免重新打开后被缩小。
- 已复现可产生用户截图的两条状态路径，但截图本身不足以确定该次实际是瞬间 stopped 还是 unknown；修复覆盖这两条路径。本次仅调整 Island 展开/收起，既有声音通知策略未改动。
- 用户将自动展开稳定确认时间明确调整为 1000ms；同步更新计时边界与 750ms 瞬停回归，再修改常量验证。
- 已将 AUTO_EXPAND_DELAY_MS 调整为 1000；其他交互等待时间保持各自原有含义。
- 用户在 1000ms 版本仍观察到 stopped 闪烁、Island 展开后马上收起；已核对 /Applications/SharkBay.app 的 asar 包含 1000ms 稳定确认与自动收起，继续追查状态源和跨 renderer 的实际事件顺序，不能仅以隔离计时测试宣称问题已解决。
- 本轮计划：核对运行版本与 hook/终端合并路径 → 复现源头的错误 stopped → 修复并验证完整 TerminalPane → Island 链路，维持用户既定三态、聚焦确认及 1000ms 规则。
- 运行 App 启动时间晚于 1000ms asar 更新，且 Island HTML 与当前源码一致；包内 renderer 仍有输入提示符推断 stopped 并覆盖 hook working 的路径，排除仅因旧版本未加载。
- 发现状态源问题：只检查末八行会漏掉长排队输入上方的 live Working，尾部空行会遮蔽 Working/提问页脚；恢复标签的显式 hookSessionId 未用于 hook 关联，而画面推断 stopped 可覆盖真正 working hook。新增源头回归，修复前 3 个画面解析断言失败。
- 近期相关 hook 日志工作阶段持续为 working；本次 UI 只读查看了终端，遇到用户正在输入后停止交互，未提交、修改或回答其他会话。
- 已把恢复标签的显式 hookSessionId 优先关联到当前 terminal id（覆盖过期 terminal id），并在合并时保留明确的 working hook；native Working 扫描整个 live screen，footer 识别先去除底部未使用空行，不读 scrollback。
- 使用双 Electron renderer（真实 TerminalPane/xterm → IPC → 真实 Island HTML）验证源头及联动，修复前在多标签恢复场景复现 working hook 下被误判 stopped；修复后保持输入提示符 1.5 秒也不发布 stopped 或展开 Island。1000ms 展开确认值未进一步增加。

## Verification

- 尚未运行；待确认复现路径后执行针对性测试。
- CodeGraph impact CodexConnector：影响范围集中在当前 connector；已有状态管理逻辑将 turn_end 映射为 stopped。
- 本机 Codex 0.167.0 + 本地模拟模型受控中断：收到 Interrupt 和 cancelled PostModelRequest，未收到 Stop。
- 新增 Interrupt 安装、归一化及 working → stopped 回归测试，修复前 3 项均失败，确认缺陷。
- 相关 4 个测试文件：27 项通过；补齐窄终端换行后全量 npm test：64 个文件、380 项通过。
- npm run typecheck：通过。
- CodeGraph affected：定位到 hooks-connectors 和 codex-input-state 两组测试。
- 隔离 Safari renderer fixture 使用真实 TerminalPane/xterm 和模拟 preload：已观察 working → 折叠提问 stopped → 展开提问 stopped → 回答后 working，以及 approval 优先级。窄终端暴露的自动换行边界已通过 xterm isWrapped 合并修正并重验。
- npm run build：通过（补充项目 working fallback 前的实现）。
- 最终验证：npm test 64 个文件、384 项通过；npm run typecheck、npm run build、git diff --check 均通过。
- 多终端隔离渲染验证：三个 Codex 标签且无 hook 关联，非活动 Codex 2 的 live Working 使项目及 Island 显示 working，其他标签保持 unknown；提问折叠/展开及 idle 显示 stopped，继续工作恢复 working，approval 保持优先。
- 临时 Vite renderer 验证服务已停止；实际已安装 App 未更新，修复在加载本次构建的版本后生效。
- 带 background terminal(s) 及多项附加计数的三个回归样例修复前均失败；放宽后 17 项针对性测试、typecheck、build、diff check 通过。
- 按最终提问语义更新断言，修复前 stopped → approval 回归失败，修复后 codex-input-state、hooks-connectors、renderer-workflow 共 25 项通过。
- 最终 npm run typecheck、npm run build、git diff --check 通过。此次未替换或重启运行中的 App。
- stopped 聚焦回归：隔离真实组件的 23 项渲染断言通过，覆盖空闲重绘、重复切换、下一轮工作/提问重新提醒、窗口失焦/恢复、项目切换、隐藏 workspace、hook-only 与 Review 标签；焦点状态受控模拟。
- 本次 npm test -- tests/codex-input-state.test.ts tests/hooks-connectors.test.ts tests/renderer-workflow.test.ts：25 项通过；npm run typecheck、npm run build 通过。
- 已检查最终真实渲染截图，确认已查看标签为 unknown、其他 working 标签保留绿灯、项目汇总恢复 working；本任务涉及文件 git diff --check 通过。并行改动 src/styles/app.css 的 EOF 空行不属于本任务，未修改。
- 隔离 Electron 窗口已退出，临时 Vite 服务已停止；没有替换或重启已安装的 SharkBay App。
- 新增测试直接执行生产 Island HTML 内脚本，修复前 16 项中 10 项失败，确认 working → unknown、瞬间 stopped、残留展开和延迟缩窗问题。
- 修复后四组相关测试 41 项通过；npm run typecheck、npm run build 通过。类型检查发现并修正了新增测试 beforeEach 返回值类型。
- 最终新增 Island 测试 16 项通过，CodeGraph affected 定位到该测试文件；本次 Island HTML、测试文件与任务记录 git diff --check 通过。
- 隔离 Electron 直接加载真实 Island HTML 并使用原生计时器，6 项检查通过：100ms stopped 后转 unknown 且另一个会话 working 时不展开、确认前不展开、稳定 stopped/approval 正常展开、提醒清除后收起、悬停查看不被误收起；最终截图已检查。测试窗口已退出，未替换或重启已安装 App。
- 1000ms 版本：修改常量前 6 项边界/750ms 瞬停回归失败，修改后 16 项 Island 测试通过；npm run typecheck 与相关文件 git diff --check 通过。原生 Electron 6 项检查按新时长重验通过，覆盖 750ms 瞬停不展开、700ms 尚未展开及 1100ms 正常展开；测试窗口已退出。
- 本轮源头回归：修改前 3 项 live-screen 解析断言失败（长输入错判 stopped、底部空行漏 Working/approval）；新增合并断言验证 input prompt 不可覆盖工作 hook。
- 修复后 codex-input-state、island-auto-expand、hooks-connectors、renderer-workflow 共 50 项测试通过；npm run typecheck、npm run build、涉及文件 git diff --check 通过。CodeGraph affected 定位到 codex-input-state 测试。
- 双 renderer 联动 9 项检查通过：恢复多标签显式 hook 关联、1.5 秒不发布假 stopped/不展开、真实 Stop 达到终端与项目并在 1000ms 后展开、聚焦确认及收起、底部空行中的 pending input 为 approval 且可展开、无 hook 的长页脚标签及其他标签独立保持 working。
- 本轮测试 Electron 窗口已退出，临时 Vite 服务已停止；没有替换、重启或给运行中实际 agent 会话发送输入。本轮源码构建需由更新后的 App 加载才会生效。

## Notes

- 本任务未请求提交。
- .sharkbay/team-context/ 只读。
- Native terminal status 是现有 hook 状态的本地显示补充，不伪造 Codex session id 或持久化猜测关联；当前识别 Codex 0.167.0 的英文 live footer，后续上游更改提示时应同步 helper 和回归样例。
- 官方参考：https://learn.chatgpt.com/docs/hooks 。异步提问不代表回合结束，PostToolUse 不能当作用户已回答。
- 最终状态约定：待回答问题与权限请求为 approval，执行为 working，结束为 stopped；项目汇总保持 approval > stopped > working，各终端保留自身状态。
- stopped 表示尚未查看的停止提醒：用户聚焦该标签即清为 unknown；已聚焦期间新出现的停止仍提醒，窗口失焦或 workspace 隐藏时不自动确认；下次 working/approval 后再停止可重新提醒。
- Island 自动展开要求观察过该会话 working，随后 stopped 或 approval 连续保持 1000ms；unknown 只表示状态未知。此延时只用于展开确认，各标签状态和项目汇总仍按实际观测显示。
- Codex native input prompt 在执行中也可能显示，不能单凭它结束一个 hook 仍明确标为 working 的回合；恢复标签已有 hookSessionId 是精确身份，应优先于旧 terminal id 或单项目唯一标签猜测。此轮覆盖已复现的状态源缺陷，未捕获用户每次闪烁的原始终端字节流。
