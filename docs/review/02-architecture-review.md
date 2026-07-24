# 整体架构审查

> 本报告是当前提交快照的整体架构评价，不是逐模块深度代码审查，也不是最终优化方案。风险等级表示下一阶段审查优先级。

## 1. 总体评价

当前架构与“功能丰富的单用户 Windows 桌面工具 + 独立轻量认证服务”的规模基本匹配：Electron 权限边界、认证后组合根、本地内容库分区、目标级 publication ledger、平台 worker 和 auth domain/repository adapter 都有明确设计。与此同时，业务增长已经超过部分早期 seam 的承载能力：submission/publication/archive 横跨多个文件所有者，renderer 状态/控制器出现新旧并存，`src` 与 `desktop` 反向依赖，运维与 CI 约束没有可靠落地。结论置信度：高。

静态扫描 204 个源码文件、441 条相对依赖边，未发现直接文件级循环；但存在 4 条 `src → desktop` 反向边和大量 `desktop → src`，因此“无直接加载环”不等于“依赖方向清晰”。动态 require 仍待验证。

## 2. 架构优点

### A1. Electron 权限与认证边界清楚

- 证据：`auto—publish/desktop/main.js:45-62` 开启 context isolation/sandbox、禁用 Node integration、限制外链/导航/权限；`desktop/preload.js:11-202` 只暴露白名单 API；`desktop/ipc/register.js:3-40` 对业务 IPC 统一执行 `requireAuthenticated`。
- 判断：高权限能力集中在主进程，renderer 没有任意 Node/IPC 能力。
- 影响：降低 renderer 内容注入直接升级为本机代码/文件访问的风险。
- 置信度：高。

### A2. 工作区生命周期有明确组合根

- 证据：`desktop/workspace-runtime.js:47-92,102-141` 统一组装/销毁共享 publication ledger、内容、生成、投稿、平台、诊断服务；`ipc/register.js:30-34` 强制使用 runtime 拥有的 ledger。
- 判断：依赖实例和生命周期集中，避免多个 registrar 各自创建不一致 ledger。
- 影响：工作区切换、退出和认证失效有可追踪的资源所有者。
- 置信度：高。

### A3. 安装、本地状态和可迁移内容库分离

- 证据：`docs/adr/0003-separate-install-local-state-and-portable-content.md`；`desktop/storage-paths.js:4-34`；`electron-builder.alpha.yml` 明确排除私密运行数据。
- 判断：业务内容、机器缓存、应用级凭据和安装资产有不同所有权。
- 影响：降低升级覆盖数据、浏览器缓存进入漫游目录、私密内容进入安装包的风险。
- 置信度：高。

### A4. 发布结果按文章×目标建模，并明确 uncertain

- 证据：`docs/adr/0004-record-publication-per-target.md`；`src/publication/publication-targets.js:22-67`；`publication-state.js:1-18`；`publication-ledger.js:145-218`。
- 判断：文章状态与目标级远端事实分离；不确定结果默认阻止盲目重试。
- 影响：适应一文多平台/多媒体资源，减少重复发布或重复扣费。
- 置信度：高。

### A5. 关键文件操作包含原子写、恢复日志或补偿流程

- 证据：`article-store.js:217-280,285-399`；`publication-ledger-store.js:191-241`；`article-removal-service.js:290-443`。
- 判断：代码明确承认文件系统跨资源事务的失败模式，并在部分核心流程实现恢复。
- 影响：比单纯覆盖 JSON 文件更能承受崩溃与局部失败。
- 置信度：高。

### A6. Auth 服务领域边界和秘密最小化较好

- 证据：`auth-server/src/server.js:68-77,85-146` 做字段白名单与 HTTP adapter；`auth-domain.js:156-193` 集中规则；SQLite/in-memory repositories 可替换；密码使用 scrypt、token 只存哈希（`auth-domain.js:86-119,307-328`）。
- 判断：transport/domain/persistence 方向清晰，客户内容不会进入 auth 服务。
- 影响：认证规则可独立测试，数据库泄漏不直接暴露明文凭据。
- 置信度：高。

### A7. 测试覆盖架构 seam、安全和故障语义

- 证据：根 `tests/` 174 个测试文件、auth 8 个；`architecture-seams.test.js`、`electron-security.test.js`、publication/submission、workspace、packaging 系列。
- 判断：测试结构不只覆盖 happy path，也表达了一些边界规则。
- 影响：为下一阶段建立了良好回归基线；但当前已有 seam 漂移，见问题 R4。
- 置信度：高。

## 3. 架构问题与风险

### R1. 当前仓库的 GitHub Actions CI 实际不会被发现（严重）

- 风险：高。
- 证据：Git 根为 `F:/官媒投稿`，根目录没有 `.github/workflows/ci.yml` 和 `package.json`；唯一 workflow 是受跟踪的 `auto—publish/.github/workflows/ci.yml`。GitHub Actions 只识别仓库根的 `.github/workflows/`。即使手动解释该文件，其 `npm ci` 也没有设置 `working-directory: auto—publish`，会在无 `package.json` 的 Git 根执行。
- 判断：文件内容描述了 CI 意图，但在当前仓库布局下不能作为实际合并门禁。
- 影响：测试、lint、类型检查、audit 和打包契约可能完全不自动执行；当前红色架构测试也无法由此阻断合并。
- 置信度：高。

### R2. 付费媒体 API 默认用明文 HTTP 传输 API Key 与稿件（严重）

- 风险：高。
- 证据：`src/platforms/media/media-client.js:8` 默认 `http://8.138.187.158:8082`；`:85-103` 将 `api_key`、标题和正文放入 multipart；`:136-149` 直接 fetch；`:186-191` 允许 HTTP/HTTPS。
- 判断：默认外部信任边界没有传输加密。
- 影响：API Key、文章、资源/订单信息可能被窃听或篡改。
- 置信度：代码高；生产配置是否覆盖为 HTTPS待验证。

### R3. 通用 jobs 链路对 media 可能静默绕过 publication ledger

- 风险：高。
- 证据：`src/core/jobs.js:87-100` 只用 `platformId` 构造 target 并吞掉异常；media target 在 `publication-targets.js:3-8,42-43` 必须有 resource；`jobs.js:165-174` 仅在 publication 非空时预留，但 `:202` 仍调用 adapter；`publish-batch` 会装载/扫描配置平台。
- 判断：若 media 经通用批量入口运行，目标级去重、uncertain 阻断和审计不会生效。
- 影响：可能重复投稿/扣费，且账本与远端事实失联。
- 置信度：机制高；该入口是否在生产允许 media 待验证。

### R4. 生产 controller/runtime seam 与架构测试发生漂移

- 风险：高。
- 证据：`PlatformWorkbench.tsx:37,53-70` 使用 `createPlatformSubmissionController`，而 `hooks/use-platform-workbench-controller.ts:9` 无生产调用；`GeneratedArticlesView.tsx:14,35,58` 使用 `createArticleManagementController`，而 `hooks/use-article-management-snapshot.ts:6` 无生产调用；`tests/renderer-workbench-controller-seams.test.js:10-24` 仍要求两个 hook。定向运行结果：2 tests / 0 pass / 2 fail。生产使用 `desktop/workspace-runtime.js`（`main.js:6,130`），旧 `desktop/services/workspace-runtime.js` 只被测试引用。
- 判断：同一职责存在新旧 seam，测试约束已不再描述生产结构。
- 影响：维护者可能修改错误模块；架构测试不能可靠保护实际边界。
- 置信度：高。

### R5. `src` 内层反向依赖 Electron/desktop 层

- 风险：中高。
- 证据：`src/core/files.js:7`、`src/content/client-material-store.js:6`、`generation-batch-store.js:5` → `desktop/workspace-paths.js`；`src/core/playwright.js:6` → `desktop/services/runtime-diagnostics-service.js`；反向 `desktop → src` 广泛存在。
- 判断：core/content 不能作为独立内层使用，目录边界与依赖方向不一致。
- 影响：CLI/测试/未来服务复用、打包初始化和替身注入变复杂。
- 置信度：高；未发现直接 CommonJS 初始化环，动态路径待验证。

### R6. 发布事实分散在 ledger、batch、sidecar 与归档，协调器不统一

- 风险：高。
- 证据：`jobs.runJob()` 涉及 ledger、adapter、archive；`jobs.js:211-227` 在 `recordOutcome` 失败后仅记录 `job.ledgerError` 并可能继续归档；submission batch、`.submission.json` 和 ledger 分属不同 stores。删除链另有专用持久化补偿器（`article-removal-service.js:290-443`）。
- 判断：这是补偿式最终一致性架构，但不同入口的失败恢复强度不同。
- 影响：远端成功、本地账本、队列和归档可能互相矛盾；人工恢复需要理解多个事实源。
- 置信度：中高；桌面是否统一强制 reconcile 待验证。

### R7. Publication ledger 锁没有崩溃后租约/回收

- 风险：中高。
- 证据：`publication-ledger-store.js:431-439` 用 `flag:"wx"` 创建 `<record>.lock`，存在即报并发错误；`:469-482` 仅在正常 `finally` 删除，没有 PID/年龄/租约检查。
- 判断：进程崩溃或断电可留下永久锁。
- 影响：特定文章×目标后续无法更新，长期停在 queued/submitting/uncertain。
- 置信度：高。

### R8. Renderer 状态所有权和失效消费分散

- 风险：中高。
- 证据：主进程 reason→scope 集中在 `workspace-data-invalidation.js:3-38`；`workspace-data-store.tsx:7-15,51-73` 只管理 `platformQueue`；`App.tsx:273-277`、`ContentWorkbench.tsx:30-33,62-64`、`article-attention-store.tsx:82-83` 各自订阅/刷新；content/workspace bridges 还有重复订阅实现。
- 判断：失效协议有单一生产者，但没有单一 renderer 消费所有者。
- 影响：新增 mutation/scope 需要多点修改，容易遗漏、重复请求或跨页面不一致。
- 置信度：高。

### R9. 高复杂度聚合模块使边界继续变浅

- 风险：中高。
- 证据：`platform-workbench-service.js`、`content-generation-batch-service.js`、`bridge/content.ts`、`PlatformWorkbench.tsx`、`GeneratedArticlesView.tsx`、`auth-domain.js`、`article-store.js` 均为数百行聚合模块；其中平台服务同时承担文件、sidecar、ledger、batch、远端调用、归档与恢复。
- 判断：这些模块的接口宽、状态组合多，已出现 controller/test seam 漂移这一实际后果。
- 影响：局部改动的影响半径大，代码所有权和测试焦点难以保持稳定。
- 置信度：高。行数只用于定位，不单独作为质量结论。

### R10. Auth 恢复检查可对错误路径产生假阳性（严重）

- 风险：高。
- 证据：`auth-server/scripts/restore-check.js:4-9` 直接构造 `SqliteAuthRepository`；构造器会创建目录/库并自动迁移（`sqlite-auth-repository.js:13-16,65-85,104-119`）。`backup.js:9-13` 备份后验证的是源 repository，不是 destination。
- 判断：不存在或拼错的备份路径可能被初始化为空库后输出通过。
- 影响：灾备演练可能在没有可恢复备份时误报成功。
- 置信度：高。

### R11. Auth v1→v2 schema 路径可能提交版本后才发现结构不兼容

- 风险：高。
- 证据：`sqlite-auth-repository.js:65-98` 执行 migration、写 version=2 并 commit 后再验证；`migrations/002-multi-user.sql:1-81` 对既有表只 `CREATE TABLE IF NOT EXISTS`，不补 v1 缺列。
- 判断：若存在真实 v1 SQLite，可能被标记 v2 后启动失败。
- 影响：认证服务升级不可用且恢复复杂。
- 置信度：机制高；真实 v1 数据是否存在待验证。

### R12. Auth healthcheck 是同步全库完整性扫描，且单实例无 HA

- 风险：中高。
- 证据：`server.js:108-110` 每次 health 调 domain；`sqlite-auth-repository.js:88-98,226-228` 运行 `PRAGMA integrity_check`；Docker 每 30 秒调用（`Dockerfile:20`）；audit 只追加（`:213-223`）；compose 只有一个容器/本地 SQLite 卷（`docker-compose.yml:1-26`）。
- 判断：数据增长后 healthcheck 自身可能阻塞单 Node 事件循环；J4125/容器/卷是认证单点。
- 影响：所有客户端登录/刷新受同一故障影响；恢复期间业务 runtime 无法正常建立。
- 置信度：高。

### R13. Auth 代理来源识别与文档拓扑可能不一致

- 风险：中高。
- 证据：`server.js:80-82,102` 仅 `trustProxy===true` 时读 `cf-connecting-ip`；生产入口 `:149-154` 未传该选项；部署文档要求 Cloudflare Tunnel，compose 仅回环绑定。限速存在单进程 Map（`auth-domain.js:164-180,197-211`）。
- 判断：服务可能只看到代理地址；限速重启清零且不能多实例共享。
- 影响：审计失真，真实来源限速可能过宽或把所有用户聚合限速。
- 置信度：代码高，真实 Tunnel 配置中，待现场验证。

### R14. 随仓库提供的 auth 运维 wrapper 与文件集不一致

- 风险：高。
- 证据：`auth-server/README.md:36-48` 宣称 `./apctl` 可用；`auth-server/apctl:4-6` 引用不存在的 `docker-compose.stage.yml`，仓库只有 `docker-compose.yml`。
- 判断：文档化的紧急账号管理入口不能按当前文件集执行。
- 影响：撤销、续期、设备/会话处置可能在事故时失败。
- 置信度：高。

### R15. 媒体资源加载绕开分页

- 风险：中。
- 证据：`App.tsx:86-92,123-128` 请求 `pageSize:99999`；`media-resource-service.js:41-44,64-96,218-220` 无上限并最多拉 600 页。
- 判断：远端全量资源会一次性进入主进程、IPC structured clone 与 renderer state。
- 影响：数据增长时启动延迟、内存峰值和 UI 卡顿。
- 置信度：高；实际容量未知。

### R16. 日志、错误和运行观测跨 seam 不完整

- 风险：中。
- 证据：`src/core/logger.js:20-43` 同步追加文本日志；主进程发送 `publish-log`（`workspace-runtime.js:89`），preload/renderer 无对应消费；`ipc-response.js:5-16` 直接返回 message；worker 某些路径只回 message；auth server logger 默认 no-op。
- 判断：机器可判定错误码和 UI 日志在部分边界丢失，同时原始 message 可能暴露内部路径。
- 影响：故障定位、自动恢复和安全错误分级困难。
- 置信度：高。

### R17. 测试与生产/运行时矩阵不完整

- 风险：中高。
- 证据：默认 `npm test` 只匹配 `.test.js`，漏掉 `platform-submission-controller.test.mjs`；CI 意图用 Node 24，auth 镜像用 Node 22.16；未覆盖 Linux 容器、真实 TLS/Tunnel、迁移升级、backup destination、恢复/磁盘/WAL；头条/列举缺直接 adapter 测试。
- 判断：当前测试数量多，但关键运行拓扑和恢复路径仍有空洞。
- 影响：合并前无法证明生产 runtime、部署和灾备行为。
- 置信度：高。

## 4. 单点故障、扩展性与规模匹配

- Electron main 是配置、IPC、内容和媒体服务单点；普通平台投稿已隔离到 worker，媒体和部分内容长任务仍在主进程。对单用户桌面产品可接受，但主进程阻塞/崩溃影响全部 UI。置信度：高。
- 文件型存储与单机队列适合当前桌面/可迁移内容库定位；缺少容量目标，无法确认大量客户/文章/媒体资源下是否仍匹配。标记：信息不足。
- Auth 的单 Node + SQLite 适合早期小规模授权服务，但没有 HA、共享限速、集中可观测和已证明恢复；其可靠性已经低于“所有客户端登录入口”的重要性。置信度：高。

## 5. 测试结构与架构匹配度

优点：publication、submission、workspace、auth、Electron security、packaging 和 renderer 均有专项测试；还有显式 architecture seam tests。

问题：测试集中在根目录、生产 seam 已迁移但测试未同步；一个 `.mjs` 测试不进默认命令；strict TS 不覆盖复杂 TSX；外部平台和部署/灾备测试不足。总体评价：数量充分、关键语义较强，但架构映射和执行门禁需要校正。置信度：高。

## 6. 待验证问题

1. 生产 media base URL 与链路加密。
2. media 是否可进入通用 jobs；桌面层是否禁止或补上 resource target。
3. `job.ledgerError` 是否在上层被强制 reconcile，远端成功/本地失败的现场处置流程。
4. v1 auth SQLite 的真实存量与已执行升级历史。
5. Cloudflare Tunnel、真实客户端 IP、TLS、WAF/限速拓扑。
6. 备份文件、保留策略、恢复演练、RPO/RTO。
7. Windows ACL 与浏览器/Cookie/API Key/内容库备份权限。
8. 内容库容量与性能目标；媒体资源、客户、文章和发布 attempt 的真实规模。
9. 动态平台装载下是否存在运行时循环或双实例模块。
10. 头条/列举当前 DOM、账号与远端确认行为。
