# 测试质量与隔离修复

对应 QB-05、QB-06 与关联 TQ1-TQ4。保留真实集成验收的用途，默认集合只执行已审查的组件级工作。未启动桌面、完整 ApplicationRuntime、真实Agent/索引器或访问外部API，没有更新103。

## 修复内容

- `tests/helpers.ts` 为 makeTempRoot/makeTestRuntime 分配的根登记 afterEach 删除；Vitest stack hooks 保证测试文件自己的对象清理先执行。fixture-cleanup 用实际文件验证所有权、相邻未登记目录保护和钩子顺序。资源专项已有 force 删除可幂等共存。
- Prompt-store 各实例登记并先 flushSync 取消定时器，再删除目录；用 fake timers 验证500ms持久化和清理后不会重建目录，不再依赖600ms真实等待。
- Reasonix manager 日志改用每用例独占根，finally/afterEach释放；hook-sessions 在 afterAll 删除模块临时根并在 beforeEach重置 fakeHome；agent-clis临时根接入统一登记；artifact manager 使用afterEach兜底dispose，避免前面断言失败跳过资源释放。hook transport child有3秒硬超时、error/close清timer和finally kill兜底。
- 默认Vitest include支持 `.test.ts` 与 `.test.tsx`，单worker且文件不并行。排除完整web-runtime-integration、真实PTY terminal、harness和host PATH发现agent-clis。另设 `vitest.host.config.ts` 与 `vitest.integration.config.ts`，必须显式选择。默认允许受控组件child Node/local socket和临时Git fixture，不把它们写成纯函数测试。
- Harness三个会话ID匹配先断言正则匹配非空，再比较两个真实捕获，堵住 undefined==undefined 误通过；只运行了两项生成参数的低负载fixture验证，没有运行全部host用例。
- Terminal真实PTY测试的marker不再以明文出现在输入命令中，并断言命令本身不含marker，避免输入回显被当作执行成功。该host case只修改并类型检查，未启动登录shell/PTY运行它。
- TokenUsageDb补临时真实SQLite：迁移/重开、source offset唯一去重、file_index更新与恢复、后续binding异常导致批次事务整体回滚、按项目/日期的SQL聚合与provider公式一致。失败后仍可继续写入。

## QB-06 真实React行为验证

App原有CodeGraph状态读取、手动维护和状态卡片提取为 `src/renderer/codegraph-panel.tsx`，FilesDetailTab直接渲染；删除原ProjectDetailPane的状态与透传。沿用原文本、CSS类、安装提示、按钮与显式维护入口。只读getStatus仍在项目身份变化时调用；ensureStatus只有按钮操作调用，无自动索引或文件监听维护。

组件通过真实React18.3.1与react-test-renderer挂载，验证挂载/重复渲染/项目切换均只读、按钮维护、重复点击抑制、旧项目异步结果隔离、失败后重试，以及disabled/unsupported不展示维护按钮。renderer tsconfig包含该TSX测试；Node构建仍不把这个测试或renderer组件拉进桌面产物。

完成真正的mutation验证：临时在组件读取路径加入名为automaticRefresh的间接helper，内部调用ensureStatus；第一个“不自动索引”行为测试以exit1失败。`finally`恢复原组件，随后完整组件和关联测试通过。日志见 `codegraph-mutation.log`。没有保留只证明stub会被调用的第二个自证测试。该测试验证当前真实组件的交互边界，不冒充完整App/实际索引验收。

## 授权集成fixture的静态适配

`web-runtime-integration.test.ts` 的HTTP/WS客户端现在先用server.connectionUrl的一次性grant换取cookie；命令、预览与WebSocket携带cookie。真实WebBridge fixture通过fragment和受控cookie jar模拟浏览器授权，验证revoke进入unauthorized后用新grant恢复原PTY；没有保留原“无需grant/cookie”的契约。此完整runtime文件只修改和类型检查，保持opt-in且未运行。

## 验证结果

- Vitest5单worker：`codegraph-manual-index.test.tsx`、prompt-store、reasonix-hooks、hook-sessions、token-usage-db、fixture-cleanup、artifact-runs共 **7文件47例通过**，约0.42秒。
- Opt-in host配置只选择harness两项会话ID生成测试：**2通过、26跳过**；没有调用实际Agent或索引器，使用临时Git文件。
- Mutation预期exit1；原文件精确恢复后上述47例通过。
- Node与renderer noEmit类型检查，增量记录放/tmp；新Vitest函数类型泛型已适配。
- `docs/testing.md` 更新默认/host/integration边界、真实React/SQLite覆盖、清理职责与未执行项。

最初回归发现Vitest5不再提供describe.sequential，改用明确的concurrent:false后通过；新依赖由主审统一安装，没有在本分项安装或重建任何native模块。
