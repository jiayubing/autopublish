# Ticket 24-0 — Runtime legacy inventory and deletion map

状态：`CLOSURE-READY`（仅 24-0；Ticket 24 仍未完成，24-A 未启动）

## 基线与边界

- Base integration HEAD：`8fa66e8d226c846fba13be375ca8cf6b6f36568d4`。
- 分支：`codex/article-lifecycle-submission`；24-0 开始时工作树 clean。
- 本包只新增本 handoff；未修改 production、测试断言、fixture 内容或 absence gate；未 merge、push、真实外部操作。
- 分类按“字段/符号/能力”而不是整文件；同一文件中语义不同的字段分开归类，不形成重复 owner。

## 五类分类代表性清单

| ID / 分类 | 代表性 surface | owner / 真实消费者 | 预定工作包 | 验证方式 |
| --- | --- | --- | --- | --- |
| A-01 `REMOVE_RUNTIME` | `src/content/article-version-service.js::createArticleVersionService/copyArticleVersion`；`content-core-contracts.js::generatedArticle.sourceArticleId/version`；`article-serialization.js::reviewedAt` | Article Content Contract Owner；当前无 production direct caller，测试/alpha packaging 仍引用 | 24-A | 生成成功直达待投稿；公开 Article DTO/IPC/preload/renderer 无 review/lineage；删除 service 后 packaging/contract matrix |
| B-01 `REMOVE_RUNTIME` | `desktop/ipc/contracts/generation-contracts.js`、`generation-submission-handoff-ipc.js` 的 `targetPlatformIds`；`content:preview-generation-submission-handoff` / `content:commit-generation-submission-handoff` | Single-target Submission Contract Owner；`GenerationSubmissionHandoffDrawer` → generation feature/bridge/preload → handoff service → `submission-batch-planner` | 24-B | `platformId + accountProfileId`；多篇单目标、重复 admission、活动目标、stale、缺 profile、多目标 payload 拒绝；无 Cartesian product |
| B-02 `REMOVE_RUNTIME` | `desktop/services/platform-workbench/command-preparer.js::buildSelectedSubmissionsPlan`、`submission-boundary.js`、`platform-contracts.js` 的旧数组 shape；`platform-workbench-application.js::submitSelected` | Single-target Submission Contract Owner；service export 有测试消费者，但无 production IPC registration/fixture capability | 24-B，残余 dead export 由 24-E 收口 | public capability inventory、无 `platform.submitSelected`、旧 payload rejection |
| C-01 `REMOVE_RUNTIME` | `src/publication/publication-state.js`、`src/content/article-lifecycle-facts.js`/projection、`src/domain/publisher-contract.js`、四个平台 adapter、worker/services、`media-workbench/src/publication-status.ts` 与 publication/platform types 中通用 `submitting/submitted/reviewing` | Runtime Outcome Vocabulary Owner；adapter → worker/application → OperationalStore/projection → IPC/bridge/Renderer | 24-C | regular accepted/failed/uncertain、paid processing/published/cancel/manual-check、迟到/重复 observation；uncertain 不直接 retry |
| D-01 `REMOVE_RUNTIME` | `publishedToClean`：`article-submission-removal-coordinator.js`、`article-removal-plan.js`、`content-core-contracts.js`、`media-workbench/src/types/publication.ts`、`GeneratedArticlesView.tsx`；`published-cleaned/failed-cleaned/cancelled-cleaned` runtime branches | Removal and Queue Capability Owner；article removal projection/service → content IPC/preload/bridge/GeneratedArticlesView | 24-D | 已发布永久只读；trash/removal/recovery 矩阵；production capability 不再暴露 published recycle 或用户 queue-copy cleanup |
| K-01 `KEEP_CURRENT_FACT` | 单目标 `targetPlatformId`（regular queue/store/publication target）；`content.removePendingQueueItems` 及其 `content:remove-pending-queue-items` | ArticleMutationCoordinator / regular queue application；`GeneratedArticlesView` 明确移除未开始项并恢复编辑 | 24-B 保持单目标；24-D 只校验其非副本语义 | 重复移除、活动/已开始/uncertain/published 拒绝、recovery；不按名称机械删除 |
| K-02 `KEEP_CURRENT_FACT` | `submittedAt/submittedAtSource` in `publication-evidence-contract.js`/order UI；`submittedTitle/submittedBody` in `paid-media-order-contract.js`/paid orchestrator；供应商 raw/status code 仅在 adapter boundary | Publication Evidence / Paid Order / Supplier Adapter owners；档案、订单页和 adapter 内部消费者 | 24-C 保留并隔离 | evidence validator、订单/档案 projection；raw supplier value 不泄漏为 article lifecycle enum |
| K-03 `KEEP_CURRENT_FACT` | `submission-operation-files.js::main.queue-copy`、staging/recovery checkpoint；`preview/cleanupTrashedArticleQueueResidue` 维护命令；`PUBLISHED_TRASH_CONFLICT`、订单/发布/删除最小事实 | Submission recovery / ArticleMutationCoordinator / Ticket 02/16/22 owners；PlatformWorkbench 只做 residue preview + explicit cleanup | 24-D 保留内部不可变 evidence/repair，不保留用户副本实体 | crash/restart/repair、订单与 publication evidence 永久保留、已发布不可回收 |
| M-01 `KEEP_MIGRATION_ONLY` | `src/content/legacy-migration-reader.js`、`legacy-migration-planner.js`、`domain/migration-import-contract.js`、`operational-store-migration-import.js`、`scripts/migrate-operational-store-v1.js` 中旧 review/`submitted`/历史 target 字段 | Legacy Migration Planner / Workspace Migration Gate / Import Transaction owners；仅离线 reader/planner/ImportPlan 与 migration fixtures | 24-C/24-E 只保留隔离边界 | migration reader/planner 可读旧证据；正常 composition/production projection/Renderer 不可见、不可产生 runnable fact |
| T-01 `KEEP_EXPLICIT_LEGACY_TEST_EVIDENCE` | `scripts/verify-legacy-absence.js`、`verify-renderer-contract-absence.js`、`tests/phase-06-legacy-path-absence.test.js`、renderer artifact/IPC fixture absence tests；`phase-07-regular-queue.test.js` 对旧多目标 payload 的明确拒绝断言 | Legacy Absence Gate Owner；CI/contract tests 消费；不是普通行为 fixture | 24-E | 分层 absence：production capability、DTO/enum、IPC/channel、Renderer action/UI、migration allowlist；只做静态 absence/依赖边界，不替代行为测试 |
| E-01 `DEFER_M04` | 24-A–D 清理后仍存在的 `desktop/ipc/contracts/content-core-contracts.js`、`submission-contracts.js`、`generation-contracts.js`、`platform-contracts.js` 及 OperationalStore broad facade 的职责收缩/拆分 | M04 Final Contract Consolidation；当前 callers 仍消费既有公开合同 | M04（24 完成后） | 以 24-A–D 后 capability graph、模块深度/依赖方向/公开 contract 测试决定；24-0 不机械拆文件 |

范围外候选：`src/core/articles.js` 对文件名 `副本` 后缀的通用归一化尚未证明属于文章 lineage/队列副本语义；改变它会改变导入/文件名语义，标记 `BLOCKED_SCOPE_DECISION_REQUIRED`，不在 24-0 或 24-A–D 自行删除。

## 公开 capability before-map

| before capability / channel | 当前公开形状与直接消费者 | 24-0 判定 / after 方向 |
| --- | --- | --- |
| `generation.previewSubmissionHandoff` / `generation.commitSubmissionHandoff`；`content:preview/commit-generation-submission-handoff` | `targetPlatformIds[] + accountProfiles`；生成交接 Drawer checkbox，service 按文章 × 目标建 batch | 24-B `REMOVE_RUNTIME`；改为单一 `platformId + accountProfileId`，每篇一次 admission |
| `content.previewRegularQueueAdmission` / `content.admitRegularQueueItems` | 已是 `platformId + accountProfileId + articleRefs`；GeneratedArticlesView → regular queue application → ArticleMutationCoordinator；application 已拒绝数组 | 24-B `KEEP_CURRENT_FACT`；保留单目标 contract，补多目标 rejection/幂等/活动目标矩阵 |
| `platform.submitSelected`（service method）及 `platform-contracts.js` 未注册 submission helper | `platform-workbench` service/test 可调用；当前无 production IPC capability/真实 Renderer caller | 24-B/24-E 删除 dead export 与旧数组 helper；不得建立兼容转换 |
| `content.previewArticleRemovalImpact` / `content.trashArticles` | removal DTO/UI 仍带 `publishedToClean`、failed/local queue-copy 文案 | 24-D 删除 recycle/copy 字段与用户动作；保留 coordinator lock、transaction、order/evidence/recovery |
| `content.preview/cleanupFailedSubmissionItems` | GeneratedArticlesView 可清理失败 queue item 的本地副本 | 24-D `REMOVE_RUNTIME`，除非后续证据证明是现有活动目标 recovery；不得按名字保留独立副本能力 |
| `content.preview/cleanupTrashedArticleQueueResidue` | PlatformWorkbench residue preview → explicit cleanup；Ticket 10 明确为删除后残留修复 | 24-D `KEEP_CURRENT_FACT`；仅 repair/evidence，不是可浏览、复制、编辑的队列实体 |
| review/copy IPC capability | 当前 production capability fixture 未发现 review/copy channel；残留在 Article DTO/serializer/service/packaging/test | 24-A 删除残留；absence gate 保留为明确负向证据 |
| publication/order status DTO | Renderer/worker/projection 仍可收到 generic `submitted/submitting` | 24-C 删除正常 runtime enum；保留 typed outcome、`submittedAt` 等当前事实和 migration allowlist |

## 直接调用图与串行删除顺序

```text
GenerationSubmissionHandoffDrawer
  -> generation feature -> bridge/generation.ts -> preload
  -> content:preview|commit-generation-submission-handoff
  -> generation-submission-handoff-ipc -> handoff service
  -> submission-batch-planner/content submission -> ArticleMutationCoordinator

GeneratedArticlesView regular admission/removal
  -> content feature/article-management feature -> bridge/content*.ts -> preload
  -> content:preview|admit-regular-queue / remove-pending / removal channels
  -> content-submission-ipc/ai-content-ipc -> regularQueueApplication/removal service
  -> ArticleMutationCoordinator -> named OperationalStore transition ports

adapter -> worker/application -> publication/order projection -> IPC contract -> bridge/Renderer
legacy files -> migration reader -> planner -> workspace gate -> ImportPlanV1/import transaction
```

严格顺序：`24-A` 先删 review/lineage（Article Content owner）→ `24-B` 收缩所有 submission entry 到单目标（含 generation/platform dead path）→ `24-C` 删除正常 generic outcome vocabulary 并隔离 raw/migration → `24-D` 删除 published recycle 与 user queue-copy capability、保留 `removePendingQueueItems` 和 recovery。重叠文件 `content-core-contracts.js`、`publication.ts`、`GeneratedArticlesView.tsx`、submission service/contract 只能按此顺序改，不能并行。

## 覆盖计数（文件级，不是 occurrence 数）

在 `src/desktop/media-workbench/src/scripts/tests`，排除 `node_modules/dist/build/release-*` 的只读扫描结果：

| token | production files | test files | all |
| --- | ---: | ---: | ---: |
| `targetPlatformIds` | 15 | 16 | 31 |
| `targetPlatformId` | 43 | 27 | 70 |
| `submitted` | 47 | 37 | 84 |
| `reviewedAt` | 3 | 8 | 11 |
| `sourceArticleId` | 3 | 3 | 6 |
| `publishedToClean` | 6 | 4 | 10 |
| `published-cleaned` | 9 | 0 | 9 |
| `removePendingQueueItems` | 11 | 2 | 13 |

这些计数已按上表拆成 runtime、current fact、migration-only、explicit evidence、M04 residual；`targetPlatformIds` 没有被误归入历史 `targetPlatformId`，`submittedAt/submittedTitle/submittedBody` 没有被误归入 generic `submitted`。

## 24-0 Primary Audit

Scope：本 handoff、当前 HEAD 的最小直接调用链和 Ticket 24-0 acceptance；不审查 24-A–F 实现，不做全仓库 fresh review。

Checked invariants：唯一分类；每类有既有 owner/真实消费者；公开 before-map 可追到 preload/bridge/channel/应用 owner；24-A–D 文件交叠已串行化；迁移 reader 不进入正常 composition；当前事实与 generic legacy 分离；五类 acceptance、text-only seam、absence evidence、M04 边界均已覆盖。

Findings：

1. `P2 PROCESS_EVIDENCE_GAP`：用户给出的 `issues/24-...` 路径在 HEAD 实际位于 `.scratch/article-lifecycle-and-submission/issues/24-...`；已按真实文件解析，不影响合同内容。Owner：当前 24-0 handoff evidence。
2. `P3 EXPOSED_PREEXISTING`：`src/core/articles.js` 的“副本”后缀归一化语义未能由 Ticket 24 合同确定；已隔离为 `BLOCKED_SCOPE_DECISION_REQUIRED`，未扩大范围。

无 P0/P1；无需修改 production/test/gate；上述 finding 不阻塞 24-0 handoff。Primary Audit 结论：`PASS`。

## Bounded re-audit 与验证证据

Bounded re-audit 仅复核：上述路径事实、五类唯一分类、before-map、调用图、24-A–D 顺序、`submitted*`/singular target 隔离、覆盖计数，以及 handoff diff；未重新扫描整个仓库、未重新审计历史 Ticket。结果：`PASS`；无 escalation 条件、无未登记 blocking finding。

实际只读命令/结果：

- 初始 `git status --short --branch`：`## codex/article-lifecycle-submission`（clean）；提交前 staged 状态仅含本 handoff。
- Base `git rev-parse HEAD`：`8fa66e8d226c846fba13be375ca8cf6b6f36568d4`。
- token file-count inventory：结果见上表，8 个 token 均有可复现计数。
- production IPC fixture 定向 capability probe：总 capability `131`；相关 before-map `9` 项；精确 capability 名称匹配 `review`/`copy` 为 `0`。确认 generation handoff 两个 channel、regular admission、`removePendingQueueItems`、failed cleanup/residue channel 的 before-map。
- `git diff --cached --check`：commit 前通过，无输出错误；最终 `git show --check --oneline HEAD` 作为 commit 后空白复核。
- staged 文件清单：仅本 handoff；未发现 production/test/gate 修改。

未运行 gate（按 24-0 范围明确记录）：完整 `npm test`、lint/typecheck/build、migration matrix、production packaging/smoke、真实平台/订单/登录/图片传输；这些属于实现工作包或最终 24-F clean integration HEAD，不由 inventory 文档替代。未修改或宣称这些 gate 通过。

## Git / 下一动作

- 24-0 commit：`docs: add Ticket 24-0 legacy inventory`；最终 OID 以提交后 `git rev-parse HEAD` 结果和本次任务回执为准。
- 未 merge、未 push；不得进入 24-A，直到本 commit 进入新的 clean integration HEAD 并由主任务重新执行调度预检。
- 下一动作仅为主任务验证本 handoff/commit 的 Closure，然后另行调度 24-A；24-0 不修改 Wave Plan、不创建子代理。
