# 阶段05交接：内容身份、交接与删除生命周期

## 1. 最终状态

- Phase 05：`COMPLETE`；08d A-G 与再次独立复核追加 P1 已完成代码整改、全部自动门禁和最终独立只读复核，未发现剩余 P0/P1。用户已授权形成 Phase 05 里程碑提交。
- Phase 06：`NOT_STARTED`，本任务不实施、不开启 Phase 06。
- 分支：`codex/refactor-program`。
- 起始 HEAD：`9ff69a073eb7869df930b688d15bfd2dabb79fc8`。
- 完成 commit：`75dba966375302a99ebfd020c02ee6dd83930a9e`；未 push、未创建 PR。
- 环境：2026-07-26 Asia/Shanghai，Windows，本地临时合成 workspace。
- 真实系统边界：未连接真实投稿、付费、生产系统；仅操作用户明确授权的 `F:\workspace-migration-copy` 副本，未操作其原始内容库。
- 人工验收：`docs/refactor/08c-phase-05-human-acceptance.md` 已执行；该副本的 dry-run/execute/rollback 和逐文件 SHA-256 校验均通过。

## 2. 本轮代码审查阻断项与修复（2026-07-26）

1. Production queue action 原先先删除主文件/sidecar、后更新 OperationalStore；数据库写失败会遗留“文件永久缺失、item 仍 queued”。现由 `submission_item_operations` 持久化稳定 operationId、before manifest、expected fingerprint 和 checkpoint，主文件/sidecar 先按 checkpoint 进入 operation staging，再提交状态变更并清理 staging。相同 operationId 可恢复/幂等；外部篡改、hash/拓扑/状态冲突和 unknown 状态 fail-closed。
2. queue `activeOperation=retryable` 原先被无条件转换为 `needs_repair`，显式 retry 永远不再调用 queue action。现保留 retryable；每次 retry 重新校验 blockedItems、content identity/fingerprint、剩余 queue action fingerprint、kind/cursor/operationId 归属以及 claim token、revision、lease、fence，通过后复用原 operationId 调用实际 queue action。completed 只推进一次；冲突或无法证明归属才 needs_repair。
3. ArticleEditor 同一 ArticleId 的新 props 原先会覆盖未保存 draft/dirty 事实。现以 ArticleId 稳定 identity；同 identity 使用 `mergeExternal()` 合并外部资源和未本地修改字段，保留 title/remark/dirty/error/saving；不同 identity 才重置 session。保存迟到结果、成功 timer、dispose 和跨文章结果均按 session fence 丢弃。

此前独立复核中的 migration、ContentStore、Removal 其它安全项属于既有 Phase 05 WIP；本交接保留其历史记录，并以本轮最终门禁和测试结果为准。

08d 追加整改还包括：Removal 多点 canonical fingerprint fence 与终态单次持久化；ArticleStore fingerprint+rename 同一跨进程锁及 acquire/release crash-safe 原子目录协议；queue `state_applied` partial cleanup 与 staging root junction 防护；metadata transactionId/path sibling、forward/rollback repair intent、old-root junction；App resource save revision fence；OperationalStore v2 精确 schema/history/FK/逐表数据保持验证。

## 3. 生产调用图与 seam

```text
WorkspaceRuntime
  -> desktop/composition/content-lifecycle-composition.js
       -> one ArticleStore implementation
       -> one ContentStore implementation
  -> AI / generation / submission / platform / trash / removal services
  -> IPC safe DTO boundary
```

- workspace runtime 唯一 `createArticleStore` 创建点是 `desktop/composition/content-lifecycle-composition.js`；IPC 不创建 store。
- `src/content/content-store.js` 是唯一应用侧 ContentStore seam，负责 canonical snapshot/fingerprint、ClientId/ArticleId/GenerationTaskId `none/one/many` 解析和内容 lifecycle API。
- `src/content/legacy-migration.js` 的 ArticleStore 创建仅为一次性 migration allowlist，不属于 workspace runtime；metadata migrator 不进入安装包。
- 所有 Phase 05 production callers 接收 ContentStore/逻辑 identity，不接收物理路径、journal、backup 或 legacy ArticleStore fallback。
- Handoff 使用一次 ContentStore identity index；500/5000 synthetic production-adapter tests 证明 preview/commit 不存在 task×全库扫描。

## 4. 测试与门禁证据

所有测试均使用临时合成 workspace/fixture；无真实内容或远端连接。

| 命令 | 最终结果 |
|---|---|
| 08d 原四组专项命令 | 40/40、26/26、15/15、22/22；0 fail，0 skip |
| 最终独立复核扩展专项 | Removal+ArticleStore 68/68；migration 26/26；Editor/App/seams 19/19；OperationalStore/submission chain 22/22；0 fail，0 skip |
| Phase 05 扩展定向（08a 15 文件 + editor/migration/capacity/removal/operational/P1/App lifecycle） | 176 pass，0 fail，0 skip |
| `npm test` | 收集 191 个测试文件；1050 pass，0 fail，0 skip |
| `npm run lint` | pass |
| `npm run typecheck:renderer` / `npm run typecheck:bridge` / `npm run typecheck:main` | pass |
| `npm run format:check` | pass |
| `npm run test:links` | 180 pass，0 fail，0 skip；file-symlink=yes，directory-junction=yes |
| `npm run test:packaging` | 33 pass，0 fail，0 skip |
| `npm run build:renderer` | pass；Vite 2141 modules |
| `npm run pack:smoke` | pass；非签名 alpha `win-unpacked` 目录制品与 resources verifier 通过 |
| `git diff --check` | pass |

关键故障注入观察值：

- article active operation 已完成/可证明时 commit，move effect 仅 1 次；source/trash 矛盾和 operationId/cursor/kind 不匹配保持 `needs_repair`。
- queue active operation 后置条件已完成时只推进 cursor；`retryable` 在重验 blocked/identity/剩余 queue fingerprint 后以相同 operationId 重试，未知/冲突状态才输出 `REMOVAL_OPERATION_RESULT_UNPROVABLE` 并进入 needs_repair。
- stale runner 在 takeover 后的 checkpoint 被 claim token/revision/lease fence 拒绝。
- migration 9/9：clients 缺失仍扫描 generated；首/中/末 staging 写入故障后 workspace 全量 hash 与执行前一致；manifest 损坏、版本错误、backup 修改/额外注入在 workspace mutation 前拒绝；重复 execute/rollback 为明确 no-op；成功 rollback 全量逐文件 hash 与 snapshot 一致。
- ArticleEditor：同 ArticleId props 更新走 `mergeExternal()`，不覆盖本地 title/remark/dirty；A→B deferred save resolve/reject 均 stale 丢弃；B 的 saving/error/success/dirty 不受污染；同一 B 失败后可 retry，关闭语义保持明确。
- 500/5000 handoff：每次 preview/commit 至多一次 identity scan。

## 5. 静态零引用与文件交接

- `tests/phase-05-production-seams.test.js` 最终包含 6 项并全部通过；唯一 desktop production ArticleStore owner、IPC 无 store fallback、closed identity cardinality、ArticleEditor 权威 session 接线、migration packaging exclude 均固化为测试。
- 静态检查确认：desktop IPC 无 `article-store`/`content-store` import；无 generation first-item fallback；无 caller 自行拼 `clients/<id>`；migration CLI 不在 `electron-builder.alpha.yml` 安装资源中。
- 本任务开始时已有 WIP 全部保留；未使用 reset/checkout/clean，未 staged。
- 核心新增/修改范围：`src/content/article-removal-service.js`、`src/content/article-store.js`、`src/content/content-store.js`、`desktop/services/operational-content-submission-service.js`、`media-workbench/src/components/ArticleEditor.tsx`、`media-workbench/src/components/article-editor-session.js`、`scripts/migrate-content-metadata-v1.js`、Removal/Migration/Editor/Seam 测试、Phase 05 账本/阶段文档。
- `git status --short --untracked-files=all`、`git diff --name-only`、`git diff --cached --name-only` 和 `git diff --stat` 已在任务开始和结束核验；当前无 staged 文件。

本轮最终状态仍为未 staged、未 commit、未 push、未创建 PR；真实内容库和真实外部系统均未连接。

## 6. 人工待办与边界

- 真实内容库 migration dry-run/execute/rollback：用户授权副本 `F:\workspace-migration-copy` 已完成；原始内容库仍未操作。修复前副本备份：`F:\workspace-migration-copy.pre-client-repair-backup`；migration backup：`F:\workspace-migration-copy.phase05-backup`；证据：`F:\workspace-migration-copy.phase05-evidence`。
- 副本人工验收结果：13 clients、52 articles；补齐 13 个缺失 `client.json`，其中 12 个沿用文章中已有 `clientId`，`头一锅` 使用新 UUID `1b9a780e-52c6-4db7-a4a5-a820b7125e65`；execute 写入 65 个 metadataVersion；execute 后 dry-run `writes=0、repairItems=0`；rollback manifest=`ROLLED_BACK`；snapshot/workspace 均 814 文件，SHA-256 差异 `0`。
- Phase 04 四项人工平台验收仍为 `PENDING_HUMAN`，继续阻止正式 release，但不阻止 Phase 05 本地完成。
- Phase 06 保持 `NOT_STARTED`；本任务没有实施任何 Phase 06 Renderer/IPC 结构重构。

## 7. P1 恢复安全续交接（2026-07-26）

### Queue state_applied recovery

`state_applied` 仅证明 OperationalStore item state 已提交，不证明文件 cleanup 已完成。恢复固定使用 transaction queue `operationId`，验证 operation 的 batch/item/action、expected fingerprint、terminal status、before pair hash、source/staging 排他拓扑和 staging allowlist；然后清理并写 `complete`。cleanup EIO 保留 active operation；派生 `cleanupCancelledLocal` 被作为同一已完成 cancel 的 continuation 而非新的 fingerprint 冲突。hash 改写、额外 staging entry、source+staging、operationId/binding 冲突均 `needs_repair`；claim/revision/lease/fence 测试仍覆盖双 runner、过期租约、dispose。

### Migration durable recovery table

| 证据 | 决策 |
| --- | --- |
| workspace=before，staging=after，未移动 oldRoot | 继续两次 rename，再验证 after |
| workspace 缺失，oldRoot=before，staging=after | 安装 staging 为 workspace |
| workspace=after，oldRoot=before 或经证明的 before 残留 | `CLEANUP_PENDING`，安全重试 oldRoot cleanup |
| workspace=after，oldRoot 不存在 | checkpoint `COMMITTED` |
| rollback restore switch 中断，manifest=`ROLLBACK_COMMITTING` | 依据 snapshot、restore staging、rollback oldRoot 和 before/after inventory 继续或进入 `NEEDS_REPAIR` |
| 任一 hash/inventory/path/symlink/transaction 证据矛盾 | `NEEDS_REPAIR`，不删除任何副本 |
| manifest=`NEEDS_REPAIR` 再次恢复 | 默认拒绝；仅 `--confirm-repair`/`repairConfirmed: true` 可按完整证据矩阵显式重试 |
| workspace=after 但 residual staging 存在 | `NEEDS_REPAIR`，不得 checkpoint `COMMITTED` |

`snapshot/` 是 immutable 唯一 before rollback authority；staging 是 after 安装候选；oldRoot 一旦 cleanup 开始只可作为可验证的待清理残留，绝不再恢复为 workspace。`scripts/migrate-content-metadata-v1.js` 提供 `recover()` 与 `--recover`，状态机为 `PREPARED → STAGING_VERIFIED → COMMITTING → INSTALLED → CLEANUP_PENDING → COMMITTED`，rollback 另有 `ROLLBACK_COMMITTING → ROLLED_BACK`，并保留 `NEEDS_REPAIR`。新增故障测试覆盖 cleanup EIO 后 same operation retry、staging hash/extra/source conflict、staging 根 symlink、两次 rename 间新进程 recover、rollback restore switch 中断、oldRoot 部分删除 recovery、NEEDS_REPAIR 显式授权和 residual staging checkpoint 门禁；专项 51/51，P1+editor 18/18，扩展 142/142，`npm test` 1009/1009。全程仅使用临时合成 workspace；未连接真实系统/内容库/投稿/支付/生产系统，未 stage/commit/push/PR。

## 8. 08d 最终独立复核（2026-07-26）

- 最终独立只读复核在追加 P1 修复后复跑 68/68、26/26、19/19、22/22，均 0 fail/skip，并核验 `git diff --check`；未发现剩余 P0/P1。
- ArticleStore 的 fingerprint 校验、journal recovery 和 trash rename 由同一跨进程锁保护；save/restore 共用该协议。锁以完整 candidate 原子 rename 获得，以 canonical 原子 rename 释放；真实子进程在 acquire/release 边界退出不会留下 canonical 半锁。
- queue operation staging 根、`.submission-operations` 与 input root 在读取和删除前验证 lstat/realpath/精确 containment；junction 反例不再删除外部合成文件。migration transactionId/path、repair intent、restore residual 与 old-root junction 反例均 fail-closed。OperationalStore verifier 精确拒绝伪列、缺 identity、错误 FK、断裂 history/时间戳，并在事务内逐表验证 v1 数据保持。
- 本轮全局门禁最终为 191 files、1050/1050；auth 16/16；links 180/180；packaging 33/33；lint、三项 typecheck、format、renderer build 2141 modules、非签名 pack smoke 与 diff check 均通过。
- Phase 05 已标记 `COMPLETE` 并获授权形成里程碑提交。Phase 06 保持 `NOT_STARTED`，本任务未开始 Phase 06。
