---
kind: sharkbay_task
taskId: A9S4R7-u3960864-m81ae10
taskTag: A9S4R7
mode: task
title: 再审 Orca 与 SharkBay 状态处理一致性
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
commits:
  - 21af7b735febd09630d11c1214f758260647a7e4
  - 2fc9c935892d04748c01579f819da701eb163150
createdAt: 2026-11-17T10:51:28Z
updatedAt: 2026-11-17T14:06:52Z
completedAt: 2026-11-17T14:06:52Z
---

## Summary
已完成 Orca 状态链路对照及六轮 Review 已确认问题的修复。最后一项延迟 OSC 边界重放 Major 已用 clear/RIS 四组失败回归复现并修复：边界只清理一次，新 Elicitation 在执行仲裁后继续等待；全量 638 tests、类型检查、构建和 diff 检查通过，本轮修复已提交为 2fc9c935892d04748c01579f819da701eb163150，未推送或独立复审。

## Files
- .sharkbay/tasks/A9S4R7-u3960864-m81ae10-audit-orca-status-consistency.md
- src/main/hooks/program-status.ts
- src/main/hooks/state-manager.ts
- src/main/hooks/codex-turn-reader.ts
- src/renderer/hook-snapshots.ts
- src/renderer/App.tsx
- tests/agent-status.test.ts
- tests/hook-snapshots.test.ts
- docs/agent-status.md
- src/main/hooks/connectors/claude-family.ts
- .sharkbay/reviews/A9S4R7-IZ3756.md（SharkBay reviewer 生成，只读评估）
- .sharkbay/reviews/A9S4R7-GOP3YK.md（SharkBay reviewer 生成，只读评估）
- tests/hooks-connectors.test.ts
- src/main/hooks/types.ts
- .sharkbay/reviews/A9S4R7-P44V72.md（SharkBay reviewer 生成，只读评估）
- .sharkbay/reviews/A9S4R7-JID758.md（SharkBay reviewer 生成，只读评估）
- .sharkbay/reviews/A9S4R7-B6ZQAU.md（SharkBay reviewer 生成，只读评估）

## Work
- 已读协议、AGENTS.md、只读团队镜像，参考 O7S4K2-u3960864-m81ae10、S6C9D4-u3960864-m81ae10 与 P5C8R1-u3960864-m81ae10。
- 计划：对照 hook/OSC 仲裁与传输 → 完成回合/子任务/等待生命周期 → 归属、时钟、未读及聚合 → 复现确定差异并最小修复 → 定向及整体验证。
- Orca 参考为本机 /Users/shark/Projects/orca 的 729ee62f379；不把可复现漏洞、产品范围差异和未知现象混为一谈，不自动引入云/SSH/tmux/账号体系。
- 已逐段确认：OSC 完成后 idle 的结果保持/启动空闲、9999 工作时钟、新工作 waiting 立即接管、子任务保持的跨源隔离、OSC 接管后的 turn/transcript 身份、主任务阻塞优先、混合异常回答逐项处理、同 authority revision 排序与 rollout 增量读取均有需回归的差异。先补失败测试，再最小修复。
- 首轮 13 个失败用例已复现并修复，定向 98 tests 通过。进一步检查会话边界：补充 OSC 133 / RIS 的 invocation 重置、OpenCode 跨标签广播保护、各 connector 新会话 idle 及 Claude compact SessionStart 不得结束当前回合。
- 第二轮 5 个边界失败用例及 OSC 9999 原生结果丢失已复现并修复；补齐 provider 已结束标记，避免旧 rollout/重复 Stop 在 OSC 新工作中再次结束旧回合。shell 控制符仅作用于本协议已报告的记录，不凭空产生完成证据。文档记录逐项 Orca 来源、兼容差异及现场验证范围。
- 收尾复核补充 async wait 聚合态仲裁失败回归：不得只对比 working 主任务而永远阻止新的 OSC working 恢复等待；改用组合执行态，同时保留旧 working 的等待保护。
- 已检查终端归属、屏幕/hook 合并、已读、项目聚合与 Island 消费状态的路径；维持项目红 > 黄 > 蓝 > 绿 > 灰及 Island 既有通知顺序。全部改动限定于 Files 清单，没有修改其他并行功能。
- 用户要求调用 SharkBay Review 检查任务完成情况；重新激活任务，启动异步只读审查，收到报告后核实并处理确认的问题。
- Review 已启动：review-d757569e-3b8f-4bac-8c3d-ee3eb6f2bae7（Codex），报告预留 .sharkbay/reviews/A9S4R7-IZ3756.md；当前 running，等待完成通知后核读报告。
- 已读完成报告：2 Major（OSC 结算后旧 hook 子清单反向重开、child outcome 污染 lead outcome）、1 Minor（满表根 clear 被丢弃）。接纳三项，补交错及主/子结果回归后修复，并重跑已有验证流程。
- 三项均已复现并修复：OSC 结算后退休旧 hook 子清单并阻止其事件发布，新 prompt/SessionStart 恢复跟踪；child outcome 保留主任务原值；clear 在新增记录容量检查之前执行。再次只读对照 Orca 子生命周期缓存主结果及 records.clear 规则，没有引入完整 facet 架构。
- 修复并全量验证后启动 SharkBay 复审 review-5f84e9e7-2277-49cb-89d5-616f52bd6e33，预留报告 .sharkbay/reviews/A9S4R7-GOP3YK.md，当前 running；报告返回后继续评估，不将本轮作者测试当成审查通过。
- 复审确认上轮三项修复，又提出无 turn_id 的重复 Stop 结束新 OSC 等待、主 Stop 错误结算 OSC 子保持，以及新增 Claude hook 卸载/status 范围遗漏。接纳三项，先补不依赖 turn_id 的生命周期交错、OSC 子结束/边界释放和安装卸载往返回归；合并来源持有规则，避免继续叠加单事件特例。
- 第二轮三项均已复现修复：将旧子清单隔离扩展为 programOwnsTurn，在 provider 已结束后的程序执行期忽略非新主 prompt/会话边界事件，保留 OSC 聚合态直到该来源自己更新；同时保留旧程序 working/waiting 不重开已结束回合的保护。Claude 事件范围供 install/uninstall/status 共享。
- 全量验证后再次调用 SharkBay Review：review-5333f227-63be-4ef2-9d83-d2e9f2940bb6，报告预留 .sharkbay/reviews/A9S4R7-P44V72.md，running。保持任务 active，等待独立报告后再判断完成。
- 第三轮确认上一轮修复有效，又发现回合外 Claude Elicitation 被来源保护误挡、Result 凭空恢复 working 并丢失结果。接纳两项；对照 Orca claude-events 的 stateBeforeWait，保留请求身份并以独立等待覆盖展示，不改写基础执行状态/结果/边界；结果只解除匹配请求，新 prompt/会话边界清理。
- 两项均已复现修复。Elicitation 按 child/server/id 维护独立请求集合，展示层覆盖 waiting，基础执行来源、状态、结果与时钟保持独立；程序仲裁仍使用基础事实，新请求可绕过旧 provider 事件隔离但不会解除隔离。匹配回答逐项解除，等待期间的新完成事实保留；清理新回合/会话/终端的等待计时器，过期仅改变等待展示。
- 全量检查后启动第四轮 SharkBay Review：review-2699e6db-b4d2-4940-bd01-30bd58c2e9d8，报告预留 .sharkbay/reviews/A9S4R7-JID758.md，running。等待独立确认，任务保持 active。
- 第四轮确认前轮修复有效，新增 OSC 会话边界未清理 Elicitation、OSC 临时 terminal 身份导致首个对话请求被拒两项 Major。接纳两项，补真实 reader→manager 的 clear/RIS、晚到回答/过期计时器及临时/已绑定身份成对回归，再修复清理和首次精确绑定。并行 I6P8Q3-u3960864-m81ae10 的 Island 提示词工作不在本轮改动范围。
- 第四轮两项均已复现修复：已接纳 OSC 边界清除等待及计时器，同为空闲的 hook/OSC 边界亦清理对话；记录区分 providerBound，仅首个精确匹配主请求可绑定 OSC terminal 占位身份，保留基础事实。读过并行 runtime 入口，Claude 请求仍保留终端/launch 校验；不修改该并行入口。
- 完整验证后启动第五轮 SharkBay Review：review-1f9557bd-0713-4658-9ee3-68f1a9dc724a，报告预留 .sharkbay/reviews/A9S4R7-B6ZQAU.md，running；任务继续 active，等待独立确认。
- 第五轮确认身份绑定修复，发现边界对话清理仅覆盖 idle，漏掉 hook done/failed/interrupted 的同态提前返回。接纳该 Major；移除按显示状态的例外，把交互生命周期清理放在基础执行仲裁之外，保留 hook 原结果，并补三类结果 × clear/RIS 六组完整回归。
- 第五轮问题已复现修复：有效边界先清理对话及计时器，再独立仲裁执行事实；若仲裁保留旧事实，则仅发布已解除等待的快照（revision 推进、原结果及时间不变），避免同态短路吞掉交互清理，也避免额外中间完成发布。删除 idle 专属例外；普通非边界完成不清理请求。
- 全量验证后启动第六轮 SharkBay Review：review-2ab6615d-5234-4095-a360-4349f4b47583，预留报告 .sharkbay/reviews/A9S4R7-EYZKJE.md，running；保持 active，等待独立确认。

- 用户要求修复第六轮 EYZKJE Major；继续原任务。优先 CodeGraph 确认 ingestProgramStatus 及 runtime 调用路径，核对团队镜像；保留 docs/index.md、docs/audit-plan.md 并行修改。计划补 clear/RIS 延迟交错失败回归，再分离一次性边界清理与可重试执行仲裁，完成全量检查。
- 前序工作已由整合提交任务 C7P9S2-u3960864-m81ae10 提交推送为 21af7b735febd09630d11c1214f758260647a7e4；该提交明确记录本次待修复问题。

- 第六轮新增 clear/RIS × 边界前有无旧请求四组 reader→manager 回归，全部复现失败；现将 ingest 的一次性对话清理与 private arbitrateProgramStatus 分离，fallback 仅重试执行仲裁，保留 sessionBoundary、静默期限与完成结果语义。新请求的等待时间保持，匹配回答后显露 OSC idle；旧请求回答不再改变 revision。已更新 docs/agent-status.md。

- 第六轮修复完成：仅修改 state-manager、agent-status 回归及状态文档；未操作 docs/index.md / docs/audit-plan.md 并行变更。没有创建新提交、发布或替换运行实例。

- 用户要求 commit；仅准备提交本轮 state-manager.ts、agent-status.test.ts、docs/agent-status.md 三文件，保留其余并行文档改动，沿用刚通过的全量验证。

- 已按用户要求提交 2fc9c935892d04748c01579f819da701eb163150，3 files / 37 insertions / 5 deletions；本轮未推送。

## Verification
- 待完成逐项对照与回归验证。
- 首轮 npx vitest run tests/agent-status.test.ts：修复前 13 failed / 21 passed，修复后 34 passed；前端和归属等六个文件定向 98 passed。首轮 npm run typecheck 通过。
- 第二轮边界回归修复前 5 failed，原生 9999 及组合等待仲裁各复现 1 failed；均修复。全量首轮 77 files / 563 tests、类型检查及 diff --check 通过；最后新增仲裁用例后定向 42 tests 通过，待最终重跑及构建。
- 最终 npm test：77 files / 564 tests 全通过；npm run typecheck、npm run build（含 RUNTIME_IMPORTS_OK）、git diff --check 均通过。Vite 保留既有大包体积提示。
- 对照基准 Orca 729ee62f379；未逐一启动每种 CLI 做现场验收，也未重启或加载当前运行实例。不宣称截图历史触发原因已被唯一证实。
- Review 修复新增 6 项回归（含主成功/失败/取消与子结果组合、OSC 完成→兄弟 Stop→重复主 Stop→旧子工具事件→新 prompt、新满表根 clear）；修复前 5 failed / 43 passed，修复后定向六文件 115 tests 全通过。待全量检查及复审。
- Review 修复后的 npm test：77 files / 570 tests 全通过；npm run typecheck、npm run build、git diff --check 通过。保留既有 Vite 大包提示，未加载运行实例或发布。
- 第二轮 Review 新增 6 项回归：无 turn_id 的 Stop/工具/等待交错三组、OSC 子结束与会话边界释放两组、Claude 专属 hook 往返一组；修复前全部 6 failed，修复后六文件定向 121 tests 全通过。配置测试仅操作临时目录，不修改用户配置。待最终全量验证及下一轮复审。
- 第二轮修复最终验证：npm test 77 files / 576 tests、npm run typecheck、npm run build（RUNTIME_IMPORTS_OK）及 git diff --check 均通过；仍未加载运行实例或发布。保留原 Vite 大包提示。
- 第三轮新增 12 项交互回归：idle/done/failed/interrupted/working/monitoring 恢复、不匹配归属/server/id、OSC 完成后请求及旧 Stop 隔离、多请求与中途主失败、新 prompt/会话清理、等待过期不销毁空闲事实；修复前 9 failed / 56 passed，修复后六文件定向 133 tests 全通过。恢复保留原证据时间、只推进 revision。
- 第三轮修复最终验证：npm test 77 files / 588 tests、npm run typecheck、npm run build（RUNTIME_IMPORTS_OK）及 git diff --check 全通过；仅既有 Vite 大包提示，未逐种 CLI 现场验收或发布。
- 第四轮新增 8 项回归：clear/RIS 清理及迟到 Result/无过期发布、hook 初始 idle 同态边界、临时身份首次绑定与匹配/不匹配回答/旧 provider 保护、agent/cwd/launch/已有身份冲突四组；修复前 4 failed / 69 passed，修复后六文件定向 145 tests 通过（含并行新增的 Codex input 用例），待最终全量检查。
- 第四轮修复最终验证：npm test 77 files / 600 tests、npm run typecheck、npm run build（RUNTIME_IMPORTS_OK）及 git diff --check 全通过，保留既有 Vite 大包提示；全量增加包含并行任务新增的 4 项 codex-input-state 用例，非本任务修改。
- 第五轮新增 hook done/failed/interrupted × clear/RIS 六项回归，修复前 6 failed / 73 passed，修复后六文件定向 151 tests 全通过；检查解除后迟到 Result 无效、旧计时器不发布，以及普通 OSC 完成不解除等待。待完整检查与复审。
- 第五轮修复最终验证：npm test 77 files / 606 tests、npm run typecheck、npm run build（RUNTIME_IMPORTS_OK）及 git diff --check 全通过，保留既有 Vite 大包提示；未加载运行实例或发布。

- 第六轮回归修复前 4 failed / 79 passed；修复后六文件定向 151 tests 全通过，git diff --check 通过。CodeGraph affected 未关联出测试，已按已知调用链显式覆盖状态、归属、通知合并、connector、快照和 Codex input 回归。待全量验证。

- 第六轮最终 npm test：82 files / 638 tests 全通过；npm run typecheck、npm run build（RUNTIME_IMPORTS_OK）、git diff --check 均通过，保留既有 Vite 大包提示。本轮未调用独立 Review 或逐个启动真实 CLI，未加载用户当前运行实例。

- 提交前 git diff --cached --check 通过，暂存范围仅本轮三文件；提交后 main ahead 1，工作区仅余并行 docs/index.md / docs/audit-plan.md 改动。

## Notes
- 保留工作区所有并行修改；不发布、安装、重启或操作用户正在运行的 agent。
- 团队上下文只读，不记录私人提示词、回答或令牌。
- 本任务未提交、推送、发布或安装；无新增 commit。打包输出仍留在忽略的构建目录，当前运行 App 尚未加载本次修复。

- 后续状态更新：前序实现已随 21af7b735febd09630d11c1214f758260647a7e4 推送；本次第六轮 Major 修复仍在工作区，未新增提交。以上较早“未提交”及“等待复审”记录为历史过程，本轮已完成作者验证，不宣称独立复审通过。

## Reviews
- 需修复：实现方向合理，但仍有 2 项主要状态一致性问题及 1 项次要边界问题。 — `.sharkbay/reviews/A9S4R7-IZ3756.md` (2026-11-17T11:27:07Z)
- 需修复：上一轮三项问题已修复，但仍有 2 项 Major 状态一致性问题及 1 项 Minor hook 卸载遗漏。 — `.sharkbay/reviews/A9S4R7-GOP3YK.md` (2026-11-17T11:35:39Z)
- 需修复：上一轮三项问题已修复，但 Claude 回合外 Elicitation 仍有 2 项 Major 状态一致性问题。 — `.sharkbay/reviews/A9S4R7-P44V72.md` (2026-11-17T11:42:36Z)
- 需修复：上一轮两项问题的修复有效，但 Elicitation 与 OSC 的边界清理及首次身份绑定仍有 2 项 Major 问题。 — `.sharkbay/reviews/A9S4R7-JID758.md` (2026-11-17T11:53:45Z)
- 需修复：首次身份绑定回归通过，但 OSC 边界清理仍遗漏 hook 完成/失败状态，存在 1 项 Major。 — `.sharkbay/reviews/A9S4R7-B6ZQAU.md` (2026-11-17T12:00:58Z)
- 需修复：上轮六组完成态边界修复有效，但延迟仲裁会重放旧边界并清除新对话，仍有 1 项 Major。 — `.sharkbay/reviews/A9S4R7-EYZKJE.md` (2026-11-17T12:08:05Z)
