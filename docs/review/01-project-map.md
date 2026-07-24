# 项目地图

> 状态：架构映射已完成；深度代码审查未开始。  
> 路径均相对仓库根；`auto—publish/` 是受 Git 跟踪的应用主体。

## 1. 总体结构

```text
F:/官媒投稿
├─ CONTEXT.md                       领域词汇
├─ docs/adr/                        根级架构决策
└─ auto—publish/
   ├─ desktop/                      Electron 主进程、IPC、应用服务、worker
   ├─ media-workbench/              React/Vite renderer
   ├─ src/
   │  ├─ app/                       队列快照入口
   │  ├─ core/                      文件、任务、平台装载、Playwright、日志
   │  ├─ content/                   内容、生成、采集、文章、投稿数据
   │  ├─ publication/               文章×目标发布账本与状态机
   │  └─ platforms/                 toutiao/lieju/hepan/media adapters
   ├─ auth-server/                  独立认证与授权服务
   ├─ resources/                    内置模板、河畔 Python 运行时依赖
   ├─ scripts/                      构建、验证、迁移和运维脚本
   ├─ tests/                        桌面/领域/renderer/打包测试
   ├─ docs/                         ADR、运行、部署与历史设计文档
   └─ .github/workflows/ci.yml      嵌套 CI 配置（当前 Git 根不会识别）
```

## 2. 应用、服务与模块职责

| 模块组 | 主要路径 | 职责 | 入口/组合点 | 证据与置信度 |
|---|---|---|---|---|
| Electron 壳与安全 | `desktop/main.js`、`security/navigation.js` | 窗口、导航/权限、认证与工作区生命周期 | `app.whenReady()` | `main.js:36-64,127-150,237-271`；高 |
| Preload/IPC | `desktop/preload.js`、`desktop/ipc/` | renderer 的能力白名单、认证守卫、命令协议 | `contextBridge.exposeInMainWorld`、`registerIpc` | `preload.js:11-202`；`ipc/register.js:3-69`；高 |
| 工作区/配置 | `desktop/workspace-*`、`runtime-*`、`storage-paths.js` | 选择/验证内容库；安装、漫游配置、本地状态、可迁移内容分区 | `createWorkspaceBootstrapService`、`configureRuntimeEnvironment` | `main.js:152-182`；`storage-paths.js:4-34`；高 |
| 工作区组合根 | `desktop/workspace-runtime.js` | 认证后组装共享 ledger、内容、生成、投稿、平台等服务并管理销毁 | `createWorkspaceRuntime.start/registerIpc/dispose` | `workspace-runtime.js:47-141`；高 |
| Renderer | `media-workbench/src/` | Auth/Workspace gates、内容/平台/媒体/设置 UI 与本地视图状态 | `main.tsx` → `AuthGate` → `WorkspaceBootstrapGate` → `App` | `main.tsx:7-10`；高 |
| Core runtime | `src/core/`、`src/app/publish-batch.js` | 队列扫描、任务执行、平台装载、文件归档、浏览器 CLI、停止信号、日志 | `createQueueSnapshot`、`runJobs` | `publish-batch.js:34-67`；`jobs.js:154-316`；高 |
| 内容领域 | `src/content/` | 客户/资料/问题/研究/模板/文章/生成批次/回收/投稿批次 | 各 `create*Store/Service/Runner` | `content-workspace-contract.md`；源码工厂；高 |
| 发布领域 | `src/publication/` | 文章身份、目标身份、状态机、去重预留、attempt 和文件锁 | `createPublicationLedger` | `publication-ledger.js:145-218`；`publication-state.js:1-18`；高 |
| 平台 adapters | `src/platforms/` | 普通平台浏览器投稿、河畔 Python HTTP、付费媒体 API | `loadPlatforms()` 动态装载 | `core/platforms.js:24-91`；高 |
| 认证服务 | `auth-server/src/` | HTTP 认证、账号/设备/授权/会话、SQLite persistence | `node src/server.js` | `auth-server/server.js:85-161`；高 |
| 构建/部署 | `package.json`、`electron-builder.*.yml`、`auth-server/Dockerfile`/compose | Windows 安装包、运行时封装、单容器 auth 部署 | npm scripts、Docker CMD | 对应配置；高 |

## 3. 程序入口

| 入口 | 路径 | 作用 |
|---|---|---|
| 桌面应用 | `auto—publish/desktop/main.js`；`package.json:43` | Electron 主进程 |
| Renderer | `auto—publish/media-workbench/src/main.tsx` | React DOM 入口 |
| Preload | `auto—publish/desktop/preload.js` | renderer 到 IPC 的唯一显式能力面 |
| 平台 worker | `auto—publish/desktop/worker/run-task.js` | 子进程执行队列扫描、停止和平台投稿 |
| 队列快照 | `auto—publish/src/app/publish-batch.js` | 装载平台并扫描本地投稿队列 |
| Auth HTTP | `auto—publish/auth-server/src/server.js` | `/healthz`、`/v1/auth/*` |
| Auth 管理 | `auth-server/scripts/authctl.js`、`apctl.js` | SSH/宿主机运维 |
| 迁移/恢复 | `scripts/migrate-*.js`、`auth-server/scripts/{migrate,backup,restore-check}.js` | 一次性迁移与灾备操作 |

## 4. 依赖方向

主路径如下：

```text
React View
  → renderer domain bridge
  → window.desktopConsole (preload whitelist)
  → authenticated IPC registrar
  → desktop application service
  → src/content or src/publication domain/store
  → platform adapter / filesystem / external API
```

认证路径独立：

```text
AuthGate → auth bridge/preload → auth IPC → desktop auth-service
→ HTTPS auth endpoint → server HTTP adapter → AuthDomain → repository → SQLite
```

已确认的依赖例外：

- `src/core/files.js:7`、`src/content/client-material-store.js:6`、`generation-batch-store.js:5` 直接依赖 `desktop/workspace-paths.js`。
- `src/core/playwright.js:6` 直接依赖 `desktop/services/runtime-diagnostics-service.js`。
- `desktop/` 又广泛依赖 `src/`，因此存在包级双向依赖方向，但对 204 个源码文件的静态相对导入图未发现直接文件级循环。动态装载仍待验证。置信度：前者高，循环缺失中。

## 5. 关键业务调用链

### 5.1 启动、认证与工作区

`media-workbench/src/main.tsx:7-10` → `AuthGate` → `bridge/auth.ts` → `desktop/preload.js:12-22` → `ipc/auth-ipc.js:30-79` → `auth-service.js` → J4125。认证成功后，`desktop/main.js:192-202` 启动 `desktop/workspace-runtime.js:47-92`，随后注册业务 IPC。

### 5.2 AI 生成

客户资料 + GEO 研究 + 模板 → `prompt-builder` → `ai-client.complete()` → `article-generator.generateArticle()` → `generation-batch-runner` → `article-store.saveArticle()`。

证据：`src/content/article-generator.js:170-245`、`generation-batch-runner.js:167-210`。生成文章保存 Markdown 与 JSON 来源/模板快照。置信度：高。

### 5.3 豆包采集

`doubao-collection-queue.processQueue` → `doubao-collection-service.collectOne` → `doubao-browser-adapter.collect` → Playwright 页面轮询/解析 → `research-store.saveResearch`。

证据：`doubao-collection-queue.js:235-285`、`doubao-collection-service.js:208-238`、`doubao-browser-adapter.js:337-421`。置信度：高。

### 5.4 投稿导出与普通平台发布

文章资格判断 → article/target identity → publication ledger 预留 → 原子写 Markdown + `.submission.json` → submission batch → `platform-ipc` → `desktop-task-service` fork worker → `jobs.runJob` → adapter → ledger outcome → 归档/回收。

证据：`submission-export-service.js:325-431`、`platform-ipc.js:217-240`、`desktop-task-service.js:65-126,153-261`、`jobs.js:154-267`。置信度：高。

### 5.5 付费媒体投稿

`App.tsx` → renderer media bridge → preload → `media-ipc.resolveSubmissions` → `media-workbench-service.submitTasksSerially` → `MediaClient` → order store + publication ledger。

证据：`desktop/ipc/media-ipc.js:111-186`；`desktop/services/media-workbench-service.js`。置信度：高。

### 5.6 删除/回收

影响预览与短期 token → 写删除事务意图 → 清理/取消投稿状态 → 文章移入回收站 → 提交或保留可恢复事务。

证据：`article-removal-service.js:177-217,290-443`。置信度：高。

## 6. 数据与状态流

| 所有者 | 资源/位置 | 状态特征 |
|---|---|---|
| 可迁移内容库 | `clients/`、`generated/`、`templates/`、`.autopublish/` | 客户、文章、模板、研究、批次、队列、发布账本；ADR 0003 |
| 应用漫游配置 | `%APPDATA%/AutoPublish` | 工作区位置、safeStorage 加密 AI/平台/refresh token |
| 本地运行状态 | `%LOCALAPPDATA%/AutoPublish` | logs、tmp、浏览器 profiles、diagnostics/cache |
| 文章库 | `generated/<client>/*.md + *.json` | 稳定文章身份、内容和来源快照；文件事务日志 |
| 发布账本 | `.autopublish/submission-records/publications` | 文章×目标聚合；attempt；`queued/submitting/submitted/published/uncertain/failed/cancelled` |
| 投稿队列 | `.autopublish/input/<platform>` + sidecar | 独立投稿副本，不等同于远端发布事实 |
| 生成批次 | `.autopublish/batches` | JSON、journal/backup；最多 4 个 runner worker |
| 豆包 | 问题 JSON、research JSON、浏览器 profile | 串行队列、暂停/恢复、登录会话 |
| 平台任务 | local-state `platform-task-snapshot.json` + child IPC | runId、heartbeat、pause/stop/watchdog |
| Auth | `/data/auth.db` | users、entitlements、devices、sessions、used refresh、audit |

主进程用 `workspace:data-invalidated` 的 `revision/scopes/reasonCode` 通知 renderer。映射在 `desktop/workspace-data-invalidation.js:3-62`；renderer 目前由多个 store/view 分散消费。置信度：高。

## 7. 外部系统与基础设施

| 外部系统 | 用途 | 证据/信任边界 |
|---|---|---|
| OpenAI-compatible API | 内容生成 | `src/content/ai-client.js:19-42,71`；API Key 经 safeStorage |
| 豆包网页 | GEO 问答采集 | Playwright 持久浏览器 profile；DOM/登录状态边界 |
| 头条、列举 | 浏览器表单投稿 | `src/platforms/toutiao`、`lieju`；远端页面和账号状态 |
| 蓝色河畔 | Cookie + Python HTTP 发布/图片上传 | `src/platforms/hepan`；Cookie/远端响应边界 |
| 付费媒体 API | 资源、稿件、订单 | `src/platforms/media/media-client.js`；默认 HTTP，待确认生产覆盖 |
| J4125 auth | 登录、设备、授权、refresh | `https://auth.jiayubing.xyz`；桌面主进程 ↔ 认证服务 |
| Cloudflare Tunnel | auth 外部接入 | 仅部署文档描述，真实配置未入库，待验证 |
| Windows/Electron | safeStorage、文件 ACL、安装包签名 | OS 是本地凭据与内容的信任根 |

没有发现缓存服务、消息队列或对象存储。桌面异步处理由内存队列、文件状态和 child process 完成。

## 8. 认证、授权与信任边界

- Renderer 为低信任区：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`，禁止任意导航/新窗口/权限。证据：`desktop/main.js:45-62`。
- Preload 只暴露显式 `desktopConsole` API，不暴露任意 IPC。证据：`desktop/preload.js:11-202`。
- 工作区与业务 IPC 统一调用 `requireAuthenticated()`。证据：`desktop/ipc/register.js:3-40`、`main.js:176-189`。
- Auth IPC 未守卫是登录入口；认证成功后才挂业务 runtime。证据：`main.js:192-227`。
- Admin CLI 不做应用层管理员会话验证，信任 SSH/宿主机/数据库权限。证据：`auth-administration.js:18-81`。
- 浏览器 profile、河畔 Cookie、AI/媒体 API Key、本地内容库和备份都是本机/文件系统信任边界。

## 9. 后台、定时与异步处理

- 普通平台投稿由 `desktop-task-service` fork `worker/run-task.js`；有 heartbeat、watchdog、pause/stop signal。
- 生成批次支持 1–4 并发 worker。证据：`generation-batch-runner.js:57-60,244-270`。
- 豆包采集最多 500 任务，串行并带任务间等待。证据：`doubao-collection-queue.js:1-4,235-285`。
- 通用发布 `runJobs` 串行；部分旧 Playwright 和等待路径使用同步子进程。
- 未发现应用级 cron/定时调度器。Docker 仅每 30 秒执行 auth healthcheck。证据：`auth-server/Dockerfile:20`。

## 10. 配置、日志、监控与错误

- 路径/环境由 `desktop/runtime-config.js` 和 `runtime-paths.js` 加载；AI/平台敏感配置用 Electron safeStorage。
- 核心日志为同步 `console.log` + `publish.log` append + 进程内订阅。证据：`src/core/logger.js:20-43`。
- IPC 使用 `{ok,data}` / `{ok:false,error}`；默认把 `error.message` 返回 renderer。证据：`desktop/services/ipc-response.js:1-24`。
- Auth 非领域异常 logger 默认 no-op；没有仓库内 metrics、trace、告警或集中日志配置。证据：`auth-server/src/server.js:101,138-141`。
- Renderer 没有消费主进程的 `publish-log` 事件；worker 某些错误只保留 message。架构影响见 `02-architecture-review.md`。

## 11. 测试分布

- 根 `auto—publish/tests/`：173 个 `.test.js` + 1 个 `.test.mjs`；按文件名粗分约 70 个领域、43 个 renderer、28 个平台/运行时、15 个架构/打包、7 个 auth-client、11 个其他。
- `auth-server/tests/`：8 文件/16 tests，覆盖 API、账户/设备、refresh family、SQLite、并发和 CLI。
- 架构约束集中在 `architecture-seams.test.js`、renderer seam、安全、打包、路径边界测试。
- 测试未按源码目录共置；默认 `npm test` 不包含唯一 `.test.mjs`。
- 一项 renderer 架构 seam 定向测试当前失败，表明测试映射已与生产 seam 漂移。

## 12. 部署与运行时拓扑

```text
Windows Desktop
├─ Electron main（配置、IPC、内容/媒体服务）
│  ├─ sandboxed React renderer
│  ├─ local file-backed content library
│  ├─ Playwright sessions
│  └─ forked platform worker
│     ├─ Playwright adapters
│     └─ Hepan Python runtime
└─ HTTPS external services（AI / Auth / Media / platform sites）

J4125 host
└─ Cloudflare Tunnel（文档描述，待验证）
   └─ 127.0.0.1:3180
      └─ single Node container
         └─ bind-mounted /data/auth.db (SQLite)
```

Electron alpha/production 由 `electron-builder` 生成 portable/NSIS；production 强制签名并启用 asar，打包排除私密运行数据。证据：`electron-builder.alpha.yml`、`electron-builder.production.yml`。Auth 由单 Docker 容器运行，非 root、只读 root fs、cap drop、资源限制。置信度：高。

## 13. 高复杂度/高风险区域

- `desktop/services/platform-workbench-service.js`：同时处理队列、sidecar、ledger、batch、远端结果、归档/恢复。
- `desktop/services/content-generation-batch-service.js`、`src/content/article-store.js`、`src/publication/publication-ledger-store.js`。
- `media-workbench/src/bridge/content.ts`、`PlatformWorkbench.tsx`、`GeneratedArticlesView.tsx`、`App.tsx`。
- `auth-server/src/auth-domain.js`、SQLite migration/backup/healthcheck。
- `src/core/jobs.js` + publication/submission/archive 跨文件一致性。
- `src/platforms/hepan` 的 Node/Python/Cookie 边界和 `src/platforms/media` 的网络边界。

这些仅是架构风险定位，不代表已完成其内部深度代码审查。
