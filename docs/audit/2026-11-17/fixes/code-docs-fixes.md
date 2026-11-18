# 孤儿实现与文档一致性修复

对应QB02、QB03、QB04。实施对象为当前工作区，不改写固定提交2fc9c93的历史审计发现。

## QB02 未接通的installed-plugin实现

对生产源码、Electron入口、脚本、测试和非历史文档进行符号及文件名引用检查。scanInstalledPlugins/declarativeInstalledPlugin/installedPluginsDir仅在installed-plugins自身，parsePluginManifest/readPluginManifest仅被该孤儿模块及专属测试消费。没有发现生产注册入口或字符串加载入口。

移除 `src/plugins/installed-plugins.ts`、`src/plugins/plugin-manifest.ts` 和仅测试该解析器的 `tests/plugin-manifest.test.ts`。保留SharkBayPluginManifest、PluginHost、bundled plugin定义、安装配方和有消费者的共享类型。没有启用第三方代码加载、市场安装或新的权限模型。历史提案中的外部manifest示例保留，并明确为未实施目标。

## QB03 空定价模块

ModelPricing与DEFAULT_PRICING仅在 `src/main/token-usage-pricing.ts` 定义，全生产与测试搜索没有消费者，因此移除该文件。没有加入价格表或改变用量/credits/未知成本语义。

## QB04 当前事实与历史设计

新增 `docs/current-facts.md` 作为当前产品、进程、访问授权、控制归属、存储、插件和发布事实表。产品约束以AGENTS为准，事实表注明当前未发布修复与已发布版本的区别。

同步文档：

- product：GitHub原生协调工具定位、Electron/Web共享runtime、内置CodeMirror编辑保存、runtime-owned会话生命周期。
- architecture：链接事实表；更正文件编辑、浏览器授权、PATH发现、PTY实际实现及测试产物排除；注明bundled-only与project profile未有应用消费者。
- release：区分TypeScript编译include与Builder实际exclude，编译测试、maps、声明与构建元数据不直接进入desktop包。
- execution-target-profiles：标识为历史提案；替换旧utilityProcess/CoreClient后端、已接入SSH、磁盘manifest扫描和profiles:* UI消费等失实tracker，说明ordinary Node runtime及当前实现子集。
- workspace-model/workspace-agent-platform：入口明确为历史提案，不代表已实现能力或获批的新产品方向。
- index：加入唯一当前事实入口和历史提案分类；撤销“代码与测试无条件权威”，明确实现与产品约束冲突时需判定和纠正。
- README：删除loopback/LAN免授权说明，说明host-issued一次性grant、cookie与revoke语义。

事实表纳入同轮SD1新约束：所有业务HTTP API及WS均需要授权session，loopback/LAN无豁免，grant交换是授权入口，revoke使所有grant/session失效并关闭socket。纳入Telegram用户间独占PTY接管，明确不等同于改变桌面/浏览器控制协议。

## 验证与未完成检查

- 9份新增/更新文档本地Markdown文件目标和空白检查通过；未发现失效本地链接。外链和历史设计中的所有代码片段没有执行验证。
- 再次搜索已删模块的生产符号/文件名，src/tests/scripts/electron中无残余引用；4个目标文件均确认不存在。
- git diff --check通过。
- Node noEmit尝试被并行Vite迁移的配置/已安装类型不一致阻断：vite.config.ts:25 TS2769，rolldownOptions不在当时BuildOptions内。此项交主审依赖就绪后统一重验，不由本批修改配置。
- 准备运行plugin-host、core-agent-list、profile-plugin-state三文件时，依赖重装期间Vitest入口不存在，退出127。没有将未执行测试写成通过，也没有自行安装或启动其他环境。保留bundled行为的最终回归由主审依赖安装完成后执行。
- 没有启动SharkBay、完整ApplicationRuntime、打包、发布或部署；没有修改package.json/lock或历史审计结论。
