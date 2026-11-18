# 依赖运行期与构建期复核

审计对象：`2fc9c935892d04748c01579f819da701eb163150` 的锁文件；公告输入为本轮 `npm-audit.json` 的33个包级结果。只读复核锁文件、源码、现有依赖源码和上游公告，没有运行应用、下载、安装、升级或利用性压力测试。

## 结论

33个包级结果的锁文件命中节点中，只有 `js-yaml` 含非dev节点；但Electron虽标dev，仍作为桌面平台随产品运行，不能用 `dev:true` 将其排除。Electron支持与漏洞问题由主报告统一处理。本报告不把33个包级结果视为33个独立产品漏洞，也不继承npm给出的severity作为产品等级。

确认有产品运行期输入链的是 `electron-updater@6.8.9 → js-yaml@4.1.1`。更新器从配置的GitHub Releases获取YAML并在Electron主进程同步解析；上游公告涉及CPU复杂度问题。触发仍需恶意内容进入可信更新源或更新配置，未确认任意局域网用户或普通仓库文件可以直接触发这一解析入口。

根 `builder-util-runtime@9.5.1` 的重定向凭据公告属于构建/发布依赖链；产品updater使用嵌套 `9.7.0`，已经越过该公告修复边界。`tar@7.5.14` 和两个被扫描的 `minimatch` 节点均为dev树，不能据此认定产品Node runtime存在相同入口。

## 锁定版本与父链

路径均为目标锁文件中的包节点；dev=false表示没有dev标记，不代表该包在所有执行形态都会被调用。

| 节点 | 锁定版本与标记 | 可达父链与阶段 |
| --- | --- | --- |
| `node_modules/js-yaml` | 4.1.1；dev=false，optional=false | root dependencies → electron-updater6.8.9 → js-yaml；另外被builder-util/app-builder-lib/dmg-builder共享；桌面更新期及构建期 |
| `node_modules/builder-util-runtime` | 9.5.1；dev=true | root devDependencies → electron-builder26.8.1 → 该包；或经app-builder-lib/builder-util/electron-publish；构建与发布期 |
| `node_modules/electron-updater/node_modules/builder-util-runtime` | 9.7.0；dev=false | root dependencies → electron-updater6.8.9 → 精确依赖9.7.0；产品更新期，未被当前该公告命中 |
| `node_modules/tar` | 7.5.14；dev=true | root devDependencies → electron-builder26.8.1 → app-builder-lib26.8.1 → tar；另一链为app-builder-lib → @electron/rebuild → node-gyp → tar；构建、工具下载解压和原生重建期 |
| `node_modules/minimatch` | 10.2.5；dev=true | electron-builder → app-builder-lib → minimatch；构建文件匹配 |
| `node_modules/@electron/universal/node_modules/minimatch` | 9.0.9；dev=true | electron-builder → app-builder-lib → @electron/universal2.0.3 → minimatch；通用二进制构建匹配 |

原生与optional对照：`better-sqlite3@11.10.0` 为prod，安装时调用prebuild-install或node-gyp；`prebuild-install@7.1.3 → tar-fs@2.1.4 → tar-stream@2.2.0` 是不同包链，不是node-tar7.5.14。SQLite运行时由 `src/main/token-usage-db.ts:5-6` 加载better-sqlite3，进而加载bindings/native addon，不调用prebuild下载逻辑。

`@lydell/node-pty@1.2.0-beta.12` 为prod，其平台包如darwin-arm64为optional=true；`src/main/pty.ts:6-8` 实际加载该平台选择器。根optional `bun-pty@0.4.8` 未发现当前源码消费者；主Builder files显式排除它，但独立runtime的npm ci仅omit=dev，optional包可能仍被复制进runtime资源。存在于目录不等于实际执行，不能将其算作本轮已确认漏洞入口。本轮33项中没有命中这些optional平台节点。

## DR1 js-yaml的运行期可达性

### 代码链

1. `electron/main.ts:6-7,389` 引入electron-updater并创建AppUpdates；packaged应用启用。
2. `src/main/app-updates.ts:47-50` 启动检查，并每4小时检查。依赖的GitHub provider根据应用更新配置选择公开feed。
3. `node_modules/electron-updater/out/providers/GitHubProvider.js:117-146` 下载channel YAML（macOS通常为latest-mac.yml），传给parseUpdateInfo。
4. `node_modules/electron-updater/out/providers/Provider.js:9,91-100` 导入js-yaml并直接 `load(rawData)`，不指定限制别名/合并复杂度的额外选项。这是主进程中的同步解析。
5. 另一路为 `AppUpdater.js:486` 解析本地app-update.yml；该输入来自安装包，攻击者需能篡改本地配置或分发内容，不能与网络任意输入等同。

现有本地依赖版本已核对与上述锁定版本一致。快照node_modules为供审查的现有依赖链接，未将其视为固定提交自带的源码；报告结论由锁文件与相符实现共同支撑。

### 输入边界与影响

产品配置的公开GitHub Releases通过HTTPS获取。若攻击者能控制该release资源、更新配置或相应可信分发链，恶意YAML会在安装包下载和签名检查前被同步解析，可能阻塞桌面主进程。签名验证不能为之前的元数据解析提供保护；独立runtime的存续状态也不能证明桌面交互不受影响。

`electron-updater/node_modules/builder-util-runtime/out/httpExecutor.js:179-195` 的API响应先累积到字符串，再返回解析，未见正文大小上限；`:141` 的默认60秒请求timeout属于网络等待，不构成YAML CPU截止或总内存上限。即使增加下载大小限制，算法复杂度公告仍需由解析器版本和输入策略处理。

上游确认4.1.1处于受影响范围：

- [merge-key链CPU复杂度公告](https://github.com/nodeca/js-yaml/security/advisories/GHSA-52cp-r559-cp3m) 涵盖4.0.0至4.3.0之前的版本；问题需要特制合并链输入。
- [空合并源CPU预算绕过公告](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh) 将修复边界进一步列为4.3.2；只升到早期修复版本不能覆盖全部本次命中。

证据等级：受影响版本和产品解析入口静态确认；攻击者控制更新源的条件与真实产品阻塞程度没有动态演练。本轮未把上游高强度PoC用于日常Mac。建议主审单列运行期依赖整改项，严重程度结合分发源控制条件评估，不按audit high直接宣布任意远程DoS。

整改与验证建议：更新到覆盖本轮全部已核实公告的兼容版本、锁定并核实实际随包副本；为元数据下载和解析增加可验证边界。后续隔离测试覆盖普通YAML、别名/合并异常及元数据失败后的重试，确认签名和升级行为仍成立。此处仅出具建议，没有改动依赖。

## DR2 builder-util-runtime重定向公告的排除与保留

[上游公告](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-p2f4-r6v6-j797) 影响低于9.7.0，要求带PRIVATE-TOKEN或非小写Authorization等凭据的请求遇到跨源重定向。锁文件根9.5.1符合版本范围，但electron-updater package.json将9.7.0列为精确依赖，并有对应嵌套节点；从updater目录解析包名会选择嵌套副本。

因此排除“SharkBay产品updater因根9.5.1直接泄露token”的结论。当前公开GitHub更新源也没有配置私有GitLab凭据，不能套用公告的私有GitLab演示。

保留构建/发布环境风险：electron-publish和builder相关工具仍解析根9.5.1；若未来或实际发布配置传入相应凭据并访问可跨源跳转的端点，构建机可受影响。未读取真实token或执行发布来证明该条件，分类为已确认版本缺口、条件性工具链风险。

## DR3 tar与minimatch的实际阶段

### tar

`app-builder-lib/out/binDownload.js:19,144-148` 在下载工具归档后tar.extract；`out/targets/archive.js` 还使用tar生成归档。版本7.5.14落在本轮node-tar公告范围。上游的[无界解压/解析公告](https://github.com/isaacs/node-tar/security/advisories/GHSA-23hp-3jrh-7fpw) 针对CPU/磁盘消耗；实际攻击需恶意归档进入构建工具的输入，不能从npm critical推断日常浏览项目就会触发。

工具下载代码将checksums传给下载器，这是已有保护；攻击条件应考虑可信工具源、校验和来源、缓存及自定义镜像。不能把“有checksum”当作对源头或缓存篡改绝对安全，也不能忽略它直接宣称任意远程归档可输入。

独立runtime准备脚本 `scripts/prepare-runtime-bundle.mjs:21` 执行npm ci --omit=dev，因此锁文件中的这个dev tar节点不会按该prod图安装。better-sqlite3的postinstall若回退到npm自带或环境中的node-gyp，其工具依赖可能在项目锁之外；本轮没有扫描那个外部工具图，不能扩大为所有安装环境tar均安全。

### minimatch

当前命中的是10.2.5和@electron/universal内9.0.9两个dev副本。另有@electron/asar、dir-compare和glob内3.1.5、filelist内5.1.9，不在本轮该7.x以上范围中，不能把所有同名副本都计入。

[上游globparts公告](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249) 描述攻击者控制pattern且optimizationLevel>=2的放大。npm数据给出7.0.0至11.0.1之前的范围，上游描述页具体展示10.2.6，两者精度有差异，当前10.2.5/9.0.9是否含同一可利用路径需按实现和选项核实。

已读的app-builder-lib/fileMatcher.js:13只设置dot=true，minimatch实现默认optimizationLevel=1；universal已读匹配点设置matchBase=true，也未设置>=2。因此这几条当前构建调用没有满足公告的关键选项前提。记录依赖维护项，不给出已确认产品运行期DoS结论。项目配置glob来自本地构建配置，不是SharkBay网页端传入的任意模式。

## 范围说明

本报告检查了全部33个包级结果的节点dev/optional标记，并深查唯一non-dev公告节点、两个builder-util-runtime副本、tar/minimatch及原生optional父链。没有穷举Electron/Chromium内置组件CVE、所有第三方函数或目标安装包实际文件清单；开发标记与产品真实用途发生冲突时以执行/分发链补充判断。本次没有发现足够证据将这些公告关联为任何历史宕机根因。
