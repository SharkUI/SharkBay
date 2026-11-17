---
kind: sharkbay_task
taskId: P9W3L6-u3960864-m81ae10
taskTag: P9W3L6
mode: task
title: 排查并修复 WebUI 首次打开缓慢
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T05:20:41Z
updatedAt: 2026-11-17T05:27:26Z
completedAt: 2026-11-17T05:27:26Z
---

## Summary
定位首屏 2.66 MB 未压缩 JS 传输瓶颈，开启构建 minify、HTTP gzip 与内容哈希资源缓存。103 同网络隔离实例浏览器 load 从 11.30 s 降至 2.26 s，命中缓存为 147 ms；代码已验证，尚未提交或发布，正式 17777 仍运行 0.3.8。

## Files
- .sharkbay/tasks/P9W3L6-u3960864-m81ae10-webui-initial-load.md
- vite.config.ts
- src/server/http-server.ts
- tests/web-runtime-integration.test.ts

## Work
- 已通过 CodeGraph 定位 createWebServer、createWebBridge 和 App，检索团队上下文，参考 R8L5N3-u3960864-m81ae10 与 N4L7A2-u3960864-m81ae10。
- 应用 web-perf 技能：先测实际页面/资源/API 耗时和浏览器加载，再按证据做最小修改；不先改变远端配置或重启用户 Runtime。
- 实测 HTML 53 ms、capabilities 53 ms，2,662,589 B 主 JS 下载 11.62 s、137,973 B CSS 1.38 s；构建 minify=false，静态响应无传输压缩和缓存。按此证据开启构建压缩、文本 gzip 协商、带内容哈希资源长期缓存，HTML 每次重新获取。
- Chrome DevTools Network 复现旧版 JS 11.17 s、DOMContentLoaded 11.25 s、load 11.30 s；初始 API 请求为几十毫秒。构建主 JS gzip 520.67 KB；使用 103 独立临时目录、空配置和随机端口验证，不替换正式 App、不重启 17777。
- 新版 103 临时实例（独立空配置）冷加载主 JS 521 KB/2.08 s，DOMContentLoaded 2.20 s、load 2.26 s；恢复缓存后 JS/CSS 内存缓存 0 ms、DOMContentLoaded 88 ms、load 147 ms，页面显示已连接。临时进程和目录已清理，正式 Runtime PID 76466、17777 监听及 API 正常。

## Verification
- 当前部署 HTML、JS/CSS、API、WS 耗时已测量，结果见以下记录。
- 103 curl 实测已定位主 JS 传输延迟，浏览器未获得性能追踪接口；不宣称已测 FCP/LCP。
- npm run typecheck、12 项 Web Runtime 集成测试、npm run verify:webui（编译 CLI/WS/真实 PTY/退出清理）通过；npm test 全量 73 文件、500 tests 通过。
- 103 临时实例 curl gzip 主 JS 520,672 B/2.245 s（旧 2,662,589 B/11.618 s）、CSS 20,977 B/0.603 s；正式版 WS hello 73 ms、config.get 104 ms、projects.scan 155 ms 均成功。
- 新增集成测试验证 gzip 解压内容、q=0 拒绝压缩、HEAD 元数据与空响应、哈希资源长期缓存、HTML/API no-store；git diff --check 通过。

## Notes
- 团队上下文只读；当前部署 0.3.8，局域网免鉴权要求保持有效。
- 不记录 Cookie、令牌、用户会话内容或私人配置。
- 浏览器指标为 Chrome Network 的 DOMContentLoaded/load，未测 FCP/LCP；新版临时实例无项目，不能将其整体加载时间等同于正式项目全部数据加载完成。主 JS 传输前后对比为同机同网络，属于确定的主要瓶颈。
- 未提交、未发布；下一次正式打包发布并升级 103 后，17777 才会应用此修复。生产应用与用户配置未修改。
