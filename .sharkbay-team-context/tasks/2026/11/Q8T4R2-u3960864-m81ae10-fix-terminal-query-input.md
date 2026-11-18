---
kind: sharkbay_task
taskId: Q8T4R2-u3960864-m81ae10
taskTag: Q8T4R2
mode: task
title: 修复WebUI终端查询响应干扰gh交互
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1ecb0-b9ac-7ca3-824a-25c5929e457f
branch: main
createdAt: 2026-11-18T09:15:29Z
updatedAt: 2026-11-18T09:45:10Z
completedAt: 2026-11-18T09:45:10Z
commits:
  - 3575fd745659785eb1a4cdea4db1f8b38806766e
  - a48bbe90641fc732e45c2f347baf833fab13b4b8
---

## Summary
已修复Runtime与控制端重复回复终端查询的问题：控制端存在时由其回复，无控制端时headless兜底。受控握手后真实gh菜单修复前出现与用户相同的意外OSC错误，修复后上下键交互正常；662 tests、类型检查与构建通过，已提交为a48bbe9，未推送、发布或部署103。

## Files
- src/runtime/terminal-state.ts
- tests/terminal-state.test.ts
- docs/current-facts.md
- .sharkbay/validation/terminal-query/Q8T4R2/（隔离复现脚本及记录）

## Work
- CodeGraph定位TerminalState与createXTerm；检索只读团队记录，参考C8R4N7-u3960864-m81ae10的共享终端与快照语义。
- 当前host headless和renderer均把xterm onData发送PTY，疑似重复/异步查询响应；先验证真实xterm解析行为再修复。
- 计划：复现查询回复 → 明确单一回复来源并补回归 → 定向、类型检查与必要整体验证。不会登录GitHub或操作用户真实会话，不自动发布安装。

- 7组真实xterm CSI/DCS查询测试均复现host和controller重复答复；采用控制端优先、无控制端host兜底，保留前端实际主题颜色查询回复，不做输入字符串过滤。

- 仅调整host查询回复的所有权判断，保留renderer现有disableStdin观察规则、颜色查询和用户输入路径；current-facts记录单一回复方约束。
- 使用独立临时HOME/GH_CONFIG_DIR、真实Chromium xterm与gh进程，先进行颜色+光标查询握手，再启动gh菜单：旧host响应抢先导致迟到OSC进入菜单，复现用户同文错误；新行为通过上下键切换。未输入账号、令牌或完成授权。
- 直接启动本机gh而无前置查询时旧实现未复现错误；受控握手证明可达竞态，不宣称已唯一还原用户那次会话查询来源。

- 用户授权commit；准备仅提交terminal-state实现、测试及current-facts的Terminal control行，保留并行host-folder-picker功能与同文档Projects行，不推送或发布。

- 提交瞬间并行任务改写共享index，首次3575fd7夹带目录选择功能；已用独立临时index重建三文件提交并通过update-ref compare-and-swap替换为a48bbe9。未修改共享index或工作文件，其他功能仍保留原暂存内容；3575fd7仅为已取代的本地中间提交，不在main历史且从未推送。
- 最终提交a48bbe90641fc732e45c2f347baf833fab13b4b8仅含三个目标文件，current-facts仅Terminal control行；未推送。

## Verification
- 新增7组回归修复前7 failed/7 passed，均断言控制端存在时host多发一份回复。

- 定向terminal-state测试14 passed，覆盖7种查询、观察端不回复、控制转移、旧连接释放不影响当前owner及最终断开host兜底。
- npm test：91 files/662 tests全部通过；npm run typecheck、npm run build及git diff --check通过，仅既有Vite大包提示。
- gh-repro.mjs before预期failed=true/exited=true并出现unexpected escape [ESC,]；after failed=false/exited=false，断言菜单上下键选项切换成功。所有临时HOME/profile、Chrome和PTY进程清理。该验证未启动完整ApplicationRuntime，也不是103现场验收。

- 本轮提交前terminal-state 14 tests通过；最终git diff HEAD^ HEAD --check通过，提交文件集合严格匹配。无需重复先前已通过且实现未变化的全量检查。

## Notes
- 团队上下文只读。临时可在原生SSH终端运行gh auth login避免WebUI查询响应问题。

- 初轮实现验证没有commit；本轮提交及中间提交修正见Work与commits。未发布、安装或重启用户现有Runtime。103的0.3.11仍包含旧逻辑；修复在工作区就绪。
