# 23 — 旧文章与投稿事实安全迁移

**What to build:** 将旧审核、多目标、通用已提交、缺订单号和已发布回收记录安全解释为新生命周期事实；可信结果自动迁移，冲突与不确定数据统一进入需处理。

**Blocked by:** 04 — 扩展 SQLite 生命周期与队列事实；05 — 移除审核与生成来源投稿门槛；09 — 普通平台结果分类与人工收口；14 — 网站媒体订单创建结果人工核对；16 — 服务商订单取消与永久历史；22 — 已发布档案与安全删除规则

**Status:** document-ready；当前不可调度

**Scheduling gate:** 作为独立波次 9，等待波次 8 Ticket 22 完成并使波次 8 `COMPLETE` 后调度；不得与图片 adapter 混波，也不消费 Ticket 18–21 的事实。

## 启动约定

- 遵守 SQLite ADR：先备份、dry-run、验证，再迁移；旧来源成为只读迁移证据。
- 迁移绝不自动调用远端、自动选择活动目标、自动重试或推断没有订单。
- 迁移只能由 workspace/schema gate 在正常运行时 composition 之前独占执行；迁移期间不得构造 publisher、普通队列 worker、付费订单执行器或供应商 adapter。
- 调度/实施前必须逐项验证上游最终公开 V1 导出及合同测试：08 的 `articleIdentityV1` / `targetIdentityV1`，09 的 `customerSnapshotV1` / `targetSnapshotV1` / `publicationEvidenceV1`，13 的 `orderIdentityV1` / `orderSnapshotV1` / `paidTargetV1`，15/16 的 `orderObservationV1` / `terminalObservationV1` / `orderHistoryV1`，22 的 `terminalTargetV1` / `closedTargetV1` / `tombstoneIdentityV1` / `deletionTransactionIdentityV1`。任一缺失或字段后来变化时立即返回 `BLOCKED_UPSTREAM_V1_CONTRACT_MISSING` 并报告 owner，不得由 Ticket 23 猜测、复制或补定义。

## 执行过程

1. 建立旧事实分类矩阵：审核字段、generated/saved、多个目标、queued/submitting/submitted/published/failed/uncertain、媒体订单号、回收墓碑和删除事务。
2. 忽略审核字段对资格的影响；保留生成来源作为可选追溯信息。
3. 任一可信普通平台成功证据或网站媒体已发布订单通过单一受控 `importLifecycleFacts` capability 建立全局发布档案并永久冻结；迁移器不得直接调用在线 outcome、publication-success 或 order transition。导入必须复用 09 的唯一 `publicationEvidenceV1` validator。若旧证据没有实际投稿标题/正文，设置 `contentAvailable=false` 并加入 `LEGACY_SUBMISSION_CONTENT_UNAVAILABLE`，不得读取当前文章正文冒充历史投稿内容；缺少真实提交或首次发布时间时对应字段为 `null`，分别加入 `LEGACY_SUBMITTED_AT_UNAVAILABLE` / `LEGACY_FIRST_PUBLISHED_AT_UNAVAILABLE`，不得使用迁移执行时间伪造。无法证明历史图片摘要时 `imageSummaryV1=null` 并加入 `LEGACY_IMAGE_SUMMARY_UNAVAILABLE`，不得用 `text_only` 空清单冒充已知无图。
4. 多个活动旧目标、缺乏可解释证据的普通平台 submitted、缺订单号媒体记录、身份/内容冲突和已发布回收记录进入需处理，不自动挑选赢家。
5. 已明确失败/取消且无成功或不确定事实的文章恢复待投稿；明确退稿按新订单历史保留并恢复编辑。
6. workspace/schema gate 检测到需要迁移时创建持久 `MigrationJournalV1` 并进入独立 migration composition root。journal 通过同一 operational SQLite 的 migration metadata/bootstrap owner 保存，gate 可在正常 schema/composition 前读取；不得写入应用配置、内容 JSON 或独立易漂移文件。phase 固定为 `detected → backed_up → confirmed → import_committed → verified`，绑定 migrationRunId、稳定 workspace identity/source fingerprint、plan fingerprint、backup identity、confirmation fingerprint、import commit fingerprint 和 verification fingerprint。import 事实、schema/version 更新与 phase=`import_committed` 必须在同一 SQLite 事务提交；post-import verification 成功后另行持久化 `verified`。正常 composition 只认可与当前 workspace identity/source/version 完全匹配的 durable verified journal，不能用“schema 已是当前版本”替代。
7. 提供 dry-run 报告、逐类数量、阻断原因、备份位置、迁移事务和恢复验证；重复运行幂等。
8. 使用合成旧内容库覆盖全部 variant、故障点、容量、未来版本拒绝、独占运行和恢复。

## 职责边界

- 旧格式读取器只解析历史证据，不写新模型。
- 迁移规划器只生成确定计划和冲突，不执行远端动作。
- 迁移执行器只通过当前 OperationalStore 迁移门面事务写入 04–22 已稳定的新事实，不绕过门面依赖 internal schema，也不复制正常运行时的发布成功、活动目标或订单转换规则。
- migration composition root 不持有 publisher、queue worker、paid executor、订单查询/取消或任何供应商 adapter；正常运行 composition 不接收 legacy reader/planner。
- workspace/schema gate 是 migration journal 与放行规则的唯一 owner；reader、planner、import store 和验证器不得各自推导是否可以启动正常 composition。
- OperationalStore migration metadata 只负责 journal 的原子持久化和 import-commit 同事务能力，不拥有 gate 放行策略；外部模块不得绕过 migration facade 直接改 journal phase。
- 新业务模块不保留旧状态分支；兼容只存在迁移边界。

## 架构硬门槛

- 解析、规划、执行和验证保持单向依赖与可独立验证的职责；只在接口隐藏足够复杂度时拆分，禁止为缩短文件制造浅模块。
- 映射规则数据化/集中化，禁止散落 `if legacy` 到生产服务。
- 迁移写入复用当前事实 owner 的受控 migration/import 端口；不得把在线命令逐条拼成迁移事务，也不得直接导入内部表结构形成第二套不变量。
- composition 只向迁移执行器注入单方法 `importLifecycleFacts` 最小 capability；输入固定为下述完全封闭 `ImportPlanV1`。OperationalStore owner 即使面对 planner 已验证的输入，也必须递归拒绝 extra fields/未知 enum，校验版本、稳定身份、每文章唯一 entry、互斥目标、成功优先级、订单号唯一性、证据完整性和 variant 允许组合，再以一个受控事务导入；不暴露完整 OperationalStore、在线命令或 internal schema。
- 任何 import variant 都不得生成 runnable queue item、phase=`prepared/remote_call_started` 的普通平台 intent、可执行付费批次或新的远端任务；迁移后的未来投稿只能由用户经正常 admission 新发起。
- 冲突默认进入需处理，禁止为了提高自动迁移率牺牲正确性。
- 迁移可在隔离副本测试，不依赖真实内容库或网络。

### MigrationJournalV1 恢复矩阵

| Durable phase      | 重启动作                                                                                              | 禁止动作                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `detected`         | 重新生成 dry-run；source fingerprint 变化则创建新 run                                                 | import、构造正常 composition                    |
| `backed_up`        | 仅在 workspace/source/plan fingerprint 与 backup integrity 全部匹配时复用备份，否则使其失效并重新备份 | 静默复用旧备份、import                          |
| `confirmed`        | 复核确认与 plan fingerprint 后幂等执行 import                                                         | 重新请求远端、跳过备份/确认                     |
| `import_committed` | 禁止再次 import，只重跑 post-import verification；失败时保持 gate 阻断并提供显式恢复流程              | 因 schema 当前而放行、重复写入                  |
| `verified`         | 仅当 journal fingerprint 与当前 workspace/source/schema 全匹配时允许正常 composition，执行组仍暂停    | 将其他 run 的 verified 证据复用到当前 workspace |

### ImportPlanV1 封闭 schema

Envelope 精确为 `{ version: 1, migrationRunId, workspaceFingerprint, sourceFingerprint, planFingerprint, entries }`。每个 entry 的公共字段精确为 `{ entryId, variant, articleIdentityV1, legacySourceFingerprint, legacyEvidenceRefs }`，其中 `legacyEvidenceRefs` 是非空 `LegacyEvidenceRefV1[]`，是该 entry 唯一的来源证据引用集合，variant payload 不得另建第二份引用。所有嵌套 DTO 必须直接调用启动约定中列出的上游最终公开 validator；migration 不复制字段定义，也不得在上游导出缺失时提供 fallback schema。任何层级 extra field、未知 enum、重复 article identity 或跨 entry 订单号重复都拒绝。

迁移本地辅助 DTO 也必须封闭：

- `LegacyEvidenceRefV1 = { sourceKind, sourceRecordIdHash, sourceVersion, evidenceFingerprint }`，`sourceKind` 只能为 `ARTICLE_RECORD|QUEUE_RECORD|SUBMISSION_RECORD|ORDER_RECORD|DELETION_RECORD`；禁止原始数据库行和绝对路径。
- `LegacyQueueEvidenceV1 = { targetIdentityV1, queueState, remoteBoundaryCrossed }`，其中 `queueState="QUEUED"`、`remoteBoundaryCrossed=false`。
- `MigrationConflictEvidenceV1 = { legacyStateCodes, targetIdentityV1s, orderIdentityV1s, contentFingerprints }`；数组字段必须存在但可为空，`targetIdentityV1s` 每项直接调用 08 owner，`orderIdentityV1s` 每项直接调用 13 owner，不允许字符串订单号或本地 fallback object；state code 只能来自 Ticket 23 第 1 步分类矩阵，禁止自由字符串。
- `MigrationDeletionEvidenceV1 = { tombstoneIdentityV1, deletionTransactionIdentityV1, conflictingFactKinds }`；两个 identity 字段允许明确 `null`，fact kind 只能为 `PUBLICATION|ORDER|ACTIVE_TARGET|TOMBSTONE|RECOVERY_TRANSACTION`。
- `RestoreEligibilityV1 = { hasPublicationSuccess, hasActiveTarget, hasTrackableOrder, hasOpenUncertainty }`，四个布尔字段必须全部存在；任一为 true 时不得恢复编辑。

| Variant                    | 精确 payload 字段                                                                 | 固定 enum / 约束                                                                                                                                                                                            | 唯一允许写入                                                           |
| -------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `publishedEvidence`        | `{ publicationEvidenceV1, terminalTargetV1, orderHistoryV1 }`                     | `orderHistoryV1` 为明确对象或 `null`；证据必须可信成功                                                                                                                                                      | 发布档案、终态目标、可选不可变订单历史、永久冻结                       |
| `trackablePaidOrder`       | `{ orderSnapshotV1, orderObservationV1, paidTargetV1 }`                           | `orderSnapshotV1.orderIdentityV1` 与 `paidTargetV1.orderIdentityV1` 必须相等，article/target/attempt 身份也必须一致；observation status 只能为 `0`、`1`、`9`；订单身份跨 entry 全局唯一                     | 订单快照/observation、一个冻结付费目标                                 |
| `pendingReadmission`       | `{ legacyQueueEvidenceV1, closedTargetV1, readmissionReason }`                    | reason 只能为 `PROVEN_PRE_REMOTE_QUEUE`；无订单/成功/unknown                                                                                                                                                | 迁移说明、结束旧目标、恢复待投稿                                       |
| `nonPublishedTerminal`     | `{ terminalObservationV1, closedTargetV1, orderHistoryV1, restoreEligibilityV1 }` | terminal kind 只能为 `FAILED`、`REJECTED`、`CANCELLED`、`PAID_STATUS_4`；order history 为对象或 `null`                                                                                                      | 终态 observation、可选订单历史、结束目标、按 eligibility 恢复          |
| `needsAttentionConflict`   | `{ conflictKind, migrationConflictEvidenceV1, freezeReasonCode }`                 | kind 只能为 `SUBMITTING_OR_UNPROVEN_SUBMITTED`、`MISSING_ORDER_ID`、`MULTIPLE_ACTIVE_TARGETS`、`IDENTITY_CONFLICT`、`CONTENT_CONFLICT`、`UNKNOWN_FACT_COMBINATION`；freeze reason 固定 `MIGRATION_CONFLICT` | 封闭冲突证据与需处理冻结                                               |
| `deletionRecoveryConflict` | `{ deletionConflictKind, migrationDeletionEvidenceV1, freezeReasonCode }`         | kind 只能为 `PUBLISHED_IN_TRASH`、`ORDERED_IN_TRASH`、`ACTIVE_TARGET_IN_TRASH`、`TOMBSTONE_CONFLICT`、`RECOVERY_TRANSACTION_CONFLICT`；freeze reason 固定 `MIGRATION_DELETION_CONFLICT`                     | 封闭 deletion/recovery 证据、需处理冻结、owner DTO 引用的发布/订单历史 |

六种 payload 均禁止 runnable queue、open remote intent、可执行批次、供应商命令、任意 metadata/原始数据库行和未列出的事实；planner 与 store owner 共同使用同一版本化 schema，但 store owner 是最终拒绝边界。

## Acceptance criteria

- [ ] 审核字段被忽略且不会阻止完整文章待投稿。
- [ ] 可信发布成功建立永久已发布事实，售后/回收旧记录不解除。
- [ ] 可信发布成功缺少历史投稿正文时仍永久冻结，但公开档案明确显示内容不可得和缺失原因，不以当前文章正文填充。
- [ ] 多活动目标、无证据 submitted、缺订单号和身份冲突进入需处理。
- [ ] 迁移不会远端投稿、取消、查单或自动重试。
- [ ] workspace/schema gate 在正常 composition 之前独占迁移；架构测试证明 migration root 无任何 adapter/executor capability，陷阱 publisher/worker 从未被构造或调用，导入成功后所有执行组仍暂停。
- [ ] 未确认迁移、备份失败、import 失败或验证失败时 gate 持续阻断正常 composition，不会构造远端能力或留下可执行事实；只有确认、导入和验证全部成功才放行。
- [ ] 在 journal 每个 phase 写入前后、尤其 import 事务提交后立即注入崩溃；重启严格按恢复矩阵处理，import_committed 只重跑验证、不重复 import，schema 当前但 journal 未 verified 仍阻断。
- [ ] dry-run、备份、事务迁移、幂等重跑、故障恢复和容量测试通过。
- [ ] 迁移结果通过正常公开投影与查询端口验证；schema/internal 文件布局变化不要求改写分类规则，迁移器也不会成为新的在线事实 writer。
- [ ] composition/架构测试证明迁移器只能使用 `importLifecycleFacts`，不能旁路在线 publication/order/queue 写能力或形成第二个事实 writer。
- [ ] 损坏/恶意 plan、未知版本、互斥目标、重复订单号、成功与非发布终态冲突及证据不完整测试证明 import owner 自身失败关闭且事务不产生部分事实；planner 不是跨事实不变量的唯一防线。
- [ ] 六种 V1 variant 全部有正反合同测试；未声明 variant 以及试图写入 runnable queue、open remote intent 或 executable paid batch 的计划均被 owner 原子拒绝。
- [ ] 六种 payload 的缺字段、extra field、未知 enum、嵌套 DTO 版本错误、重复 article/订单身份和跨 variant 冲突全部原子拒绝；planner 与 store 不形成两套字段解释。
- [ ] 上游 V1 inventory gate 对每个 owner 的导出缺失、版本漂移和 validator 身份不一致均失败关闭并返回 `BLOCKED_UPSTREAM_V1_CONTRACT_MISSING`；迁移源码中不存在复制的订单、目标、发布或删除字段列表。
- [ ] 交接记录包含映射矩阵、数量报告、冲突样例、恢复证据、模块职责、依赖方向及显著规模变化说明。

## 审计建议

- 等级：深度独立审计。
- 范围：旧事实分类矩阵、MigrationJournalV1 各 phase/恢复、六种封闭 payload、owner 二次校验、独占 migration composition、dry-run/备份/恢复、迁移门面、可信发布冻结、证据/时间不可得、幂等重跑、未来版本拒绝和容量。
- 必须在隔离副本验证损坏/恶意 plan 失败关闭、迁移根不构造远端能力、import 不生成 runnable 事实、不绕过 OperationalStore internal schema、不自动选择多目标；不重复审计 24 的全库删除或 25 的最终打包，不运行完整 `npm test`。

## Non-goals

- 不删除兼容代码；由 24 在迁移证据完成后收缩。
- 不修复用户必须人工判断的冲突数据。
