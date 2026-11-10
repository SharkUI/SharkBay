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
updatedAt: 2026-11-10T06:24:09Z
completedAt: 2026-11-10T06:24:09Z
---

## Summary

已按 Codex live terminal 补足标签、项目与 Island 状态：待回答显示 approval，执行显示 working（包含后台终端计数），结束显示 stopped，并补齐 Interrupt hook。按用户最终要求保留项目汇总优先级 approval > stopped > working。

## Files

- src/main/hooks/connectors/claude-family.ts
- tests/hooks-connectors.test.ts
- src/renderer/App.tsx
- src/renderer/codex-input-state.ts
- tests/codex-input-state.test.ts
- tsconfig.node.json

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

## Notes

- 本任务未请求提交。
- .sharkbay/team-context/ 只读。
- Native terminal status 是现有 hook 状态的本地显示补充，不伪造 Codex session id 或持久化猜测关联；当前识别 Codex 0.167.0 的英文 live footer，后续上游更改提示时应同步 helper 和回归样例。
- 官方参考：https://learn.chatgpt.com/docs/hooks 。异步提问不代表回合结束，PostToolUse 不能当作用户已回答。
- 最终状态约定：待回答问题与权限请求为 approval，执行为 working，结束为 stopped；项目汇总保持 approval > stopped > working，各终端保留自身状态。
