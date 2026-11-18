# 依赖批量查询与分诊

对象：`2fc9c935892d04748c01579f819da701eb163150` 的锁文件。用户已明确允许向 npm 官方接口发送依赖名称与版本。本轮未发送源码或凭据，未安装、更新或运行依赖脚本；缓存使用临时目录。

## 查询结果与计数口径

官方查询成功返回 33 个包级告警：Critical 4、High 23、Moderate 5、Low 1。npm exit 1 表示发现告警，并非请求失败。原始结果见 [npm-audit.json](npm-audit.json)，执行记录见 [npm-audit-query.json](npm-audit-query.json)，锁文件版本与依赖路径见 [dependency-triage.json](dependency-triage.json)。依赖元数据共有637条，prod/dev/optional/peer计数相互可能交叉，不应简单求和。

33 是 npm 聚合后受影响包的数量，含由子依赖传播的告警；不是33个独立CVE，更不是33个已经在产品中复现的漏洞。下表上游等级不等同于主审的P0/P1/P2/P3工程优先级。本轮将既有 QB-01 Electron 风险保留，将其他依赖维护问题合并记为 QB-08 P2，避免复制所有间接依赖为产品漏洞。

## 版本与暴露面

| 包 | 锁定版本 | npm等级 | 暴露面判断 |
| --- | --- | --- | --- |
| @babel/core | 7.29.0 | low | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| @electron/universal | 2.0.3 | moderate | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| @xmldom/xmldom | 0.8.13 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| app-builder-lib | 26.8.1 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| axios | 1.16.0 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| baseline-browser-mapping | 2.10.27 | moderate | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| brace-expansion | 1.1.14,2.1.0,5.0.5 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| browserslist | 4.28.2 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| builder-util | 26.8.1 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| builder-util-runtime | 9.5.1 | high | 根9.5.1在构建链；生产updater使用嵌套9.7.0，不能误报同一路径 |
| dmg-builder | 26.8.1 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| electron | 29.4.6 | high | 虽声明dev，实际随桌面分发；按QB-01优先迁移，单项公告仍需匹配功能前提 |
| electron-builder | 26.8.1 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| electron-builder-squirrel-windows | 26.8.1 | high | 锁文件的Windows构建相关节点；当前macOS产品路径未确认 |
| electron-publish | 26.8.1 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| esbuild | 0.21.5 | moderate | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| extract-zip | 2.0.1 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| follow-redirects | 1.16.0 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| form-data | 4.0.5 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| joi | 17.13.3 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| js-yaml | 4.1.1 | high | 生产更新器YAML解析；需控制feed/Release等输入来源，详见运行期复核 |
| minimatch | 10.2.5,9.0.9 | moderate | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| nanoid | 3.3.12 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| postcss | 8.5.14 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| shell-quote | 1.8.3 | critical | 开发/测试/构建链；Critical触发前提另见下节 |
| source-map-js | 1.2.1 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| tar | 7.5.14 | critical | 开发/测试/构建链；Critical触发前提另见下节 |
| tinypool | 0.8.4 | critical | 开发/测试/构建链；Critical触发前提另见下节 |
| tmp | 0.2.5 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| undici | 6.25.0 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| vite | 5.4.21 | high | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| vite-node | 1.6.1 | moderate | 锁文件标为dev/构建相关；暂无产品运行期可达证明，需按使用场景升级并回归 |
| vitest | 1.6.1 | critical | 开发/测试/构建链；Critical触发前提另见下节 |

## 四个 Critical 包的触发前提

- **Vitest 1.6.1**：新公告 [GHSA-5xrq-8626-4rwp](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp) 涉及运行UI/API服务器时的文件访问与执行。当前配置和本轮命令为node环境的 `vitest run`，没有启用UI/API；不能据此声称本轮测试已暴露远程执行入口。它不同于此前已在1.6.1修复的旧公告；旧公告排除不代表Vitest没有其他告警。维护者页面与npm聚合的修复范围有差异，但1.6.1都在受影响范围，迁移版本应在实施时重新核实。
- **Tinypool 0.8.4**：通过Vitest进入测试进程。[维护者公告](https://github.com/tinylibs/tinypool/security/advisories/GHSA-85c8-ppgw-ccpr) 描述选项对象的原型污染利用链，需要额外的污染来源或不可信选项进入路径。本轮没有确认SharkBay正式运行期存在该调用链，也没有执行攻击复现。
- **shell-quote 1.8.3**：由concurrently引入，用于开发启动脚本。公告 [GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p) 针对对象operator值中的换行转义；有该版本不自动证明当前固定dev命令接受这种不可信对象。属于开发工作站风险，需要更新并回归命令组合行为。
- **tar 7.5.14**：来自electron-builder/app-builder-lib等构建链。npm返回的 [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) 指向不受限解压/解析资源消耗，另有PAX等公告；恶意或异常归档必须实际进入对应解析路径才能触发。本轮未让产品处理归档，未将其视为正式应用远程攻击已成立。

## 处理与验收

运行期进一步复核见 [dependency-runtime-review.md](dependency-runtime-review.md)：更新元数据在Electron主进程同步解析，HTTP累积正文没有明确大小上限，网络timeout不限制解析CPU；风险仍以更新源或配置受控为前提。该专项同时核对了9.7.0嵌套副本、tar-fs与node-tar区别，以及minimatch当前已读调用不满足关键优化选项的条件，避免扩大告警含义。

npm与维护者页对部分条目的等级、修复边界存在差异，例如tinypool与shell-quote维护者页为High而npm聚合包为Critical。上述计数明确采用本轮npm返回值；实施升级时应重新核对具体公告与版本，不能混用两套等级宣称产品影响。

1. 运行期优先继续迁移受支持Electron，并升级或收敛更新器YAML解析输入；保持签名、更新校验和兼容验证。
2. 将Vitest、Vite、构建与安装依赖按工具链独立升级。修复建议中的跨主版本更新要验证配置、Node要求、native ABI和实际产物，不运行自动audit fix。
3. 对重定向凭据、Windows/AppImage专用告警按具体版本副本、平台和功能前提分诊；不把构建根依赖问题自动套到已修复的嵌套运行期副本。
4. 复核所有33条的版本、dev属性和父依赖路径；其余尚未证明产品可达的公告保留为依赖维护项。升级后重新查询并检查实际包内容，不能只让锁文件数字变绿。

本轮完成包级扫描和分层检查，没有完成全部上游公告的独立利用验证，也不提供依赖无漏洞保证。现有启动、远程部署和真实服务操作限制均未改变。
