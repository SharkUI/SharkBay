# 依赖与干净构建修复

对应 QB-01、QB-07、QB-08。范围是工作区依赖与构建规则；没有启动 Electron、SharkBay、完整 ApplicationRuntime 或自动更新，没有打包、发布、更新 103。

## 依赖处理

用户已明确授权向 npm 官方漏洞接口发送依赖名称和版本。原目标锁文件返回 33 个包级告警；升级并再次查询后为 **0 个告警**，见 [npm-audit-final.json](npm-audit-final.json)。这是本次查询数据库与锁文件的结果，不是无漏洞保证，也不将包级聚合数字等同于产品可利用漏洞数。

直接升级 Electron 29.4.6 → 45.3.3、electron-builder 26.8.1 → 26.18.0、electron-updater 6.8.9 → 6.8.11、Vite 5.4.21 → 8.3.8、Vitest 1.6.1 → 5.1.0，以及配套 React 插件、并发启动与等待工具。重新解析传递依赖使 updater 实际使用的 js-yaml 升至 4.3.2；保留 updater 已修复的 builder-util-runtime 路径。去除没有生产消费者的可选 bun-pty，实际 PTY 仍由 @lydell/node-pty 提供。

第一次升级后仍有 6 个 Moderate 聚合命中，实际共同来源为 minimatch 9/10。当前上游 Builder 仍声明这些旧主版本，npm 建议降级 Builder 不能作为本项目修复。添加仅匹配 `minimatch@>=7.0.0 <11.0.1` 的版本覆盖，解析到 11.0.9；老式函数导出的 3/5 主版本消费者保持原路径。用真实 Builder FileMatcher 验证本项目 include/exclude 规则，并验证 Universal 实际解析的 named minimatch 接口；未执行真正的 Universal 合包。

开发环境最低 Node 更新为 22.12，Node 类型与新版测试工具要求一致。安装均使用 `--ignore-scripts`，没有执行 Electron 下载/安装脚本或启动任何桌面进程。旧锁文件与已安装旧依赖图冲突时，在本轮临时目录根据包清单重新解析锁文件，再安装该锁定图；未使用 force、legacy-peer-deps 或 audit fix。

官方依据：[Electron 45.3.3](https://releases.electronjs.org/release/v45.3.3)、[Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes)、[Vitest 5 migration](https://vitest.dev/guide/migration/)、[Vite 8 migration](https://vite.dev/guide/migration)、[minimatch 修复范围](https://github.com/advisories/GHSA-g3hv-75wg-m249)。主窗口/辅助窗口已有明确非 sandbox ESM preload；内嵌网页保持 sandbox、禁用 Node 集成与 context isolation。当前没有使用被 Electron 45 删除的 sandbox preload Node shims。BrowserView 仍为弃用兼容 API，未将本轮迁移扩大成浏览器 UI 重写。

## 构建规则与兼容回归

新增 `build:desktop`：先删除固定的 dist-electron 输出，再运行 TypeScript。正式 build 接入该步骤，避免删除源模块后旧 JS 混入候选产物；临时双次构建回归证明删除模块后产物消失，仍存在的模块正常发射。Builder 同时排除新增的 Vitest 配置文件名。Vite 使用新版 rolldownOptions 和默认压缩器，没有残留依赖旧 esbuild 的显式设置。

真实 updater metadata parser 使用 fixture YAML 验证正常版本文件与畸形输入，不发出请求或安装更新。现有 updater 生命周期、浏览器纯逻辑和打包配置测试进入默认隔离回归。`npm ls --all --json` exit 0，依赖图见 [dependency-tree-final.json](dependency-tree-final.json)。

最终三个 TypeScript 检查与完整编译 build 通过，见 [typecheck-final.log](typecheck-final.log)、[build-final.log](build-final.log)。runtime import guard 通过；dist-electron 中没有已删除的 installed-plugins、plugin-manifest、token-usage-pricing 输出。Vite 仍提示单个约 1.7 MB 的 JS chunk 超过建议值，本轮没有把拆包机会伪装成构建失败或已解决性能问题。

Electron 主版本迁移仍需后续授权的桌面环境验收：窗口、BrowserView、权限、preload、签名、更新与实际安装包均未运行。新版 Electron 二进制安装脚本也未执行；当前结论是依赖声明、类型、模块回归与编译通过，不能声称已完成桌面发布验收。
