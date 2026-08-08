# M03-0 — 实时职责与合同图

日期：2026-08-08

Source state：`59feb04`（`docs: split M03 execution plan`）

范围：只记录 M03-0 要求的 owner、公开接口、调用方约束、测试基线和 Ticket 23 migration seam；没有移动或修改 production owner，没有增加 public capability、migration writer、兼容层或占位接口。

## 1. 实时装配与职责图

```text
workspace-runtime-composition
  └─ createOperationalStore({ transitionPorts })
       ├─ operational-store.js                         公共持久化门面与唯一 internal composer
       │    ├─ frozen OperationalStore facade          既有广面公共调用合同
       │    └─ named transition ports                  面向应用用例的窄 capability
       ├─ operational-store-queue-aggregate.js
       │    ├─ regular queue runtime                   group/item、run intent、claim/renew、remote-start、snapshot
       │    └─ shared admission transaction            regular admit/remove、paid admit、paid batch persistence
       └─ 其他既有 aggregates                          outcome/order/recovery/publication-success 等独立 owner

named publication/facts/regular/paid capabilities
  └─ content-lifecycle-composition
       └─ ArticleMutationCoordinator cluster           唯一文章集合 mutation 协调 owner
            ├─ canonical article-set lock ordering
            ├─ mutation session 与锁内 lifecycle facts 重读
            ├─ article read/save/publication
            ├─ regular/paid admission 与 pending removal
            └─ removal transaction、trash/restore/delete、side-effect/release uncertain

直接应用调用方
  ├─ regular-queue-application                         只通过 coordinator 写 admission/removal；直接 capability 只读 facts
  ├─ regular-queue-group-orchestrator                  只消费 regularQueueGroupTransitions
  ├─ paid-media-preflight-service                      只消费 coordinator.admitPaidBatch
  ├─ publication workflow / AI content / generation    只消费 coordinator 对应文章用例
  └─ trash / removal / article management              只消费 coordinator 与应用级 removal seam
```

当前没有第二个文章集合 lock owner。`article_active_targets` 的 regular/paid admission 写入都位于 queue aggregate 的同一个 SQLite transaction owner 内；虽然另有 `operational-store-active-target-aggregate.js` 服务其他 publication/order 状态转换，M03-A 不得把 admission 排他检查或 admission 写入委托成跨 transaction 的第二套 writer。publication success 继续只由既有 publication-success primitive 建立，queue/coordinator 均不拥有该事实。

## 2. Public interface before

### 2.1 OperationalStore 模块与 frozen facade

`src/infrastructure/operational-store/operational-store.js` 的模块导出固定为：

- `SCHEMA_VERSION`
- `createOperationalStore`
- `dryRunOperationalStoreMigration`
- `verifyOperationalDatabase`

`createOperationalStore()` 返回的 frozen facade 当前按职责包含以下 62 个 key；M03-A/B 不得增加、删除或改名：

- runtime：`databasePath`、`verify`、`backup`、`close`
- account/publication：`createAccountProfile`、`listAccountProfiles`、`assertExecutableAccountProfile`、`reservePublicationTarget`、`commitRemoteOutcome`、`listPublicationRecords`
- recovery/post-processing：`listActionableRecovery`、`markRecoveryUncertain`、`claimPostProcessing`、`completePostProcessing`、`retryPostProcessing`、`listPostProcessingAttention`、`listPublicationAttention`、`deriveAttentionInput`
- submission preparation/execution：`createSubmissionBatch`、`queueSubmissionBatch`、`discardPreparedSubmissionBatch`、`prepareSubmissionItemAction`、`getSubmissionItemAction`、`checkpointSubmissionItemAction`、`claimSubmissionItem`、`claimSubmissionItemById`、`renewSubmissionItemClaim`、`updateSubmissionItem`、`cancelQueuedSubmissionItem`、`markSubmissionItemCleaned`、`getSubmissionBatch`、`listSubmissionBatches`、`findSubmissionItem`、`getArchiveEligibility`
- order/read model：`attachRemoteOrderEvidence`、`listRemoteOrders`、`listOrderDisplayViews`
- legacy queue facade：`createSubmissionQueueGroup`、`setSubmissionQueueGroupPause`、`listSubmissionQueueGroups`、`enqueueSubmissionQueueItem`、`listSubmissionQueueItems`
- paid batch facade：`createPaidSubmissionBatch`、`getPaidSubmissionBatch`、`listPaidSubmissionBatches`、`setPaidSubmissionBatchPause`
- paid execution/outcome：`beginOrderCreationRemoteCall`、`claimPaidSubmissionBatchItem`、`listPaidSubmissionBatchSnapshots`、`pauseAllPaidSubmissionBatches`、`pausePaidSubmissionBatchesOnStartup`、`releasePaidOrderCreationClaim`、`renewPaidOrderCreationClaim`、`setPaidSubmissionBatchRunIntent`、`startAllPaidSubmissionBatches`、`recordPaidOrderCreationArticleRejection`、`recordPaidOrderCreationSystemRejection`、`recordPaidOrderCreationSuccess`、`recordPaidOrderCreationUncertain`
- reconciliation/facts：`recordManualReconciliation`、`listManualReconciliations`、`listArticleLifecycleFacts`

候选 queue facade 的九个 legacy/paid batch 方法在当前 production `desktop/`、`src/`、`scripts/` 中没有直接方法调用，但仍被 frozen public-surface contract 锁定；M03 不以“当前无调用”名义删除它们，删除 legacy surface 属于 Ticket 24。

### 2.2 Named transition ports

`operational-store-transition-ports.js` 当前公开以下 frozen shape；M03-A/B 必须逐项保持：

- `publicationTransitions`：`listArticleLifecycleFacts`、`reservePublicationTarget`、`commitRemoteOutcome`、`markRecoveryUncertain`
- `regularQueueTransitions`：`listArticleLifecycleFacts`、`admitRegularQueueItem`、`removePendingQueueItem`
- `regularQueueGroupTransitions`：`listRegularQueueGroupSnapshots`、`setRegularQueueGroupRunIntent`、`startAllRegularQueueGroups`、`pauseAllRegularQueueGroups`、`pauseRegularQueueGroupsOnStartup`、`claimRegularQueueGroupHead`、`renewRegularQueueGroupClaim`、`beginRegularRemoteSubmission`
- `regularOutcomeTransitions`：`confirmRegularAccepted`、`confirmRegularNotAccepted`、`getRegularOutcomeSnapshot`、`markOrphanedRegularAttemptUncertain`、`prepareRegularUncertainResolution`、`recordRegularAccepted`、`recordRegularArticleRejected`、`recordRegularGroupBlocked`、`recordRegularUncertain`
- `paidAdmissionTransitions`：`listArticleLifecycleFacts`、`admitPaidBatch`
- `paidExecutionTransitions`：`beginOrderCreationRemoteCall`、`claimPaidSubmissionBatchItem`、`listPaidSubmissionBatchSnapshots`、`pauseAllPaidSubmissionBatches`、`pausePaidSubmissionBatchesOnStartup`、`recordPaidOrderCreationArticleRejection`、`recordPaidOrderCreationSuccess`、`recordPaidOrderCreationSystemRejection`、`recordPaidOrderCreationUncertain`、`releasePaidOrderCreationClaim`、`renewPaidOrderCreationClaim`、`setPaidSubmissionBatchRunIntent`、`startAllPaidSubmissionBatches`
- `orderCreationResolutionTransitions`：`prepareOrderCreationResolution`、`bindVerifiedOrder`、`confirmNoOrder`
- `orderObservationTransitions`：`listOrderObservationViews`、`getOrderObservationContext`、`recordOrderObservation`、`recordOrderStatusAnomaly`、`prepareOrderStatusAnomalyResolution`、`resumeOrderTracking`、`confirmOrderPublished`、`confirmOrderNotPublished`、`readOrderTransitionFacts`
- `orderCancellationTransitions`：`prepareOrderCancellation`、`beginOrderCancellation`、`recordOrderCancellationOutcome`、`getOrderCancellationContext`、`getOrderCancellationView`、`prepareCancellationResolution`、`confirmCancellationSucceeded`、`confirmCancellationNotApplied`
- `publishedArchiveQueries`：`listPublishedArchives`

### 2.3 ArticleMutationCoordinator surface

Coordinator 当前 public surface 为：`canonicalArticleRefKey`、`readArticleForEdit`、`readArticleForRemoval`、`readArticleForPublication`、`createArticle`、`saveExistingArticle`、`resolveTrustedArticleRef`、`reservePublicationTarget`、`commitPublicationOutcome`、`markRecoveryUncertain`、`admitRegularQueueItems`、`admitPaidBatch`、`removePendingQueueItems`、`executeArticleRemovalTransaction`、`assertTrashedArticleMutationAllowed`、`restoreArticles`、`permanentlyDeleteArticles`、`restoreTrashedArticle`、`permanentlyDeleteTrashedArticle`、`supportsArticleRemovalTransaction`。

M03-B 可把实现拆入 cluster internal modules，但 composition 与调用方仍只看到这一 coordinator object；不得公开 mutation session、article lock、OperationalStore transaction、事实重读或 side-effect marker。

## 3. 直接调用方必须理解的约束

| 调用方/装配 | 当前 capability | 必须保持的 ordering、error 与 capability 约束 |
| --- | --- | --- |
| `workspace-runtime-composition.js` | 构造 facade 与 transition port holder，并把窄能力分发给 composition/service | `operational-store.js` 仍是唯一 public composer；不得把 internal module、DB、SQL 或 transaction 下传 |
| `content-lifecycle-composition.js` | publication/facts、regular admission/removal、paid admission、removal transition port | coordinator 必须先取得 canonical article-set lock，再在锁内读文章与 lifecycle facts，最后调用持久化 capability；调用方不能重排 |
| `regular-queue-application.js` | coordinator 的批量 regular admit/remove；`regularQueueTransitions.listArticleLifecycleFacts` 只读 | per-article missing/conflict 结果与稳定 error code 保持；应用不得直接调用 admission writer 绕过文章锁 |
| `regular-queue-group-orchestrator.js` | exact `regularQueueGroupTransitions` 八方法 shape | startup 先 pause；run intent 后 claim FIFO head；准备期间 renew；远端调用前必须先原子 `beginRegularRemoteSubmission`；`submitAuthorized=false` 不得再次远端提交；uncertain/group-blocked 停止该组 |
| `paid-media-preflight-service.js` | `paidAdmission.admitPaidBatch`，production 注入 coordinator method | 资源、价格、系统标识和文章 fingerprint 在 admission 前重检；coordinator 按 canonical lock order 锁全组；paid batch/attempt/publication/active-target 必须全成或全退；失败不能留下可运行孤儿事实 |
| publication workflow | coordinator 的 read/reserve/commit/uncertain 方法；部分旧流程仍消费 broad facade | reserve 使用锁内不可变文章 snapshot；远端 side effect 之后的 release failure 映射为 manual-check uncertain；不得恢复 `commitRemoteOutcome(published)` publication-success writer |
| AI content / generation services | coordinator 的 create/read/save | existing save 保持 fingerprint CAS；保存后 release failure 不得伪造失败可重试 |
| trash/removal/article management | coordinator 的 removal/restore/permanent-delete 用例 | canonical 多文章锁、锁内 tombstone/lifecycle 重读、文件 transaction、stale confirmation 与 repair/manual-check 语义保持；订单和发布最小事实不可删除 |
| legacy migration CLI | public OperationalStore facade；唯一 internal 例外为 recovery guard | M03 不扩大 internal 例外，不让 migration 读取 schema/SQL/table/file layout；当前 legacy published 写入失败保持 inherited blocker，等待 Ticket 23 唯一 import capability |

## 4. M03-A/B include 与 exclude 判定

### Include

- `operational-store-queue-aggregate.js`：同文件同时拥有 regular runtime 与 shared admission transaction，变化原因已明确分离；regular/paid admission 又必须共享 active-target 排他、幂等与原子写入规则，因此按这两个不变量重组。
- queue cluster 新 internal module：只允许隐藏上述 runtime/admission 复杂度；可有一个小型 composer，不允许纯透传 adapter 链。
- `article-mutation-coordinator.js`：唯一 cluster owner 已成立，但 read/save/publication、admission/removal、trash/delete 三组变化原因集中在同一实现；M03-B 只能在 coordinator 封闭 kernel 后拆分。
- `operational-store.js`、transition ports、content/workspace composition 与上述直接调用方：只在保持原 facade/port shape 和装配所需时修改。
- 对应行为、fault/transaction、capability 与依赖方向测试。

### Exclude

- `operational-store-order-aggregate.js`、`operational-store-order-observation-aggregate.js`、`operational-store-regular-outcome-aggregate.js`：它们拥有 admission 之后的 order/outcome observation 与 publication-success 协作，不参与 admission transaction；当前没有无法分离的直接不变量。
- `operational-store-order-cancellation-aggregate.js`：Ticket 16 cancellation owner 独立；本次仅有架构测试 allow-list 漏项，不构成 production 纳入理由。
- `operational-store-paid-execution-aggregate.js`：paid remote execution/claim owner 已与 paid admission 分离，不应因共享 paid batch 表而并入 queue 重组。
- `operational-store-active-target-aggregate.js`：不另建 admission writer；M03-A 保持 admission cluster 内同 transaction 的 active-target 排他与写入，不把它拆成跨 owner choreography。
- Ticket 10 Renderer feature/component：只消费应用命令/只读模型，没有 queue/coordinator owner 不变量。
- legacy migration implementation 与 Ticket 23 `ImportPlanV1`/journal/import writer：不属于 M03。

## 5. Ticket 23 migration seam 预检

当前 `scripts/migrate-operational-store-v1.js` 通过 public module 创建 OperationalStore，并调用 `reservePublicationTarget`、`commitRemoteOutcome`、`attachRemoteOrderEvidence`、`createSubmissionBatch`、`verify`、`close`；唯一 internal import 是进程级 `operational-store-recovery-guard`，没有导入 schema、queue aggregate、SQL/table owner 或 transaction primitive。

因此未来 Ticket 23 可以在 `operational-store.js` 的现有 context/transaction 装配边界增加唯一 `importLifecycleFacts` public capability，而无需依赖 M03 拆分后的 internal 文件布局。M03-A/B 必须保持这一条件，但本维护不定义 `ImportPlanV1`，不添加 `importLifecycleFacts`、placeholder、temporary writer 或 migration-only compatibility API。现有 importer 调用 `commitRemoteOutcome({ outcome: "published" })` 触发 `PUBLICATION_SUCCESS_WRITER_CLOSED` 的四个失败是已授权 inherited blocker，不得在 M03 修复。

## 6. 测试基线与后续 gate

环境：Windows；Node `v24.16.0`；npm `11.13.0`。

### 实际基线

1. `node --test tests/phase-08-operational-store-internals.test.js tests/article-lifecycle-ticket-08.test.js tests/phase-07-regular-queue.test.js tests/phase-12-paid-media-preflight.test.js tests/article-mutation-coordinator.test.js tests/article-lifecycle-ticket-16.test.js tests/article-lifecycle-ticket-22.test.js`
   - 89 tests；87 PASS，2 FAIL。
   - 所有 queue runtime、regular/paid admission、coordinator、Ticket 16/22 行为测试 PASS。
   - 两个失败均来自 `phase-08-operational-store-internals.test.js` 的既有静态测试，见下节分类。
2. `node --test tests/phase-02-migration.test.js`
   - 8 tests；4 PASS，4 FAIL。
   - 四个失败仍为 synthetic import、lifecycle fault、payload write failure、rename failure 在 `PUBLICATION_SUCCESS_WRITER_CLOSED` 提前终止；数量、根因和行为合同与 Ticket 22 handoff 一致，分类为 inherited blocker。

### M03-A 定向 gate

- facade 与 relevant transition port shape；queue group snapshot/FIFO/pause/run/startup pause；claim/renew/stale/reordered；remote-start authorization 与 fault rollback/restart。
- regular admit/remove、paid admit 的重复调用、batch/target conflict、regular-vs-paid 竞态、partial/fault rollback、active-target 排他与原子事实。
- 直接调用方：regular queue application/group orchestrator、paid preflight。

### M03-B 定向 gate

- edit/publication fingerprint CAS 与锁内 snapshot；canonical multi-article lock ordering/partial acquisition release。
- regular/paid admission 与 pending removal；removal transaction、stale tombstone、restore/permanent-delete；side-effect 后 release uncertain 与 repair/manual-check。
- Ticket 16 cancellation priority 和 Ticket 22 archive/deletion 直接回归。

### M03-C 架构与组合 gate

- frozen facade、全部 named port 与 coordinator public surface before/after 一致。
- production 外部模块不新增 `operational-store/internal` 依赖；扫描规则按 internal boundary 判断，不能维护易漏项的合法 internal 文件清单。
- 删除 facade 行数阈值；以 surface absence、无 SQL/table/transaction 泄漏、公开 capability 和行为测试证明门面。
- 对 M03-A/B 最终组合 diff 执行 Primary Audit、必要 remediation 与 bounded re-audit；再运行 Maintenance 合同要求的 lint/typecheck/format/定向 gate。

## 7. 基线 finding 分类

1. `P2 / EXPOSED_PREEXISTING`：`phase-08-operational-store-internals.test.js` 用 `operational-store.js <= 160 lines` 作为 facade 深度 pass/fail；当前文件 175 行，因此失败。该断言直接违反 M03 已确定的测试原则，但不证明 production 行为错误。Owner：M03-C 架构测试；删除机械行数 gate，以公开 surface 与泄漏 absence 取代。M03-0 不修改测试。
2. `P2 / PROCESS_EVIDENCE_GAP`：同一测试用手工 `INTERNAL_MODULES` allow-list 判断合法 internal-to-internal import，遗漏 Ticket 16 的 `operational-store-order-cancellation-aggregate.js`，误报其导入 `order-transition-guard` 与 `operational-store-utils`。扫描未发现 production 外部模块新增 internal 依赖。Owner：M03-C 依赖方向测试；改为 boundary-based 规则，不扩 production scope。M03-0 不修改测试。

上述两项不是 Wave Plan 允许继承的四个 migration failure，已按要求单独分类；它们不阻塞职责图成立或 M03-A production 重组，但必须在 M03-C final gate 前关闭。未发现需要把 order、outcome、paid execution、cancellation 或 Renderer owner 纳入 M03 的直接不变量。

## 8. M03-0 结论

- regular queue runtime、shared admission transaction、ArticleMutationCoordinator cluster 三个 owner 均已唯一定位；没有发现平行 article lock、admission transaction 或 publication-success writer。
- M03-A/B candidate include/exclude 范围成立，不需要扩大到合同明确排除的 owner。
- public facade、transition ports、coordinator surface 和调用方必须理解的顺序/错误/capability 约束已有 before 基线。
- Ticket 23 的合法 seam 是未来由 public OperationalStore facade 暴露的唯一 import capability；M03 不需要也不得提前实现它。
- 本记录只完成 M03-0 文档工作包。按 Manual Dispatch，没有执行 Primary Audit、commit、merge 或 M03-A production 修改；Wave Plan 状态和下一动作保持不变，直到本记录进入 integration HEAD 并收到下一项调度。
