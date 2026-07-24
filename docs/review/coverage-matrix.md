# 模块审查覆盖矩阵

> 统计口径：按可独立分配深度审查任务的逻辑模块划分，共 **31 个模块**。  
> 架构映射已完成；截至 2026-07-24，M01、M03–M27、M02、M28–M31 已完成深度审查，M02/M01 未发现独立 finding。映射或深审完成不代表真实外部系统、安装包或灾备演练已经验证。

| ID | 模块 | 路径 | 主要职责 | 入口 | 上游依赖 | 下游依赖 | 重要数据/资源 | 风险 | 架构映射 | 深度审查 | 建议维度 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M01 | Electron 壳与导航安全 | `auto—publish/desktop/main.js`; `security/` | 窗口、生命周期、导航/权限、启动/退出 | `app.whenReady` | OS/Electron | Auth、Workspace runtime、renderer | mainWindow、启动/退出状态 | 中 | 已完成 | 已完成 | Electron 安全、退出并发、异常恢复 | 基础加固较完整 |
| M02 | 桌面认证客户端与设备 | `desktop/services/auth-service.js`; `device-identity-store.js`; `ipc/auth-ipc.js` | 登录、refresh、改密、退出、设备身份 | Auth IPC | Renderer AuthGate | J4125、safeStorage、authenticated runtime | access/refresh token、device ID、entitlement | 高 | 已完成 | 已完成 | 安全、网络失败、token 轮换、时钟 | 通过；真实 safeStorage/ACL 待现场验证 |
| M03 | 工作区引导与存储分区 | `desktop/workspace-*`; `storage-paths.js`; `runtime-*` | 选择/验证/切换内容库，配置四类路径 | workspace IPC / bootstrap | Auth runtime、OS | 所有 stores、worker、diagnostics | marker、内容库、APPDATA/LOCALAPPDATA | 高 | 已完成 | 已完成 | 路径安全、ACL、切换并发、迁移 | `src` 有反向依赖 |
| M04 | 工作区组合根与 IPC 注册 | `desktop/workspace-runtime.js`; `desktop/ipc/register.js` | 组装服务、共享 ledger、认证守卫、dispose | `createWorkspaceRuntime` | Electron/Auth/Workspace | 全部 desktop services/IPCs | 服务实例、handler、revision | 高 | 已完成 | 已完成 | 生命周期、部分启动、销毁错误、依赖方向 | 旧 `services/workspace-runtime.js` 仅测试使用 |
| M05 | Preload 与 renderer bridge 契约 | `desktop/preload.js`; `media-workbench/src/bridge/`; `types.ts` | 能力白名单、DTO/错误适配 | `desktopConsole` | Renderer views | IPC registrars | 约百个命令、事件、DTO | 高 | 已完成 | 已完成 | IPC 输入、类型一致性、错误泄露、版本化 | `bridge/content.ts` 很宽 |
| M06 | Renderer gates 与应用壳 | `media-workbench/src/main.tsx`; `App.tsx`; `AuthGate`; `WorkspaceBootstrapGate` | 启动门、导航、顶层状态 | React root | BrowserWindow/bridges | 各 workbench | auth/workspace/UI 全局状态 | 高 | 已完成 | 已完成 | 状态所有权、请求竞态、资源加载、可访问性 | App 全量拉媒体资源 |
| M07 | Renderer 内容工作台 | `components/ContentWorkbench.tsx`; `components/content/`; `article-management-controller.js` | 问题、生成、历史、回收、投稿/异常操作 | ContentWorkbench | Content bridge/stores | Content/submission/publication IPC | article snapshot、refresh tokens、dialogs | 高 | 已完成 | 已完成 | 控制器 seam、并发刷新、确认、错误态 | 架构 seam 定向测试失败 |
| M08 | Renderer 平台工作台 | `components/PlatformWorkbench.tsx`; `controllers/platform-submission-controller.js`; `platform-task-store.tsx` | 队列、选择、提交、暂停/停止、残留处置 | PlatformWorkbench | Platform bridge | platform IPC/worker | selection、run snapshot、queue | 高 | 已完成 | 已完成 | 状态机、竞态、runId、终态刷新 | 旧 hook 未被生产使用 |
| M09 | Renderer 媒体/订单/资源 UI | `App.tsx`; `ArticleList`; `ArticleEditor`; `ResourceLibrary`; `OrdersView` | 媒体稿件、资源池、订单 | App routes | Media bridge | media IPC/services | resources、pool、drafts、orders、balance | 中高 | 已完成 | 已完成 | 分页、内存、请求取消、敏感显示 | `pageSize:99999` |
| M10 | Renderer 设置与确认 | `SettingsView`; `components/settings/`; `AiProviderSettings`; `ConfirmationHost` | AI/平台配置、诊断、存储维护、确认 | Settings route | Settings/workspace bridges | provider/diagnostic/storage IPC | 配置草稿、连接状态、确认上下文 | 中 | 已完成 | 已完成 | 秘密处理、输入校验、焦点/Escape、误操作 | Hepan/Media 外部边界 |
| M11 | 核心文件、文章解析与日志 | `src/core/files.js`; `articles.js`; `article-text.js`; `docx-text-extractor.js`; `logger.js` | 路径、扫描、DOCX、归档/失败、日志 | Core services/jobs | Workspace paths | FS、Mammoth | 输入、published/failed、publish.log | 高 | 已完成 | 已完成 | 原子性、symlink、阻塞 I/O、敏感日志 | `files.js` 反向依赖 desktop |
| M12 | Playwright/runtime/operator 控制 | `src/core/playwright.js`; `operator-flow.js`; `stop-signal.js`; `desktop/services/runtime-diagnostics-service.js` | CLI/daemon、runtime 发现、停止信号、诊断 | adapters/worker/settings | Workspace/runtime config | Node/Playwright/Edge/FS | profiles、temp code、stop JSON | 高 | 已完成 | 已完成 | 命令构造、同步阻塞、子进程、清理 | core 反向依赖 desktop diagnostics |
| M13 | 平台装载与通用 jobs | `src/core/platforms.js`; `jobs.js`; `src/app/publish-batch.js` | 动态 adapter、快照、串行发布与归档 | worker `run-task` | Config/platform registry | ledger、adapters、FS | jobs、targets、remote outcomes | 高 | 已完成 | 已完成 | 动态依赖、media 绕过、uncertain、归档 | 跨存储一致性核心 |
| M14 | 客户资料/问题/研究/模板 | `src/content/client-*`; `question-store.js`; `research-store.js`; `template-*`; `resources/content-templates/` | 内容源和模板 catalog/store | AI content/Doubao/UI | Workspace FS | generation/prompt | 客户材料、问题、research、模板 | 中 | 已完成 | 已完成 | 路径/身份、缓存、版本、迁移 | 内置模板当前 2 个 |
| M15 | AI provider 与文章生成 | `desktop/services/ai-provider-*`; `src/content/ai-client.js`; `prompt-builder.js`; `article-generator.js` | 配置 AI、构造 prompt、调用兼容 API、生成快照 | AI IPC/generation service | Materials/research/templates | external AI、article store | API Key、prompt、来源快照、文章 | 高 | 已完成 | 已完成 | 数据外发、超时/重试、模型输出、秘密 | 只允许 HTTPS 或 loopback HTTP |
| M16 | 豆包采集 | `src/content/doubao-*`; `desktop/services/doubao-collection-service.js`; 对应 IPC | 问题采集、浏览器解析、队列暂停恢复 | Content UI/IPC | Questions/Playwright | Doubao webpage/research store | profile、queue、answers、citations | 高 | 已完成 | 已完成 | DOM 漂移、登录、停止、重试、隐私 | 队列串行、最多 500 |
| M17 | 生成批次 | `generation-batch-store.js`; `generation-batch-runner.js`; `desktop/services/content-generation-batch-service.js`; IPC | 批次持久化、并发执行、暂停/取消/重试 | Generation UI/IPC | AI provider/content sources | article store/handoff | batch JSON/journal、task state | 高 | 已完成 | 已完成 | 幂等、并发、恢复、配置指纹、停止 | 1–4 并发 |
| M18 | 文章库/审核/版本 | `article-store.js`; `article-review-service.js`; `article-version-service.js`; eligibility | 文章聚合、Markdown+JSON、审核/就绪、版本 | AI content/submission | Generation/content UI | trash/submission/publication | article ID、body、source snapshot | 高 | 已完成 | 已完成 | 双文件事务、身份、并发编辑、兼容 | 文件事务日志 |
| M19 | 回收站与删除事务 | `article-trash-service.js`; `article-removal-service.js`; `article-removal-transaction-store.js` | 预览、回收、恢复、永久删除、补偿 | Article management | Article/submission/publication | FS stores/attention | preview token、transaction cursor、trash | 高 | 已完成 | 已完成 | 破坏性安全、TOCTOU、补偿、并发 | 复杂跨存储事务 |
| M20 | 投稿导出与 batch/action | `submission-export-service.js`; `submission-batch-store.js`; `desktop/services/content-submission-service.js`; `services/submission/` | 预检、sidecar、批次查询/撤销/清理/重试 | Content IPC/handoff | Article/eligibility/ledger | platform queues/worker | Markdown、sidecar、batch、fingerprint | 高 | 已完成 | 已完成 | 幂等、TOCTOU、状态协调、路径 | 宽服务拆为 query/preparation/action |
| M21 | 生成→投稿交接 | `desktop/services/generation-submission-handoff-service.js`; IPC | 批次文章按目标交接队列 | Generation drawer | Generation/article/submission | submission service/ledger | batch revision、article/target identity | 高 | 已完成 | 已完成 | 幂等、快照一致性、部分失败 | 依赖 M17/M18/M20 |
| M22 | Publication 领域与账本 | `src/publication/` | 身份、目标、状态机、预留、attempt、持久化 | Submission/jobs/media | Article identity/FS | attention/history/adapters | record、attempt、lock、remote IDs | 高 | 已完成 | 已完成 | 状态机、锁恢复、原子性、reconcile | 崩溃可遗留永久锁 |
| M23 | Article attention/management/invalidation | `desktop/services/article-attention-*`; `article-management-snapshot.js`; `workspace-data-invalidation.js`; IPC | 派生需处理项、管理快照、原因→scope | Renderer/content mutations | Article/submission/publication | renderer stores | revision、workflow、resolution plan | 高 | 已完成 | 已完成 | 只读所有权、缓存失效、快照一致性 | renderer 消费分散 |
| M24 | 平台任务主进程与 worker | `desktop/services/desktop-task-service.js`; `platform-task-state-store.js`; `worker/run-task.js`; platform IPC/service | fork、heartbeat、watchdog、pause/stop、结果回传 | Renderer platform controller | Runtime config/platform adapters | jobs/ledger/archive | runId、snapshot、stop signal、child IPC | 高 | 已完成 | 已完成 | 进程协议、kill 时序、远端不确定、泄露 | 平台服务职责聚合 |
| M25 | 头条/列举与共享浏览器会话 | `src/platforms/toutiao/`; `lieju/`; `shared/browser-session-lifecycle.js` | 登录、表单、结果确认、会话状态 | Platform worker/jobs | Playwright/runtime | external sites/ledger | browser profile、DOM、remote result | 高 | 已完成 | 已完成 | DOM/账号、安全、uncertain、清理 | 缺直接 adapter 测试 |
| M26 | 河畔 Node/Python adapter | `src/platforms/hepan/`; `resources/hepan/requirements.txt`; `vendor-pure/`边界 | Cookie、payload、Python HTTP、图片上传 | Worker/settings | Platform config/FS | Hepan HTTP/Python | Cookie、temp payload/images、vendor deps | 高 | 已完成 | 已完成 | 凭据、ACL、输入清洗、子进程、供应链 | vendor 源码本阶段排除深审 |
| M27 | 付费媒体 adapter/stores/API | `src/platforms/media/`; `desktop/services/media-*`; media IPC | 资源/草稿/资源池、预检、投稿、订单 | Renderer media UI | Provider config/articles/ledger | external media API/FS | API Key、稿件、resource/order JSON | 高 | 已完成 | 已完成 | TLS、认证、分页、重复保护、费用 | 默认明文 HTTP |
| M28 | Auth HTTP/Domain/Token | `auth-server/src/server.js`; `auth-domain.js`; `token-service.js` | API、账号/授权/设备/会话、限速/审计 | HTTP server | Desktop auth client | repository/crypto | password/token hashes、families、entitlement | 高 | 已完成 | 已完成 | 认证安全、代理、限速、并发、时钟 | TEMP-M28-01：限速 Map 无界增长 |
| M29 | Auth repository/migration/admin/DR | `auth-server/src/repositories/`; `migrations/`; `scripts/`; `auth-administration.js` | SQLite、schema、CLI、backup/restore | Auth domain/SSH | Node sqlite/host FS | `/data/auth.db`、backup | DB、WAL、audit、backup | 高 | 已完成 | 已完成 | 迁移、恢复、权限、磁盘故障、CLI | TEMP-M29-01/02：备份目标与 restore-check 误判 |
| M30 | 构建、打包、部署与 CI | `package.json`; `scripts/`; `electron-builder.*`; `auth-server/Dockerfile`; compose; nested `.github/` | 构建、runtime 资产、安装包、容器、自动检查 | Developer/release operator | npm/Node/Docker/signing | artifacts、runtime tools、image | 高 | 已完成 | 已完成 | 供应链、可复现、签名、CI/CD、secret | TEMP-M30-01；ASAR 路径关联 TEMP-M26-02 |
| M31 | 测试体系与架构约束 | `auto—publish/tests/`; `auth-server/tests/`; `docs/test-suite-inventory.md` | 单元/集成/renderer/安全/打包契约 | npm test/verify | 全部生产模块 | Node test/fixtures | 174+8 test files、fixtures | 中高 | 已完成 | 已完成 | 覆盖映射、红测、flaky、运行矩阵 | TEMP-M31-01/02：`.mjs` 漏跑、seam 红测 |

## 状态汇总

| 状态 | 数量 |
|---|---:|
| 架构映射已完成 | 31 |
| 架构映射待完成 | 0 |
| 深度代码审查待审查 | 0 |
| 深度代码审查已完成 | 31 |

## 横向覆盖提醒

- 安全：M01–M05、M15–M16、M20–M30。
- 并发/幂等/恢复：M03–M04、M13、M17–M24、M28–M29。
- 性能/容量：M06–M09、M11–M13、M16–M18、M24、M27–M28。
- 数据所有权与迁移：M03、M14、M17–M23、M27、M29。
- 测试/可观测：全部模块，重点 M23–M31。
