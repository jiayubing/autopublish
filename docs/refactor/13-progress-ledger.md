# 重构工程进度账本

> 本文件由每个阶段执行任务更新。规划完成不代表阶段完成。状态只能使用`NOT_STARTED`、`READY`、`IN_PROGRESS`、`BLOCKED`、`PENDING_HUMAN`、`COMPLETE`。

## 1. 当前程序基线

| 项目           | 当前记录                                                  |
| -------------- | --------------------------------------------------------- |
| 原审查代码基线 | `master@e8d817847bab3a9e6020006cab35340f645e527f`         |
| 重构规划分支   | `codex/refactor-program`                                  |
| 重构规划commit | `dc5265359ca10a866ccd10e56a84314214b7897f`                |
| 活跃worktree   | `F:\官媒投稿-refactor`                                    |
| 规划日期       | 2026-07-24 Asia/Shanghai                                  |
| 目标形态       | 文件内容 + workspace SQLite运行状态 + Electron/React/Node |
| 当前可执行阶段 | 阶段6（`NOT_STARTED`；本任务未启动）                       |
| 普通功能开发   | 需新的 Phase 06 明确任务；正式release仍冻结                 |
| 正式release    | 冻结                                                      |

重构worktree已从独立规划commit创建；review、optimization、refactor、ADR和领域词汇已纳入该commit。原工作区`F:\官媒投稿`中用户维护的`auto—publish/docs/...`删除和未跟踪旧文档README没有进入重构分支，也不得由后续任务复制、恢复或清理。阶段0开始时必须重新核验当前HEAD和工作区状态。

## 2. 已冻结的架构决定

| 决定                                | 状态                           | 权威记录                                                                                      |
| ----------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| 用户创作内容保持文件化              | ACCEPTED                       | ADR-0003                                                                                      |
| 运行协调状态迁入workspace SQLite    | ACCEPTED                       | ADR-0003                                                                                      |
| 串行阶段、单writer切换、无长期双轨  | ACCEPTED                       | ADR-0004                                                                                      |
| 普通平台target包含AccountProfileId  | ACCEPTED                       | `01-target-architecture.md`、CONTEXT                                                          |
| Electron/React/Node/Playwright保留  | ACCEPTED                       | `00-program-charter.md`                                                                       |
| 诊断默认结构化、无原始整页截图      | ACCEPTED                       | 阶段4/7计划                                                                                   |
| 删除死publish-log，不新增原始日志UI | ACCEPTED                       | 阶段7计划                                                                                     |
| Media允许服务商HTTP例外             | ACCEPTED（2026-07-25用户决策） | endpoint必须显式配置；HTTP要求`allowInsecure`确认并持续警告；不得静默降级或扩展到其他provider |

## 3. 阶段状态

|                  阶段 | 状态          | 开始commit                                 | 完成commit                                 | 自动验证                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 人工验证                                                   | Handoff                              |
| --------------------: | ------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
|            0 工程基线 | COMPLETE      | `bee1b3f24039bb77be0d13d9a663b88e5657e61c` | `0bcbbfcca9ac4baf140359e048f3bf706f7b9526` | canonical本地门禁、静态workflow契约与link安全172/172均通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 无；remote/PR/push/required checks为`NOT_APPLICABLE`       | `docs/refactor/handoffs/phase-00.md` |
|            1 领域契约 | COMPLETE      | `926723f076cd1d8c88beb35695567bfb74df6639` | `027e9f88e00cb206669c2490cec9fcad7e6a47ad` | 178个默认测试文件、Phase 01 contract/architecture测试、严格类型检查、renderer/worker/package smoke均通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 无；不得在本任务执行                                       | `docs/refactor/handoffs/phase-01.md` |
|    2 OperationalStore | COMPLETE      | `7cab1c9aad167c7e2eca8f1dd2732124ba24a434` | `7d8f81452f98c8211308ada0ffba7873428a764b` | 182测试文件、默认977/977、Phase 02 15/15、auth 16/16、links 172/172、packaging 33/33、Electron SQLite probe及所有canonical门禁通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 仅合成workspace；未请求或访问真实库                        | `docs/refactor/handoffs/phase-02.md` |
| 3 PublicationWorkflow | COMPLETE      | `7d8f81452f98c8211308ada0ffba7873428a764b` | `7009a61b47ed3d5b6b6976e4f44fabab77ff1b93` | 唯一 PublicationWorkflow/OperationalStore write owner、AccountProfile fail-closed、worker outcome-only、attention composition ports、legacy JSON writer物理退出。合成 migration dry-run/execute/schema+FK+manual item/backup→restore/fault+rollback 10/10；phase3 attention/workflow/recovery定向通过；canonical `npm test` 170 files、893/893、0 fail/skip（约84s）；lint/typechecks/renderer build/format/auth 16/16/packaging 33/33、links 172/172（0 skip）及 `pack:smoke` 非签名目录制品构建均通过。production-only rg 对 legacy ledger/batch/order writer、旧 executor与worker state write均为0（仅 OperationalStore runtime.lock single-writer lock 保留）。 | 无真实外部平台调用；全部验证为临时合成 workspace/fixture。 | `docs/refactor/handoffs/phase-03.md` |
|   4 Platform/Adapters | PENDING_HUMAN | `8cbce7f1761c4e67baf4467d89f0a8397e93d9db` | —                                          | 1014/1014全量、现场多行正文/claim/账号核验回归、links 176/176、packaging 33/33、lint、format、三项typecheck及独立解包制品 verifier均通过；标准 pack smoke 因旧窗口占用 `EBUSY`，未覆盖原目录 | 四项受控人工验收；阻止正式release，不阻止Phase 05本地重构 | `docs/refactor/handoffs/phase-04.md` |
|     5 Content生命周期 | COMPLETE | `9ff69a073eb7869df930b688d15bfd2dabb79fc8` | `75dba966375302a99ebfd020c02ee6dd83930a9e` | 08d A-G 与追加 P1 全部 RED→GREEN；专项、176/176 扩展、1050/1050 全局门禁、打包 smoke 及最终独立复核均通过，无剩余 P0/P1 | Phase 04 人工项仍阻止正式 release，不影响本阶段本地完成 | `docs/refactor/handoffs/phase-05.md`   |
|        6 Renderer/IPC | NOT_STARTED | —                                          | —                                          | Phase 05 已完成；本任务未实施 Phase 06 | 可访问性手工smoke                                          | —                                    |
|      7 Auth/Build/Ops | NOT_STARTED   | —                                          | —                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | RPO/RTO、TLS、签名、release owner                          | —                                    |
|  8 Cleanup/Acceptance | NOT_STARTED   | —                                          | —                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 全部release门                                              | —                                    |

### 阶段4：平台运行期与 Publisher Adapters

- 状态：PENDING_HUMAN（自动门禁与最小解包目录制品 smoke 已通过；不得标记`COMPLETE`）
- 开始时间：2026-07-25 Asia/Shanghai
- 开始分支/commit：`codex/refactor-program` / `8cbce7f1761c4e67baf4467d89f0a8397e93d9db`
- 执行任务/线程：当前 Codex 任务
- 用户已有改动：开始时工作区干净；未恢复、覆盖、清理或访问真实内容库。
- 计划内文件范围：PlatformRun、worker protocol、adapter/runtime、安全诊断、platform tests、账本与交接。
- 已完成工作：PlatformRun 已成为 desktop task service 的唯一 child lifecycle owner；worker envelope 在主进程按 version/runId/闭集type/32 KiB/敏感字段拒绝；头条和列举无文章级证据一律`uncertain`；Hepan 异步 child、unpacked resolver、最小权限临时文件和启动残留精确回收已完成；媒体仅 main-process runtime config，HTTP仅显式endpoint+`allowInsecure`确认；诊断仅保存结构化摘要，无原始截图。首次人工 smoke 后补齐 AccountProfile 持久查询、authenticated IPC/preload/Renderer 选择与显式确认，并把账号映射绑定到普通文章入队和 generation handoff 预检令牌；媒体 resource target 已从普通账号队列排除。普通投稿页面现仅投影队列 sidecar 中已持久化的 AccountProfileId，并在提交时原样回传；主进程继续校验它与 durable target/profile 一致，旧无档案项继续 fail-closed。文章管理页的“加入付费媒体投稿”现由 production `previewExport`/`exportArticle` 原子写入媒体 staging 与 provenance sidecar，不选择资源、不投稿、不扣费。普通平台提交改为逐项临执行前 claim，首项账号失败不再占用后续项，过期 claim 可由 OperationalStore 原子恢复。头条/列举新增非阻塞“打开登录”和“检查登录”入口，成功检查后保存会话；Hepan 使用只读 `--check-login` 的受信账号节点提供真实身份，不显示浏览器登录入口。`pack:smoke` 已改为准备 Node runtime 并验证真实目录制品。
- 自动收口：PlatformRun 完整冻结运行上下文；头条/列举只接受文章级证据；Hepan AbortSignal 与 child close 生命周期、普通 unpacked resolver和默认异步 runner已覆盖；worker只传递安全 outcome；media standalone 网络路径已退出生产。Alpha/production共用显式最小解包边界，最终 resources verifier 分别检查 app.asar、app.asar.unpacked与resources/tools/node，并执行隔离 Playwright和Hepan安全 smoke。
- Interface/schema偏差：无；未修改 PublicationWorkflow public interface、OperationalStore schema 或 writer。
- 测试命令与结果：Phase 04定向27/27、`npm test` 933/933、`npm run test:auth` 16/16、`npm run test:links`、`npm run test:packaging`、`npm run lint`、`npm run format:check`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`、`npm run pack:smoke`、`git diff --check`均通过。`pack:smoke`重建非签名`win-unpacked`，验证app.asar、最小unpacked运行期和resources/tools/node，并运行最终制品的Playwright/Hepan安全 smoke；无真实外部调用。
- 故障/迁移/回滚证据：精确复现并回归锁定三个现场故障：production content service 缺少 `previewExport`/`exportArticle` 导致 `Submission operation is unavailable: previewExport`；批量预先 claim 与旧状态快照提前拒绝导致 `Queued publication is no longer executable`；头条/列举无公共登录 IPC/bridge/UI。修复未修改 OperationalStore schema 或 writer，过期租约使用现有原子 claim 规则恢复，不删除或伪造队列状态。Hepan账号身份来自只读检查返回的受信 `uid`/displayName，缺失或变化仍 fail-closed。临时Cookie/payload在正常、失败、stop/watchdog与下次启动均有有界清理和回收验证。
- 人工待办（四项）：(1) 头条/列举受控账号 remote ID 核验及首次显式 AccountProfile binding；(2) Hepan断连后的远端核对；(3) 媒体服务商HTTP风险确认与测试资源；(4) 签名正式制品中的真实浏览器登录。它们仍阻止正式release，但不阻止Phase 05本地重构。
- 2026-07-26 现场回归：蓝色河畔提交提示 `Bundled Playwright Node is unavailable`。根因为 `extraResources` 将 Node 放在 `resources/tools/node`，runtime diagnostics 却只在 `appRoot/tools/node` 查找。现已把 `resourcesPath` 从 main 贯穿 WorkspaceRuntime/runtime-config/diagnostics，并解析 unpacked CLI；alpha verifier 会临时解包真实 app.asar 并执行最终布局诊断。runtime/WorkspaceRuntime 26/26、packaging 37/37、全量 1010/1010、pack:smoke 通过；未连接真实河畔或投稿。
- 2026-07-26 现场回归：蓝色河畔多行正文（35 个换行）触发 `PUBLISH_INPUT_INVALID / Operational DTO is invalid`，首次失败后 item 被 claim，立即重试为 `OPERATIONAL_BATCH_ITEM_NOT_EXECUTABLE`；只读数据库确认无 publication/attempt/recovery intent，未触发远端。现已允许正文 `LF/CR/TAB`，并在 claim 前完成完整 DTO 校验；新增双回归，定向 34/34、全量 1012/1012 通过。旧目录制品仍运行导致标准 pack smoke `EBUSY`，独立 `release-alpha-fixed/win-unpacked` verifier 通过；未连接真实河畔或投稿。
- 2026-07-26 现场回归：多行正文与 claim 修复后，蓝色河畔返回 `Current platform account could not be verified`；队列项已安全释放为 `queued`，无 publication/attempt。根因是 production AccountInspector 未使用 platformSettingsService 保存的 Hepan Python/Cookie/vendor 配置；现已通过 runtime adapter seam 调用设置服务的只读 `--check-login` 并转换安全账号证据。账号/平台定向 34/34、全量 1014/1014、lint/main typecheck/format 通过；独立解包制品 verifier 重建通过，未执行真实投稿。
- 后续产品问题分期：用户同意将入队后撤销、清理及其他跨页状态/UI问题留到完整重构的 Phase 05/06 边界内统一收口；本次不扩大 Phase 04 修复范围。
- 停止条件是否触发：否；未把弱证据升级为published，媒体HTTP只能由显式配置和`allowInsecure`确认启用。
- Handoff路径：`docs/refactor/handoffs/phase-04.md`
- 历史启动记录：Phase 04 完成自动门禁时，Phase 05 曾为`READY`仅限本地重构；现已启动并以本表状态为准，必须保持`IN_PROGRESS`。Phase 04维持`PENDING_HUMAN`，不得标记`COMPLETE`，直到四项人工验收完成。

## 4. 当前阶段记录模板

阶段执行时用实际内容替换以下占位，并在完成后保留历史：

```md
### 阶段X：名称

- 状态：COMPLETE
- 开始时间：
- 开始分支/commit：
- 执行任务/线程：
- 用户已有改动：
- 计划内文件范围：
- 已完成工作：
- 未完成工作：
- Interface/schema偏差：
- 测试命令与结果：
- 故障/迁移/回滚证据：
- 人工待办：
- 停止条件是否触发：
- Handoff路径：
- 下一阶段是否READY：否
```

## 5. 测试证据规则

只写“测试通过”无效。每次记录至少包含：

- 命令；
- 测试文件/测试数量；
- pass/fail/skip；
- skip原因；
- 运行环境；
- fixture或隔离workspace类型；
- 故障点；
- 失败时保留的诊断ID或报告路径。

不得把真实投稿、真实数据库恢复、签名或TLS配置写成自动验证。

## 6. 阻塞与重开

- 当前阶段触发停止条件时设为`BLOCKED`，写明唯一阻塞事实和已尝试的安全检查。
- 发现前序interface/schema错误时，把前序阶段从`COMPLETE`改为`IN_PROGRESS`并记录原因；当前阶段不得用兼容wrapper绕过。
- 只缺生产人工验收但代码/自动证据完整时可标`PENDING_HUMAN`；是否允许下一阶段由对应阶段文档决定。
- 阶段8之前不得把整个工程标为`COMPLETE`。

## 7. 最终工程记录

阶段8完成时填写：

- 最终分支/commit：
- Workspace schema版本：
- Auth schema版本：
- Production runtime/controller路径：
- Domain/Application modules：
- Publisher adapters：
- Renderer feature modules：
- 全局测试结果：
- Migration/rollback结果：
- Production package结果：
- 剩余`PENDING_HUMAN`：
- Release状态：
- 普通功能开发状态：

### 阶段5：内容身份、交接与删除生命周期（2026-07-26 独立复核整改）

- 状态：IN_PROGRESS
- 开始时间：2026-07-25 Asia/Shanghai；重开时间：2026-07-26 Asia/Shanghai
- 开始分支/commit：`codex/refactor-program` / `9ff69a073eb7869df930b688d15bfd2dabb79fc8`
- 完成时间：2026-07-26 Asia/Shanghai；commit：`75dba966375302a99ebfd020c02ee6dd83930a9e`。
- 用户已有改动：继承并保留全部未提交 Phase 05 WIP；未 reset、checkout、clean、覆盖或遗漏 untracked 文件；未访问、复制或修改真实内容库、投稿、付费或生产系统。
- 独立复核整改：本轮三个 P1 已完成。queue action 已改为 OperationalStore-backed stable operationId + before manifest + `prepared → main_staged → sidecar_staged → staged → state_applied → complete` checkpoint/staging 协议；active queue operation 的 retryable 会重验 blockedItems、content/remaining-queue fingerprint、kind/cursor/operationId 归属和 claim/revision/lease/fence 后复用原 operationId；ArticleEditor 同 ArticleId props 更新使用 `mergeExternal()`，保留本地 title/remark/dirty，异文章及迟到 save/timer/dispose 继续由 session fence 隔离。metadata migration 已改为 PREPARED manifest + snapshot/staging/safe switch，并严格校验 manifest、backup、after hash 和 rollback；clients 缺失仍扫描 generated；文档数字来自本次最终命令输出。
- 删除的旧路径：IPC 自行组装 ArticleStore/ContentStore、desktop/content service 的 `articleStore` fallback、runner 注入/可选 `findByGenerationTaskId` fallback、handoff 第一项选择和 caller 侧目录/路径知识。`legacy-migration.js` 的 ArticleStore 创建仅保留为明确的一次性迁移 allowlist，不属于 workspace runtime。
- Interface/schema偏差：无；正文仍为文件内容，Operations SQLite 未被触碰；ContentStore snapshot/fingerprint 是 Removal/Trash/Handoff 唯一权威。
- 测试命令与结果：P1 组合（`tests/phase-05-p1-blockers.test.js` + `tests/article-editor-session.test.js`）14/14 pass、0 fail、0 skip；08b六文件专项命令 45/45；08a原始主定向命令 112/112；扩展 Phase 05 定向 136/136，均 0 fail、0 skip（含 ArticleEditor/session、metadata、500/5000 handoff、production removal、operational submission）；`npm test` 收集 189 个测试文件，1001 pass、0 fail、0 skip；`npm run lint`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`、`npm run format:check`、`npm run test:links` 176/176、`npm run test:packaging` 33/33、`npm run build:renderer`（Vite 2140 modules）、`npm run pack:smoke`、`git diff --check` 均通过。所有测试使用临时合成 workspace/fixture。
- 故障/迁移/回滚证据：queue 主文件/sidecar 写失败、main-only 中断、外部 hash 篡改、部分/全部缺失边界、相同 operationId retry 和 operationId 冲突均通过；active queue retryable 会实际再次调用同 operationId，blocked/remaining fingerprint/归属冲突 fail-closed；article active operation、stale runner fence、stale lock 5/5（dead/live/unknown/corrupt/ABA）均通过；ArticleEditor 同 identity merge 和 A→B 迟到 resolve/reject 均通过；migration 9/9 覆盖 clients 缺失仍扫描 generated、首/中/末 staging 写故障、manifest/backup 篡改、重复 execute/rollback、逐文件 byte-for-byte rollback；500/5000 handoff 证明每次 preview/commit 仅一次 identity scan。真实副本演练未执行，保留为 `PENDING_HUMAN`。
- 停止条件是否触发：否。08d 阻断项、真实授权副本验收、完整门禁与最终独立复核均已完成；Phase 04 人工项继续阻止正式 release，但不阻止 Phase 05 本地完成。Phase 06 保持 `NOT_STARTED`。
- Handoff路径：`docs/refactor/handoffs/phase-05.md`
- 下一阶段是否READY：是；Phase 06=`NOT_STARTED`，必须由新的明确任务启动，本任务未实施 Phase 06。

#### 2026-07-26 P1 恢复安全续记

- 状态不变：Phase 05=`IN_PROGRESS`，Phase 06=`NOT_STARTED`；原因是等待下一轮独立复核。未 stage、commit、push、PR，未访问真实内容库或真实外部系统。
- 根因/协议：queue `state_applied` 的 DB terminal item 与 staging cleanup 曾被错误折叠为 completed，现以同 operationId 重验 binding/fingerprint/terminal status/topology/hash 后 cleanup→complete，并把派生 `cleanupCancelledLocal` 识别为已完成 cancel 的 cleanup continuation。migration 在 oldRoot 部分删除失败后曾删除新 workspace 并尝试恢复残缺 before；现在新 after workspace 安装验证后持久 `INSTALLED/CLEANUP_PENDING`，oldRoot cleanup 独立可重试，snapshot 是唯一 rollback authority。`COMMITTING` 由 recover/CLI `--recover` 在 workspace 缺失时也可根据 manifest、snapshot、staging、oldRoot inventories 恢复，矛盾证据进入 `NEEDS_REPAIR`。
- 本次真实命令：P1+editor 16/16；08b 六文件 47/47；扩展 Phase 05 138/138；`npm test` 189 files、1005 pass/0 fail/0 skip；lint、三项 typecheck、format 通过；links 176/176；packaging 33/33；renderer 2140 modules；pack smoke 通过；`git diff --check` 见本轮最终检查。所有 fixture 均为临时合成 workspace。

#### 2026-07-26 rollback 与路径边界续记

- 状态不变：Phase 05=`IN_PROGRESS`，Phase 06=`NOT_STARTED`；未 stage、commit、push、PR，未访问真实内容库或真实外部系统。
- 本轮修复：rollback 使用持久 `ROLLBACK_COMMITTING` 状态；restore switch 中断后由 `recover()` 依据 snapshot、restore staging、rollback oldRoot 和 before/after inventory 恢复；`COMMITTED`/`ROLLED_BACK` no-op 先验证 workspace inventory 与残留。`inventoryAt()` 对 workspace、staging、oldRoot、restore 根路径统一 lstat，symlink/junction/非目录 fail-closed，避免 staging 链接被安装成 workspace。
- 新增故障注入：rollback 第二次 rename 中断后可 recover；staging 根 junction 在 mutation 前进入 `NEEDS_REPAIR`；`NEEDS_REPAIR` 无显式授权不可再次 recover；已安装 workspace 旁 residual staging 不得伪装为 `COMMITTED`；dangling symlink evidence path 也 fail-closed。迁移专项 16/16；P1+editor 18/18；08b 六文件 51/51；Phase 05 扩展定向 142/142；`npm test` 189 files、1009 pass/0 fail/0 skip；lint、三项 typecheck、format、links 176/176、packaging 33/33、renderer build 2140 modules、pack smoke、`git diff --check` 均通过。所有 fixture 均为临时合成 workspace。

#### 2026-07-26 08d 代码审查与再次独立复核续记

- 状态：Phase 05=`COMPLETE`，Phase 06=`NOT_STARTED`。08d A-G 与再次独立复核追加 P1 均已完成 RED→GREEN；最终独立只读复核未发现剩余 P0/P1。用户现已授权形成 Phase 05 里程碑提交。
- 追加修复：ArticleStore save/recovery/move/restore 共用 per-article 跨进程锁，fingerprint 与 rename 位于同一锁内；candidate/release 目录原子 rename 消除 acquire/release 崩溃半锁，覆盖 live/dead/unknown/ABA 与真实子进程退出。queue operation staging 根及祖先拒绝 junction/symlink/canonical escape。migration 限制 UUID v4 transactionId 并验证所有派生 evidence sibling，`NEEDS_REPAIR` 持久 forward/rollback intent，禁止残留 restore 误写 `COMMITTED`，补 old-root junction。OperationalStore v2 精确验证列、identity、unique、FK、连续 history/applied_at，并逐表哈希保护 v1 数据。
- 最终命令：08d 原四组 `40/40`、`26/26`、`15/15`、`22/22`；独立复核扩展 `68/68`、`26/26`、`19/19`、`22/22`；Phase 05 扩展定向 `176/176`；`npm test` 191 files、`1050/1050`；auth `16/16`；links `180/180`（file symlink 与 directory junction available）；packaging `33/33`；lint、main/renderer/bridge typecheck、format、renderer build（2141 modules）、pack smoke、`git diff --check` 全部通过，0 fail/skip。全部新增破坏性、迁移、恢复和并发测试仅使用临时合成 workspace；本轮未访问真实内容库或真实投稿、付费、生产系统。
- Git/边界：HEAD 仍为 `9ff69a073eb7869df930b688d15bfd2dabb79fc8`；未 reset/checkout/clean，未 stage/commit/push/PR；既有 Phase 05 WIP 与无关 Phase 06 计划文档修改均原样保留，且不计入本轮 08d 证据。

#### 2026-07-26 用户授权副本人工 migration 验收

- 仅操作用户明确指定的 `F:\workspace-migration-copy` 副本；未连接投稿、付费或生产系统，未操作原始内容库。
- 初次 dry-run 发现 13 个客户缺失 `client.json`；已在副本中补齐。12 个客户沿用生成文章中已有的一致 `clientId`；`头一锅` 使用新 UUID `1b9a780e-52c6-4db7-a4a5-a820b7125e65`。修复前副本备份为 `F:\workspace-migration-copy.pre-client-repair-backup`。
- execute：13 clients、52 articles、65 个 metadataVersion 写入，manifest=`COMMITTED`；execute 后 dry-run=`writes 0 / repairItems 0`（`头一锅` 的目录名与逻辑 UUID 差异记录为允许的 `directoryConflicts`）。
- rollback：manifest=`ROLLED_BACK`；backup snapshot 与 workspace 均 814 个文件，逐文件 SHA-256 差异为 `0`。证据目录：`F:\workspace-migration-copy.phase05-evidence`；migration backup：`F:\workspace-migration-copy.phase05-backup`。
- 本次副本验收已完成，但 Phase 05 仍=`IN_PROGRESS`，等待独立复核；Phase 06 仍=`NOT_STARTED`。

### 阶段0：工程基线与可信门禁

- 状态：COMPLETE
- 开始时间：2026-07-24 Asia/Shanghai（本阶段执行任务开始时）
- 前一阶段完成证据：不适用；阶段0是唯一不要求前序阶段完成的阶段，阶段1及以后均保持未开始。
- 开始分支/commit：`codex/refactor-program` / `bee1b3f24039bb77be0d13d9a663b88e5657e61c`
- Phase 0里程碑commit：`0bcbbfcca9ac4baf140359e048f3bf706f7b9526`（`refactor(phase-0): establish trusted engineering gates`）
- Git根与应用根：Git根 `F:\官媒投稿-refactor`；应用根 `F:\官媒投稿-refactor\auto—publish`
- 执行环境：Windows 11 专业版 build 26200；Node `v24.16.0`；npm `11.13.0`；Electron `43.1.1`
- package lock状态：根应用、`auth-server`、`media-workbench` 三份 `package-lock.json` 均未修改；未执行普通依赖升级
- 用户已有改动：未恢复、覆盖或清理原工作区历史文档删除及无关文件；未连接真实workspace、投稿、扣费或生产账号
- 计划内文件范围：根 `.github/workflows/`、`auto—publish/package.json`、测试收集/manifest/锁验证脚本、架构/打包测试、确认无生产引用的旧seam资产、本阶段账本与交接；本任务获准的最小例外为submission batch `localArchive`存储及其测试
- 已完成工作：
  - 在Git根新增 `.github/workflows/ci.yml`，所有应用命令显式使用 `auto—publish` 工作目录，并分离Node 24 desktop与Node 22 auth矩阵。
  - `scripts/run-tests.js` 收集并排序全部 `.test.js`/`.test.mjs`，以 `--test-concurrency=1` 串行运行；`test:discover` 输出176个测试文件并包含 `.mjs`。
  - production runtime统一为 `desktop/workspace-runtime.js`，由 `desktop/main.js` 组装；production renderer controller seam为 `media-workbench/src/controllers/platform-submission-controller.js` 与 `media-workbench/src/article-management-controller.js`。架构测试直接约束这些入口。
  - 删除无production引用的 `desktop/services/workspace-runtime.js`、`desktop/workspace-invalidation-policy.js` 和三个旧renderer hook及其旧测试；替换为production interface测试。
  - 新增合成workspace只读manifest：仅输出分类计数、字节数、相对路径与SHA-256，不复制或输出正文；新增renderer构建锁的陈旧锁回收/活动owner保护测试。
  - 新增本地测试/打包脚本：`test:discover`、`test:packaging`、`pack:smoke`；`pack:smoke` 已完成非签名目录制品构建。
  - 修复原基线合并提交 `e8d817847bab3a9e6020006cab35340f645e527f` 的 `localArchive` 回归：历史batch缺失字段保持缺失，不再在读/写/transition时伪造为`pending`；新发布路径仍显式持久化`pending`。
  - 保留 `submission-query` 对显式`pending`和`failed`的本地清理安全拦截；新增定向测试确认显式`pending`、`archived`、`failed`均可验证、持久化并跨store重建恢复。
  - 根CI的阻断audit改为 `npm audit --omit=dev --audit-level=high`；完整开发依赖audit保留为非阻断已知风险报告，未运行`npm audit fix`且未修改任何lockfile。
- 已核验的基线缺陷与收口：
  - `desktop/services/storage-maintenance-service.js` 的原基线扫描器使用 `lstat` 后安全跳过文件链接和目录junction，却把该动作错误计入 `followedSymlinks`。字段现仅表示真正进入链接目标的次数（安全扫描恒为0）；新增兼容性的诊断字段 `skippedSymlinks`。定向回归以临时合成fixture实际创建文件链接和目录junction，证明不读取目标、不计入容量且清理不触及目标。
  - `npm run test:links`已在本机实际运行：`file-symlink=yes`、`directory-junction=yes`、172/172通过、0 skip；旧的Windows EPERM阻塞结论失效。
  - 本项目采用本地Git里程碑提交；Git未配置remote，PR/push/required checks为`NOT_APPLICABLE`，根workflow仅作可移植配置和静态契约对象。
- Interface/schema偏差：无持久化schema、用户数据或外部平台行为变更；未执行真实迁移。唯一production runtime为 `desktop/workspace-runtime.js`，renderer使用明确的feature controller seam。
- 测试命令与结果：
  - `npm run test:discover`：通过，收集176个 `.test.js/.test.mjs`，包含新增CI workflow contract测试。
  - 修复前定向基线：原工作树与重构工作树均为 `tests/published-article-trash.test.js` 7项中5通过、2失败（`:59`、`:191`）；均来自 `e8d817847bab3a9e6020006cab35340f645e527f`。
  - 修复后定向测试：`node --test tests/published-article-trash.test.js`：8/8通过；相关submission/archive集成、查询与reconcile测试：13/13通过。
  - `node --test tests/storage-maintenance-service.test.js`：修复前6项中5通过、1失败（`:75`，实际`followedSymlinks=1`）；修复后6/6通过、0 skip，覆盖文件链接与目录junction跳过、容量排除和清理边界。
  - `npm test`：955 tests；955 pass、0 fail、0 skip；全部使用默认合成/临时fixture。
  - `npm run test:auth`：16/16通过。
  - `npm run lint`：通过。
  - `npm run typecheck:renderer`、`npm run typecheck:bridge`：均通过。
  - `npm run build:renderer`：通过，Vite转换2137 modules。
  - `npm run test:packaging`：33/33通过。
  - `npm run pack:smoke`：通过，`electron-builder --dir --config electron-builder.alpha.yml`完成非签名Windows目录制品；未发布正式包。
  - `npm run format:check`：通过。
  - `npm run test:links`：通过，172/172、0 skip；`file-symlink=yes`、`directory-junction=yes`。
  - Phase 00定向架构/锁/发现/manifest/刷新/controller/CI测试：7个文件、14/14通过（`architecture-seams`、`ci-workflow-contract`、`renderer-harness-lock`、`test-discovery-contract`、`workspace-manifest`、`renderer-content-refresh-lifecycle`、`renderer-workbench-controller-seams`）。
  - `npm audit --audit-level=high`：非阻断报告，`brace-expansion`、`fast-uri`两项high，均在开发/构建工具传递依赖；未执行`npm audit fix`。
  - `npm audit --omit=dev --audit-level=high`：通过，0 high、0 critical（`found 0 vulnerabilities`）；这是CI阻断门禁。
- 故障/迁移/回滚证据：
  - manifest测试使用临时合成workspace，验证publication、batch、sidecar、order各1项，仅返回相对路径/计数/字节数/哈希且序列化结果不含合成正文、私密材料或绝对workspace路径；CLI测试确认只读行为。
  - renderer harness锁测试验证陈旧锁可回收、活动owner锁不被回收；未对用户workspace做删除或恢复。
  - Phase 00不引入schema迁移；正式workspace迁移、备份恢复和外部平台回滚均未执行，按阶段边界留给后续阶段/人工授权。
- 人工待办：
- 自动验证已完成：`npm run test:links`在启用Developer Mode后实际执行172/172并通过；未弱化、跳过或伪造成功。
- remote、PR/push与required checks：`NOT_APPLICABLE`；根workflow保留为可移植配置并由静态契约验证。
- 开发依赖风险待办：由依赖维护者在单独授权的工作中处理2个high；Phase 0不升级普通依赖。
- 停止条件是否触发：否。所有canonical本地门禁已通过，并已由本地里程碑commit固化。
- Handoff路径：`docs/refactor/handoffs/phase-00.md`
- 下一阶段是否READY：是。阶段1为`READY`，但本任务未执行且不得开始Phase 1。

### 阶段1：领域契约与目标module骨架

- 状态：COMPLETE
- 开始时间：2026-07-24 Asia/Shanghai
- 开始分支/commit：`codex/refactor-program` / `926723f076cd1d8c88beb35695567bfb74df6639`
- 完成commit：`027e9f88e00cb206669c2490cec9fcad7e6a47ad`（`refactor(phase-1): establish domain contracts`）
- 执行任务/线程：当前 Codex 任务
- 用户已有改动：开始时工作区干净；未恢复、覆盖或混入原工作区的历史文档删除、未跟踪文件或真实内容库。
- 计划内文件范围：纯 `src/domain`/`src/application` contract，测试、类型/构建门禁、仅供测试组装的 composition skeleton、renderer 安全 DTO 声明、CONTEXT/ADR、账本和交接。
- 已完成工作：新增唯一 domain contract 出口 `src/domain/index.js`；account-aware 普通 target、media target及 `legacy-unknown-account` fail-closed 规则；安全错误、版本化 IPC/worker envelope、publisher outcome/evidence validator和fake publisher；未接入生产的 PublicationWorkflow/composition 骨架；严格 TS contract 检查和依赖方向测试；更新平台账号术语与主进程类型策略 ADR。
- 未完成工作：没有 SQLite schema、迁移、writer切换、远端 adapter 切换、renderer产品行为或真实 workspace 操作；这些均属后续阶段。
- Interface/schema偏差：旧 publication target 仍仅按 platform 建模，Phase 1 未添加兼容字段或改写旧记录；Phase 2 必须将旧普通平台记录导入为 `legacy-unknown-account`，且不得自动执行。
- 测试命令与结果：完整 `npm test`、`npm run test:auth`、`npm run lint`、`npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run build:renderer`、`npm run test:links`、`npm run format:check`、`npm run test:packaging`、`npm run pack:smoke` 均通过；默认发现178个测试文件，新增Phase 01定向7/7，auth 16/16，links 172/172，packaging 33/33；仅临时合成fixture、无真实外部调用。
- 故障/迁移/回滚证据：Phase 1禁止创建SQLite/迁移或改变writer，因此迁移、备份与回滚为不适用而非未验证；静态生产引用检查确认 `desktop/main.js`/`workspace-runtime.js`未引用新composition，未改变旧writer。非法identity、未知字段、未知DTO版本、缺失/不匹配证据、legacy未知账号均有拒绝测试。
- 人工待办：真实内容库副本、迁移、备份和恢复仅在获得隔离路径授权后的Phase 2执行。
- 停止条件是否触发：否。
- Handoff路径：`docs/refactor/handoffs/phase-01.md`
- 下一阶段是否READY：是；Phase 2为`READY`，但本任务不执行Phase 2。
