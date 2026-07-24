# 审查范围与基线

> 审查日期：2026-07-23（Asia/Shanghai）  
> 阶段：审查准备 + 整体架构审查  
> 结论边界：本阶段完成架构映射，不等于完成任何模块的深度代码审查。

## 1. Git 基线

| 项目 | 记录 |
|---|---|
| Git 根目录 | `F:/官媒投稿` |
| 当前分支 | `master` |
| 当前 commit | `e8d817847bab3a9e6020006cab35340f645e527f` |
| commit 摘要 | `merge: complete runtime publication refactor` |
| 已修改/已暂存文件 | 无；`git status --porcelain=v2 --untracked-files=all` 无输出 |
| 未跟踪文件 | 无（不含 Git 忽略项） |
| 子模块 | 无 |
| Git 操作约束 | 未切换分支、未提交、未清理、未暂存，也未改变任何现有 Git 状态 |

基线命令：`git branch --show-current`、`git rev-parse HEAD`、`git status --porcelain=v2 --untracked-files=all`、`git submodule status`。置信度：高。

工作区包含大量被 `.gitignore` 排除的本地内容和产物，例如 `.worktrees/`、`backups/`、`node_modules/`、`dist/`、`release-alpha/`、本地内容库、应用配置、浏览器 profile 和日志。这些文件没有被视为“未跟踪文件”，也没有纳入当前提交快照审查。依据：根 `.gitignore:1-17` 与 `git status --short --ignored --untracked-files=all`。置信度：高。

## 2. 项目基本信息

AutoPublish（产品名配置为“鱼饼大王”）是 Windows Electron 桌面内容运营工具，覆盖客户资料、GEO/豆包调研、AI 文章生成、人工审核/回收、投稿队列、普通平台和付费媒体投稿、目标级发布记录。独立的 J4125 Node 服务负责账号、设备、会话和产品授权，不接管本地业务内容。依据：根 `CONTEXT.md`、`auto—publish/CONTEXT.md`、`auto—publish/package.json:2-5,42-43`、`auto—publish/auth-server/README.md:1-12`。置信度：高。

### 语言、框架和主要依赖

| 范围 | 技术/依赖 | 证据 |
|---|---|---|
| 桌面主进程与领域代码 | JavaScript/CommonJS、Node.js、Electron 43 | `auto—publish/package.json:27-40,43` |
| Renderer | TypeScript/TSX、React 19、Vite 6、Tailwind 4、Motion、Lucide | `auto—publish/media-workbench/package.json:14-30` |
| 浏览器自动化 | `@playwright/cli 0.1.14`、打包 Node runtime、Edge/Chromium 会话 | `auto—publish/package.json:28`；`docs/runtime-dependencies.md` |
| 文档解析/HTTP | Mammoth 1.12、FormData 4、内置 `fetch`/`https` | `auto—publish/package.json:29-31` |
| 河畔适配器 | Python、requests/BeautifulSoup 等 vendored pure-Python 依赖 | `auto—publish/resources/hepan/requirements.txt`；`electron-builder.alpha.yml` |
| 认证服务 | Node 22、内置 `http`/`crypto`/`node:sqlite`，无第三方 runtime 包 | `auto—publish/auth-server/package.json`；`auth-server/Dockerfile:1-20` |
| 持久化 | 桌面端 JSON/JSONL/Markdown/DOCX/文件事务；认证端 SQLite | `desktop/storage-paths.js:7-34`；`auth-server/migrations/002-multi-user.sql` |

未发现 Redis、消息队列、外部对象存储或桌面端常驻数据库。`legacy-migration.js` 仅为迁移兼容动态读取 SQLite。置信度：中高。

## 3. 构建、测试与静态检查命令

所有根命令都必须在 `F:/官媒投稿/auto—publish` 执行；仓库真正的 Git 根没有 `package.json`。

| 用途 | 命令 | 证据 |
|---|---|---|
| JS 测试 | `npm test` | `auto—publish/package.json:9` |
| 认证测试 | `npm run test:auth` | `auto—publish/package.json:10` |
| ESLint | `npm run lint` | `auto—publish/package.json:11` |
| Renderer 类型检查 | `npm run typecheck:renderer` | `auto—publish/package.json:12` |
| Bridge 严格类型检查 | `npm run typecheck:bridge` | `auto—publish/package.json:13` |
| 格式检查 | `npm run format:check` | `auto—publish/package.json:14` |
| 链接/路径安全专项 | `npm run test:links` | `auto—publish/package.json:15` |
| Renderer 构建 | `npm run build:renderer` | `auto—publish/package.json:16` |
| 聚合验证 | `npm run verify` | `auto—publish/package.json:17` |
| 清洁构建/运行时准备 | `npm run check:clean-build`; `npm run prepare:runtime-tools` | `auto—publish/package.json:18-19` |
| Alpha 包 | `npm run pack:alpha`; `npm run dist:alpha` | `auto—publish/package.json:22-25` |
| Production 包 | `npm run pack:production`; `npm run dist:production` | `auto—publish/package.json:20-21` |
| Auth migrate/backup/restore | `npm --prefix auth-server run migrate`; `backup`; `restore-check` | `auto—publish/auth-server/package.json:7-17` |

说明：Renderer 的 `lint` 实际为 `tsc --noEmit`；严格配置只覆盖 bridge/types/contracts，且 `noImplicitAny:false`。证据：`media-workbench/package.json:11-12`、`media-workbench/tsconfig.strict.json:8-12`。置信度：高。

本阶段仅定向执行了：

- `npm --prefix media-workbench run lint`：通过。
- `node --test tests/renderer-workbench-controller-seams.test.js`：失败，2/2 失败；证据与影响记录在 `02-architecture-review.md`。

没有执行全量测试、打包、依赖升级或格式化。

## 4. 纳入审查的范围

- 根 `CONTEXT.md`、`.gitignore`、`docs/adr/`。
- `auto—publish/package*.json`、ESLint/TypeScript/Vite/Electron Builder 配置。
- `auto—publish/desktop/`：Electron 主进程、IPC、服务、工作区、worker、安全边界。
- `auto—publish/media-workbench/src/` 与入口/构建配置：React renderer 与 bridge。
- `auto—publish/src/`：core、content、publication、platform adapters、app 入口。
- `auto—publish/auth-server/`：HTTP、领域、repository、迁移、CLI、备份恢复、容器部署、测试。
- `auto—publish/tests/` 与 `auth-server/tests/`：测试结构和架构约束。
- `auto—publish/scripts/`、`config/`、`resources/content-templates/`、`resources/hepan/requirements.txt`。
- `auto—publish/.github/workflows/ci.yml`、部署/运行/ADR/工作区与打包文档。

扫描规模：204 个自有源码文件、约 34,404 行；静态相对依赖图 441 条边。三路只读探索分别覆盖桌面/renderer、core/content/platform、auth/deploy/tests。

## 5. 排除项

| 排除路径/类型 | 理由 |
|---|---|
| `.git/` | Git 内部数据，不是产品代码 |
| `.worktrees/` | 其他工作树，不属于固定 commit 的当前工作区 |
| `backups/` | 本地备份，已被忽略；可能含历史/敏感数据 |
| `auto-publish-app-config-*`、`auto—publish-*-v2-*` | 本地应用配置、内容库和运行状态，已忽略，不属于提交快照 |
| `auto—publish/node_modules/`、`media-workbench/node_modules/` | 第三方安装依赖；依赖版本由清单/锁文件审查 |
| `auto—publish/resources/hepan/vendor-pure/` | vendored 第三方源码；仅审查打包边界和依赖清单，不做逐文件深审 |
| `auto—publish/build/`、`dist/`、`release*/` | 生成/打包产物 |
| `.playwright-cli/`、browser profiles、logs、tmp、work | 本地缓存、会话、日志或临时运行状态 |
| `tests/fixtures/` 的二进制内容 | 只审查用途与引用，不审查 DOCX 二进制内部实现 |
| `docs/superpowers/plans/` 的逐计划实现核对 | 作为历史设计背景抽样读取，不把计划目标当作当前事实 |

## 6. 审查约束

- 只允许创建/更新 `docs/review/`；未修改业务代码、配置、测试或依赖。
- 本阶段记录问题，不修复、不优化、不升级依赖、不生成最终优化方案。
- “架构映射完成”只表示已识别边界、入口、依赖、数据和风险；截至 2026-07-24，覆盖矩阵中的 31 个模块均已完成代码深审，但真实外部系统、安装包签名和灾备演练仍未覆盖。
- 重要结论必须有路径/符号/行号或配置依据；无法确认的事实标记为待验证、信息不足或基于推测。
- 静态依赖图能覆盖字面相对 `require/import`，不能完全覆盖动态装载或运行时页面行为。

## 7. 待确认信息

1. **待验证**：生产媒体 API 是否始终把默认 `http://8.138.187.158:8082` 覆盖为 HTTPS，是否另有专线/隧道。
2. **待验证**：J4125 实际 Cloudflare Tunnel ingress、TLS、DNS、防火墙、代理头与 `trustProxy` 配置。
3. **信息不足**：生产签名、发布审批、制品保管和 CD 流程；仓库中只有嵌套 CI 文件，没有可识别的根 workflow。
4. **待验证**：真实存在过 `001-auth.sql` 结构的 SQLite 数据库数量及升级历史。
5. **信息不足**：备份频率、异地/加密/保留策略、RPO/RTO 与真实恢复演练记录。
6. **待验证**：Windows ACL 是否保护浏览器状态、河畔 Cookie、本地 API Key 和内容库敏感材料。
7. **待验证**：通用 `publish-batch/jobs` 链路是否在生产中允许 media adapter；若允许，ledger 绕过会影响生产。
8. **待验证**：头条/列举真实页面选择器、账号策略和远端结果确认在当前生产页面是否稳定。
9. **信息不足**：预期客户数、文章量、媒体资源量、并发量、可接受延迟和容量目标。
10. **待验证**：动态 `require()` 与打包环境下的最终依赖图；静态图未发现直接文件级循环，但包级依赖方向存在往返。
