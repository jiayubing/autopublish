# 阶段03交接：Publication工作流与恢复

## 1. 状态

- 状态：IN_PROGRESS
- 开始分支与commit：`codex/refactor-program` / `7d8f81452f98c8211308ada0ffba7873428a764b`
- 当前分支与commit：`codex/refactor-program` / `7d8f81452f98c8211308ada0ffba7873428a764b`
- 工作区状态：保留已有阶段3未提交实现：`publication-workflow.js`、`operational-store.js`、进度账本的修改，以及 composition、publisher adapter/router 和三个 Phase 03 测试文件；无暂存改动。
- 执行日期与环境：2026-07-25，Windows PowerShell，`F:\官媒投稿-refactor`。

## 2. 已完成结果

- 本续接已增加 main-side `createPublicationPostProcessor`：它在领取 archive job 后先通过 `OperationalStore.getArchiveEligibility` 验证同一 source file 的所有目标均为 durable `published`，才移动 queue 文件；它不持有 Publisher，也不会重调远端投稿。
- `claimPostProcessing` 默认只领取 queued/过期 claim job；失败 job 变为 `listPostProcessingAttention` 的权威 attention 输入，必须通过 `retryPostProcessing` 明确重新排队，避免恢复循环重复 archive 或无限自旋。
- composition root 已以 `createPostProcessor(operationalStore)` 在主进程构造该 handler；worker/adapter 未获得 OperationalStore。`article-attention` production IPC 已注入 OperationalStore，并可从其 publication/recovery/post-processing 查询派生新增 attention；旧 attention/ledger caller 仍待整体迁移，不能视作完成。

- `createPublicationWorkflow.publish` 已通过 OperationalStore `reservePublicationTarget` 在 Publisher 调用前建立 durable recovery intent，随后提交 outcome；Publisher 异常保守转换为 `uncertain`。
- `createPublicationWorkflow.recover` 已将 stranded `remote_started`/`outcome_pending` intent 转为 blocking `uncertain` / `manual_check`，不自动重试远端。
- `desktop/worker/run-task.js` 的 `platform-submit` 已不再构造或导入 legacy platform workbench；它通过 `desktop/worker/publisher-executor.js` 读取任务输入、调用 adapter 并仅返回 per-task outcome。该 executor 不导入或写入 publication ledger、batch、archive、order store 或 OperationalStore。
- `OperationalStore.markRecoveryUncertain` 已作为原子事务实现并暴露。
- 新增 authenticated main IPC `platforms:confirm-account-profile`：它只接受平台、显示名和显式确认，拒绝 caller-provided `accountProfileId`；ID 仍由 OperationalStore 生成。production runtime 注入 OperationalStore 后注册该命令，登录/session→profile 的可靠 `inspectAccount` evidence 仍必须在实际 Publisher adapter 侧补全，当前弱 evidence 保持 fail-closed。
- `OperationalStore.createAccountProfile` 仅由系统生成 account profile ID；`assertExecutableAccountProfile` 以 SQLite 权威记录核验 profile 存在及 platform 匹配。`PublicationWorkflow.publish` 在 reserve/远端调用前执行该核验，并要求 `Publisher.inspectAccount()` 返回经验证且匹配的 profile；缺失、错配或弱证据均 fail-closed。
- `validatePlatformSubmission` 现在要求每个 `targetPlatformId` 在 `accountProfiles` 中有显式绑定；platform workbench task DTO 保留 `accountProfileId`。这使新 IPC command 缺少绑定时在远端执行前被拒绝。
- 新增 `desktop/services/worker-publisher.js` 作为 main-side bridge：它调用 worker task service，但 worker outcome 缺少绑定到 article/attempt/account 的 evidence 时一律映射为 `uncertain`；不能绕过 PublicationWorkflow 把弱成功写成 published/submitted。
- `platform-workbench-service.preparePublicationCommand` 现在只读解析 queue item，生成 account-bound workflow command 与 worker task；它不写任何 publication/batch/archive 状态。
- 已删除 `platform-workbench-service.submitSelectedPlanSerially` 及其 legacy ledger、submission batch、archive 和跨文件 attempt rebind 路径；workbench 现在只保留 queue scan、输入校验和 account-bound command preparation，`workspace-runtime` 与 platform IPC 不再向它注入 legacy ledger。
- `workspace-runtime` 已创建 PublicationWorkflow composition、worker publisher 和 publication submission service；`platforms:submit-selected` 已调用 submission service 而非旧 `taskService.startPlatformSubmit`。目前 Publisher inspect seam 仍保守 fail-closed，且旧 ledger/batch/archive/attention/media production caller 尚未删除，不能声称完成切换。
- `publication:list-for-articles` 与 article-management snapshot 在 production 注入 OperationalStore 时已读取其 committed publication/attempt/remote-evidence projection；旧 ledger 仅仍为尚未迁移的 IPC aggregate fallback。旧 reconciliation IPC 不能在 OperationalStore mode 下伪造无 remote evidence 的“published”结果，返回 `PUBLICATION_RECONCILE_EVIDENCE_REQUIRED`。
- 已新增 final Publisher adapter/router：弱 legacy 成功一律为 `uncertain`，media target 保留 resource identity。
- `src/platforms/media/adapter.js` 已移除 `SubmissionOrderStore` 及所有 `.record()` 调用；adapter 仅返回 remote result/order ID，不能再写 `submission-orders.jsonl`。media workbench main-side order writer 仍未迁移，不能据此宣称 media aggregate 已完成。
- `OperationalStore.commitRemoteOutcome` 对 media target 会把 remote receipt 同事务写入 `remote_orders`（order ID = reliable remote ID）；`listRemoteOrders` 可从同一 SQLite projection 查询。这样 outcome 或 archive projection 失败不丢 order evidence；old media workbench 尚未以此 workflow 执行。
- 本续接已新增 main-side `createMediaPublisher` 和 `createMediaPublicationSubmissionService`，并把 production `media:submit-selected` 改为后者：workbench 只读准备 `mediaResourceId` commands，service 创建 SQLite batch，PublicationWorkflow reserve → remote result → outcome/order evidence。adapter/worker 不接收凭据或 store。`submitTasksSerially` 已无生产 caller，但其未导出遗留实现与 media IPC 的 legacy read dependencies 仍须删除。
- media IPC/workbench 已移除 `createPublicationLedger`、`SubmissionOrderStore` 的 production 构造，并已物理删除 `submitTasksSerially` 的 legacy ledger/order JSON 写路径；静态搜索确认 `media-ipc`、media workbench、media adapter 中不存在这些 writer 引用。订单历史 JSON reader 本身仍待 OperationalStore projection 替换。
- `createMediaOrderService` 在 production 注入 OperationalStore 时已通过 `listRemoteOrders` 构造订单 DTO，`syncOrder` 只返回 remote observation、绝不改写 retired JSONL。远端订单观察到 durable outcome 的 reconcile command 尚未完成，必须保留 fail-closed，而不是自动宣称 published。
- 已新增 `OperationalStore.reconcileRemoteOrder`：只接受已有 media order，事务更新 attempt、publication、remote evidence、order payload 与 intent；published 必须有 HTTPS remote URL，否则 reject。`syncOrder` 现在把可验证订单 observation 送入该 command，任何 evidence gap 保持既有安全状态。
- content batch IPC 的 preview/create 输入现要求每个 `targetPlatformId` 都有显式 `accountProfiles` binding；缺失会以 `ACCOUNT_PROFILE_REQUIRED` fail-closed。当前 legacy content batch service 尚未持久化该 binding 到 item/sidecar/OperationalStore，故这只是 cutover 前置边界，不能视作 aggregate 已迁移。
- 已新增 composition skeleton，由 composition 创建 OperationalStore 和 PublicationWorkflow，并在 dispose 时关闭 store。
- 本续接将 authenticated `registerIpc` 的 production ownership gate 从 `publicationLedger` 切换为 composition 注入的 `OperationalStore`；publication history 的 production-like fixture 现在从 SQLite committed evidence 读取，不再构造 JSON ledger。
- `OperationalStore.listSubmissionBatches({ clientId })` 已提供 content batch 的 durable SQLite projection，保留 item 的 account binding 与 target key。下一最小动作：用此投影和 SQLite batch create/cancel 事务替换 `content-submission-service` 的 JSON `SubmissionBatchStore` / ledger 写路径，再从 workspace runtime 删除 legacy ledger 构造。
- `workspace-runtime` 现只由 `publication-workflow-composition` 创建 OperationalStore；production content submission service 已切到该 store，不构造或注入 publication ledger。新队列 batch item 将 `clientId`、platform、source filename/content hash 和显式 `accountProfileId` 写入 SQLite；sidecar 仅是 queue content copy，未创建旧 `submission-batches` JSON 目录。后续仍须实现 SQLite-backed cancel/cleanup/retry，当前 action stub 不可作为阶段完成证据。
- content batch 的 cancel 已改为 OperationalStore `cancelQueuedSubmissionItem` 事务：仅 queued、未 claim 项可取消；主进程随后删除 queue copy，profile binding 保留在 durable item。normal platform workbench 从 v2 sidecar 读取 durable account/target/batch binding，Renderer profile 与 target 必须完全匹配；缺失绑定为 `LEGACY_UNKNOWN_ACCOUNT` fail-closed。`publication-submission-service` 查找并 claim 原 SQLite batch item，不再为执行新建影子 batch；outcome 继续由 PublicationWorkflow 写回该项。authenticated content IPC 的隐式 service factory 已删除。
- attention IPC 在 OperationalStore 已注入时不再构造 publication ledger；OperationalStore-derived publication 和 post-processing attention 保持权威。尚存的无-store legacy fallback 仅服务隔离旧测试/迁移，不能作为 production completion 证据。
- media order service 在 OperationalStore mode 也不再构造 ledger；其 order projection/sync 仅调用 OperationalStore。静态审计 `desktop/worker` 与 active `src/platforms` adapter 未发现 OperationalStore/ledger/batch/archive/order writer 引用；唯一 `SubmissionOrderStore` 命中为已无 caller 的 retired module definition，仍须在最终 cleanup 删除或移至测试/迁移资产。
- main 对 content batch item 的 claim 在 `PublicationWorkflow` 远端 intent 建立前遇到账户/profile fail-closed 时，会以同一 claim token 退回 `queued`；其他异常不释放，以免把可能已经跨远端边界的工作误判为可重试。
- outcome transaction `SQLITE_FULL` 故障注入已验证：远端成功返回后提交失败不会开始 post-processing，持久 `remote_started` intent 在 recovery 后进入 blocking `manual_check`，不自动重发远端请求。
- 合成 legacy migration 发现并修复 media order receipt 的 duplicate attach：`commitRemoteOutcome` 已同事务保存 `(attempt,remoteId)` 时，后续 legacy order alias attach 现在是幂等 `INSERT OR IGNORE`，不会令迁移失败或丢失 receipt。dry-run、execute、verify、backup/restore verify、重复执行拒绝、各生命周期 fault、rename/post-rename interruption 已重新验证。
- 已物理删除 `src/platforms/media/submission-order-store.js`。历史 JSONL reader regression 测试改为直接放置合成只读 fixture，不能再经由 writer 创建文件；静态搜索在非文档生产/测试代码中只剩零命中，媒体 runtime/order/adapter/projection 回归通过。

## 3. 权威interface与schema

| 名称 | 文件 | Caller | 不变量/错误模式 |
|---|---|---|---|
| `createPublicationWorkflow` | `auto—publish/src/application/publication-workflow.js` | 尚未接入 production main | reserve 在远端前完成；outcome 在后处理前持久化；异常为 `uncertain` |
| `markRecoveryUncertain` | `auto—publish/src/infrastructure/operational-store/operational-store.js` | `PublicationWorkflow.recover` | 同一事务更新 intent、attempt、publication；非 actionable intent fail-closed |
| `createPublicationWorkflowComposition` | `auto—publish/desktop/composition/publication-workflow-composition.js` | 尚未接入 workspace runtime | composition 是唯一 OperationalStore writer 创建点的候选，不向 worker 注入 store |
| Publisher adapter/router | `auto—publish/src/infrastructure/publishers/` | 尚未接入 production worker/main | adapter 不写 ledger、batch、archive、order 或 OperationalStore；弱证据为 `uncertain` |

## 4. Production调用图

当前 production 仍是 `desktop/workspace-runtime.js` → legacy platform workbench → worker `run-task.js` → legacy ledger/batch/archive 路径；尚未切换，故阶段3不可关闭。

目标的下一条切换链为：`workspace-runtime/main` → `PublicationWorkflow composition` → `PublicationWorkflow.reserve → Publisher → commit outcome → post-processing`；worker 仅返回 outcome/message，主进程为唯一 writer。

## 5. 修改文件

- 本阶段新增：`desktop/composition/publication-workflow-composition.js`、`src/infrastructure/publishers/{legacy-adapter-publisher,publisher-router}.js`、`tests/phase-03-{composition,publication-workflow,publisher-adapter}.test.js`、本交接文件。
- 本阶段修改：`src/application/publication-workflow.js`、`src/infrastructure/operational-store/operational-store.js`、`docs/refactor/13-progress-ledger.md`。
- 本阶段删除：尚无。
- 用户已有但未触碰：无已识别的阶段外工作区改动。

## 6. 已删除旧路径

| 旧seam/writer | 删除/替代证据 | 静态0引用检查 |
|---|---|---|
| production worker → platform workbench → legacy ledger/batch/archive | 尚未切换 | 未完成 |

## 7. 数据与迁移

- Schema版本：OperationalStore v1，未在本次续接任务改变。
- Dry-run fixture：此前阶段3记录已完成合成/授权隔离副本 dry-run、install、verify、backup/restore；本次续接尚未重跑。
- 正式迁移演练：此前记录的隔离授权演练存在；production writer 切换未完成，不能作为阶段3完成证据。
- Backup/restore：同上；需要在最终切换后重新核验。
- 冲突/人工项：旧 `legacy-unknown-account` 必须保持 fail-closed。
- 回滚结果：旧 writer 仍在 production，尚未达到切换后旧版本拒绝验证。

## 8. 测试证据

| 命令 | 结果 | 测试数量 | Skip | 环境/fixture |
|---|---|---:|---:|---|
| `node --test tests/phase-03-composition.test.js tests/phase-03-publication-workflow.test.js tests/phase-03-publisher-adapter.test.js` | 通过 | 10 pass / 0 fail | 0 | 临时合成 workspace/fake publisher，2026-07-25 |
| `node --test tests/phase-03-worker-main-contract.test.js tests/phase-03-publication-workflow.test.js` | 通过（红测先在旧 worker 路径失败） | 7 pass / 0 fail | 0 | 静态 production worker contract + 临时合成 workspace |
| `node --test tests/phase-03-worker-main-contract.test.js` | 通过 | 3 pass / 0 fail | 0 | 临时 queue fixture；覆盖无状态 adapter outcome 与 adapter exception→uncertain |
| `node --test tests/phase-03-publication-workflow.test.js` | 通过 | 8 pass / 0 fail | 0 | 临时 SQLite workspace；覆盖 account profile 不存在/平台错配与 inspectAccount 弱证据 fail-closed |
| `node --test tests/ipc-submission-boundary.test.js tests/platform-workbench-service.test.js` | 通过 | 10 pass / 0 fail | 0 | 临时 queue fixture；覆盖 IPC account profile binding 和 task DTO 保留 |
| `node --test tests/phase-03-worker-main-contract.test.js tests/phase-03-publication-workflow.test.js` | 通过 | 12 pass / 0 fail | 0 | 临时 worker/SQLite fixture；覆盖 main bridge 弱 worker success→uncertain |
| `node --test tests/platform-workbench-service.test.js` | 通过 | 5 pass / 0 fail | 0 | 临时 queue fixture；覆盖只读 command preparation |
| `node --test tests/platform-workbench-service.test.js tests/submission-batch-worker-integration.test.js tests/desktop-task-service.test.js tests/platform-submission-invocation-count.test.js` | 通过 | 22 pass / 0 fail | 0 | 既有临时合成 workspace fixture |
| `node --test tests/phase-03-worker-main-contract.test.js tests/phase-03-publication-workflow.test.js tests/platform-workbench-service.test.js tests/ipc-submission-boundary.test.js tests/runtime-publication-wiring.test.js tests/platform-submission-invocation-count.test.js` | 通过 | 29 pass / 0 fail | 0 | 2026-07-25；覆盖 worker/main workflow 合约、账号 fail-closed、IPC/只读命令准备与当前 runtime wiring |
| `node --test tests/phase-03-workbench-readonly.test.js tests/platform-workbench-service.test.js tests/phase-03-worker-main-contract.test.js tests/phase-03-publication-workflow.test.js tests/runtime-publication-wiring.test.js tests/ipc-submission-boundary.test.js tests/platform-submission-invocation-count.test.js` | 通过 | 29 pass / 0 fail | 0 | 旧 workbench writer 的红测后删除该导出；覆盖静态零引用、只读 command preparation 和切换链 |
| `node --test tests/workspace-runtime-lifecycle.test.js tests/phase-03-worker-main-contract.test.js` | 通过 | 11 pass / 0 fail | 0 | workbench 删除后，非投稿 runtime lifecycle fixture 仍可启动；缺少 worker execution function 时只在实际 publish 处保守返回 `uncertain` |
| `node --test tests/phase-03-post-processing.test.js tests/phase-03-publication-workflow.test.js tests/phase-03-composition.test.js` | 通过 | 11 pass / 0 fail | 0 | 临时 SQLite/queue fixture；覆盖 archive group gate、archive 后强杀幂等与 failed job 不自动重领 |
| `node --test tests/workspace-runtime-lifecycle.test.js tests/runtime-publication-wiring.test.js tests/phase-03-worker-main-contract.test.js tests/phase-03-workbench-readonly.test.js tests/phase-03-post-processing.test.js` | 通过 | 17 pass / 0 fail | 0 | 2026-07-25；覆盖 runtime composition、worker/main contract 与新 post-processing handler |
| `node --test tests/runtime-publication-wiring.test.js tests/workspace-runtime-lifecycle.test.js tests/phase-03-account-profile-ipc.test.js` | 通过 | 10 pass / 0 fail | 0 | 2026-07-25；覆盖 runtime 注入 OperationalStore 后的显式 account profile confirmation IPC |
| `node --test tests/phase-03-publication-history-ipc.test.js tests/publication-ipc.test.js tests/runtime-publication-wiring.test.js` | 通过 | 7 pass / 0 fail | 0 | 临时 OperationalStore fixture；证明 production history 仅从 SQLite committed evidence 投影而非 JSON ledger 读取 |
| `node --test tests/phase-03-media-adapter-readonly.test.js tests/adapter-workspace-injection.test.js tests/phase-03-publisher-adapter.test.js` | 通过 | 6 pass / 0 fail | 0 | 静态/临时 adapter fixture；证明媒体 adapter 不导入或写 legacy order JSON，且弱证据维持 uncertain |
| `node --test tests/phase-03-media-order-evidence.test.js tests/phase-03-publication-workflow.test.js tests/phase-02-operational-store.test.js` | 通过 | 14 pass / 0 fail | 0 | 临时 SQLite fixture；覆盖 media remote receipt 与 publication outcome 的同事务 order projection |
| `node --test tests/phase-03-media-publication-workflow.test.js tests/phase-03-worker-main-contract.test.js tests/runtime-publication-wiring.test.js` | 通过 | 11 pass / 0 fail | 0 | 临时 media queue/SQLite/client fixture；覆盖 main media publisher、只读 command preparation 与 IPC main workflow contract |
| `node --test tests/media-runtime-workspace.test.js tests/phase-03-media-publication-workflow.test.js` | 通过 | 10 pass / 0 fail | 0 | 2026-07-25；覆盖 retired JSON executor 不再导出及新的 media workflow preparation |
| `node --test tests/media-runtime-workspace.test.js tests/phase-03-media-publication-workflow.test.js tests/phase-03-media-adapter-readonly.test.js` | 通过 | 11 pass / 0 fail | 0 | 2026-07-25；覆盖物理删除旧 executor 后的媒体 runtime、adapter 和 workflow seam |
| `node --test tests/phase-03-media-order-projection.test.js tests/media-order-service.test.js tests/phase-03-media-publication-workflow.test.js` | 通过 | 9 pass / 0 fail | 0 | 2026-07-25；覆盖 OperationalStore order projection 与 sync 不写 retired JSONL |
| `node --test tests/phase-03-media-order-reconcile.test.js tests/phase-03-media-order-evidence.test.js tests/phase-02-operational-store.test.js` | 通过 | 7 pass / 0 fail | 0 | 临时 SQLite fixture；覆盖 media order verified evidence 的事务 reconcile 与 weak URL fail-closed |
| `node --test tests/content-submission-ipc.test.js tests/ipc-submission-boundary.test.js` | 通过 | 13 pass / 0 fail | 0 | 覆盖 content batch 缺 account profile binding fail-closed 与 media IPC 边界回归 |
| `node --test tests/phase-03-content-batch-store.test.js tests/runtime-publication-wiring.test.js tests/phase-02-operational-store.test.js` | 通过 | 9 pass / 0 fail | 0 | 2026-07-25；红测后覆盖 IPC OperationalStore ownership gate、content batch account binding SQLite projection 与 OperationalStore 回归 |
| `node --test tests/phase-03-operational-content-submission.test.js tests/phase-03-runtime-no-legacy-ledger.test.js tests/phase-03-content-batch-store.test.js` | 通过 | 3 pass / 0 fail | 0 | 2026-07-25；红测后覆盖 runtime 零 ledger 构造、content queue account binding 及 SQLite-only batch state |
| `node --test tests/content-submission-ipc.test.js tests/ipc-submission-boundary.test.js tests/generation-submission-handoff-service.test.js` | 通过 | 13 pass / 0 fail | 0 | 2026-07-25；content IPC 与 generation handoff boundary 回归 |
| `node --test tests/phase-03-worker-main-contract.test.js tests/platform-workbench-service.test.js tests/phase-03-operational-content-submission.test.js tests/phase-02-operational-store.test.js` | 通过 | 16 pass / 0 fail | 0 | 2026-07-25；覆盖 durable batch reuse/claim、account/target sidecar binding、SQLite cancel 与 worker/main workflow |
| `node --test tests/content-submission-ipc.test.js tests/runtime-publication-wiring.test.js tests/workspace-runtime-lifecycle.test.js` | 通过 | 16 pass / 0 fail | 0 | 2026-07-25；覆盖 IPC 无 legacy fallback、OperationalStore ownership 与 runtime lifecycle |
| `node --test tests/phase-03-runtime-no-legacy-ledger.test.js tests/runtime-publication-wiring.test.js tests/phase-03-post-processing.test.js` | 通过 | 7 pass / 0 fail | 0 | 2026-07-25；覆盖 runtime/attention 无 ledger 构造、publication history 与 post-processing attention/retry |
| `npm test` | 超时，非通过 | 未取得汇总 | — | 2026-07-25；64 秒命令超时，无可用 full-suite 结论，必须在最终验收重新完成 |
| `node --test tests/phase-03-media-order-projection.test.js tests/media-order-service.test.js tests/phase-03-media-publication-workflow.test.js` | 通过 | 10 pass / 0 fail | 0 | 2026-07-25；media OperationalStore projection/sync 无 ledger writer、order receipt workflow 回归 |
| `node --test tests/phase-03-content-publication-chain.test.js` | 通过 | 1 pass / 0 fail | 0 | 2026-07-25；content queue → sidecar binding → workbench → original batch item claim → PublicationWorkflow → committed outcome 完整合成链路 |
| `node --test tests/phase-03-worker-main-contract.test.js tests/phase-03-content-publication-chain.test.js tests/phase-03-publication-workflow.test.js` | 通过 | 15 pass / 0 fail | 0 | 2026-07-25；覆盖 pre-remote account failure release claim、worker/main chain、content durable batch 与 workflow/recovery/account fail-closed |
| `node --test tests/phase-03-publication-workflow.test.js` | 通过 | 9 pass / 0 fail | 0 | 2026-07-25；新增 outcome SQLite transaction failure → no post-process → recovery manual-check 故障注入 |
| `node --test tests/phase-02-migration.test.js tests/phase-02-operational-store.test.js tests/phase-03-media-order-evidence.test.js` | 通过 | 11 pass / 0 fail | 0 | 2026-07-25；合成 migration dry-run/execute/backup/restore/fault/rollback、store 与同事务 media receipt evidence 回归 |
| `node --test tests/media-runtime-workspace.test.js tests/media-order-service.test.js tests/phase-03-media-adapter-readonly.test.js tests/phase-03-media-order-projection.test.js` | 通过 | 15 pass / 0 fail | 0 | 2026-07-25；retired SubmissionOrderStore 删除后，legacy fixture/read-only projection 与 production media workflow 回归 |

已存在的测试 symbols：durable reserve/outcome、publisher crash→uncertain、invalid input no reserve、recover/reconcile、real OperationalStore post-processing、stranded intent recovery、composition writer close、weak legacy evidence、media resource routing。

## 9. 偏差与决定

- 2026-07-25：用户确认并接受显式 AccountProfile 模型。`AccountProfileId` 由系统生成；用户仅能通过平台设置或登录确认创建/确认档案。入队、queue item、IPC、main command 和 `PublicationWorkflow` target 必须携带同一 ID；main 验证档案存在、平台匹配且可执行，Publisher 在远端调用前以 `inspectAccount()` 核验当前身份。历史无账号记录保持 `legacy-unknown-account` 且人工绑定；凭据/session 留在本机安全存储，与档案建立映射但不得写入 OperationalStore。阶段4只强化 inspect evidence，不改该 interface。
- 当前 adapter 名称含 `LegacyAdapterPublisher`，但用途必须在 production cutover 中确认其不是长期兼容 wrapper：它只能将既有平台 runtime 转为最终 Publisher outcome，不能保留旧状态写入路径。
- 尚未扩大 Publisher 或 OperationalStore 的公开接口；下一步先以 production worker/main 红测确定最小所需 result protocol。
- 2026-07-25 定向审计发现 production normal-platform command 只含 `targetPlatformId`（`desktop/ipc/platform-ipc.js` → `platform-workbench-service.buildSelectedSubmissionsPlan` → worker plan）；`src/domain/publication-target.js` 对 normal platform 强制 `accountProfileId`，而 `rg` 证明除 Phase 01/02/03 fixture 和 domain/store schema 外没有任何 production account-profile registry、selection、binding 或 current-session→profile 解析。不得用猜测的默认 profile 接线：这会违反“换号后旧队列不得静默投向新账号”和 legacy-unknown-account fail-closed 规则。

## 10. 未完成与阻塞

- 代码未完成：main/workspace runtime 未切到唯一 PublicationWorkflow；legacy platform workbench、ledger/batch/archive/order JSON writer 和文件锁仍在 production；attention、batch、queue、archive、media order 尚未切到 OperationalStore。worker 已不再直接构造 workbench，但 main 仍按旧结果 DTO 消费并仍由 legacy workbench/ledger/batch/archive 完成状态写入；不得在此结构上增加 wrapper 或双写。
- `platforms:submit-selected` 已切到 workflow，但 `platform-workbench-service.submitSelectedPlanSerially` 仍是可导出的 legacy ledger/batch/archive writer；仅移除 IPC caller 不足以达到生产零引用。下一最小动作是先为该导出旧路径写静态/production seam 失败测试，并与 OperationalStore post-processing handler 一起删除，不能留下会破坏 archive retry 的半切换。
- 当前静态残余 writer 入口：`desktop/workspace-runtime.js`、`desktop/services/content-submission-service.js`、`desktop/{ipc/media-ipc.js,services/media-workbench-service.js,services/media-order-service.js}`、`desktop/{ipc/article-attention-ipc.js,ipc/publication-ipc.js}`、`src/content/submission-export-service.js` 与 `desktop/services/platform-workbench-service.js`。本续接已将 archive 后处理和部分 attention 输入迁往 OperationalStore，但仍保留 legacy attention/ledger fallback；下一最小动作是把 `registerIpc` 与 runtime 的 publication ledger required gate 替换为 OperationalStore-owned publication/batch query，再迁移一个完整 content batch aggregate，不能留下双写。
- 架构决策已解除：按已接受的显式 AccountProfile 模型实现 store、绑定和 main 核验；不得以 current/default account 替代。
- 自动验证未完成：production chain red test、worker result contract、fault injection、静态零引用、全量门禁、最终 migration/backup/restore/old-version-reject/recovery 演练。
- PENDING_HUMAN：无当前阻塞；不得访问真实外部平台。
- 触发的停止条件：尚未触发；阶段保持 IN_PROGRESS。

## 11. 下一任务入口

- 必读文件：本交接、`docs/refactor/06-phase-03-publication-workflow.md`、`desktop/worker/run-task.js`、`desktop/workspace-runtime.js`、`desktop/services/platform-workbench-service.js`。
- 首个production symbol：`desktop/worker/run-task.js` 的 publication task dispatch，以及其 main caller。
- 首个失败测试：新增 production worker/main contract test，断言 worker 的 `platform-submit` 只返回 outcome/message、不得构造 `createPlatformWorkbenchService`，并由 main 的 workflow owner 提交 outcome；它必须在当前 worker 直接 require workbench 的旧路径失败。
- 该红测的前置：在测试输入中增加显式 `accountProfileId`，并获得 production binding 规则；不可用测试专用假 profile 掩盖 production command 的缺失。
- 允许修改范围：阶段3的 worker result protocol、workspace composition、workflow/store、publication/batch/archive/attention/order callers、迁移和对应测试/文档。
- 禁止修改范围：平台 DOM/HTTP/Python 内部语义（阶段4）、renderer 页面结构、Auth。
- 下一阶段是否READY：否；阶段3必须保持 IN_PROGRESS。

## 12. 当前续接状态（2026-07-25）

- 状态仍为 `IN_PROGRESS`；本节取代上文早期“尚未切换”的历史叙述，不得据其将阶段关闭。
- 已完成 symbols：`desktop/worker/run-task.js` 的 worker-only outcome contract；`desktop/workspace-runtime.js`、`desktop/composition/publication-workflow-composition.js` 的 main-owned `PublicationWorkflow`/`OperationalStore` composition；`desktop/services/{publication-submission-service,operational-content-submission-service,publication-post-processor}.js` 的 content queue→claim→workflow→post-process 链；`src/application/publication-workflow.js` 的 intent→remote→transactional outcome/recovery；AccountProfile IPC 与 main `inspectAccount()` fail-closed 核验。
- 本次已替换两个已退役 JSON executor 测试：`article-trash-submission-lifecycle` 现在在 command preparation 阶段拒绝 trashed residue；`submission-batch-worker-integration` 仅验证 test-only legacy fixture 的 durable profile 进入只读 command，明确断言旧 executor 不存在。没有恢复 production legacy executor 或放宽 profile mismatch。
- 本次测试：`node --test tests/submission-batch-worker-integration.test.js tests/article-trash-submission-lifecycle.test.js tests/content-submission-batch.test.js tests/article-trash-service.test.js tests/ai-content-service.test.js tests/workspace-runtime-lifecycle.test.js` 为 43 pass / 0 fail / 0 skip。
- 下一个最小动作：将 `src/content/submission-export-service.js` 的 legacy ledger fallback 与 JSON export writer 从 production 退出（保留其被新 operational service 使用的纯 Markdown/atomic pair helpers），并将仅为已退役 JSON 路径而存在的测试资产迁至 `tests/helpers`；随后重新执行 production-only writer 静态审计。
- 本轮红/绿证据：先新增 `phase-03-runtime-no-legacy-ledger` production seam 测试，因 `operational-content-submission-service.js` import `submission-export-service` 失败；现以 `desktop/services/submission-file-helpers.js` 替换为纯 Markdown/atomic-pair helper。`node --test tests/phase-03-publication-workflow.test.js tests/phase-03-runtime-no-legacy-ledger.test.js tests/phase-03-operational-content-submission.test.js tests/phase-03-content-publication-chain.test.js` 为 16 pass / 0 fail / 0 skip。新增 workflow 顺序断言为 `profile → inspect → reserve(intent) → publish → commit`；missing/profile-platform-mismatch 时 inspect、Publisher、recovery intent 均为零调用。
- 静态 audit（`desktop`、`src/application`、`src/infrastructure`、`src/platforms`）对 `createPublicationLedger`、`createSubmissionBatchStore`、`SubmissionOrderStore`、`submission-order-store`、`submitSelectedPlanSerially`、`publication-ledger-store`、`submission-batch-store` 均为零命中。`src/content/submission-export-service.js` 仍是没有 production caller 的 legacy/test/diagnostic asset；其物理迁移到测试/只读诊断位置以及全量门禁尚未完成，不能关闭阶段。
- 本轮 legacy asset 退出：`src/content/submission-export-service.js` 已移动到 `tests/helpers/legacy-submission-export-service.js`；其 production repair caller 改为 `src/diagnostics/submission-pair-inspector.js` 的只读 `inspectSubmissionPair`，旧 export-writer 专属 `tests/content-submission-export.test.js` 已删除。`src/content/submission-batch-store.js` 亦已移到 `tests/helpers/legacy-submission-batch-store.js`，production `src` 不再含 batch JSON writer。相关 28-test 回归通过。仍需物理退出 `src/publication/publication-ledger{,-store}.js`，并重新执行完整故障矩阵、合成迁移恢复与全量门禁；不得关闭阶段。
- 后续 ledger 审计：`src/publication/publication-ledger.js`/`publication-ledger-store.js` 仍是唯一 production-tree legacy JSON writer definition；非测试 caller 仅为已在 `electron-builder.alpha.yml` 排除的旧 `scripts/migrate-publication-ledger-v1.js` 和 packaging contract。阶段2的 `scripts/migrate-operational-store-v1.js`、OperationalStore SQLite backup/restore 与该旧 ledger 无依赖，必须保留。下一最小动作：移除旧 ledger migration writer/专属测试，先将仍需要历史解析的字段读取落入明确的只读 migration/diagnostic module，再迁移或删除依赖 legacy ledger fixture 的测试。
- 本轮物理删除：`src/publication/publication-ledger.js`、`src/publication/publication-ledger-store.js`、`scripts/migrate-publication-ledger-v1.js`，以及只验证该 writer 的迁移/store/index/duplicate/export/batch fixture 测试与 helpers。没有新增兼容模块；阶段2唯一实际迁移入口 `scripts/migrate-operational-store-v1.js` 和其 SQLite backup/restore 保留。`electron-builder.alpha.yml`、`scripts/verify-alpha-package.js`、`package.json` format targets 与 packaging contract 已移除旧 asset，并新增断言其不进入安装包。production-only `rg`（`desktop src scripts package.json electron-builder.alpha.yml scripts/verify-alpha-package.js`）对 ledger/script/batch/order writer、构造函数及旧 executor 均为零命中。`npm run test:discover` 179 files，相关 packaging + phase2 migration/store + phase3 workflow/runtime 测试 55 pass / 0 fail / 0 skip。下一动作：执行故障注入矩阵；阶段仍不可关闭。
- 故障矩阵续证：`phase-03-publication-workflow`、post-processing、worker/main、content-chain、media order evidence/reconcile、history IPC、runtime no-legacy 与 phase2 migration/store 共 35/35通过；复跑 workflow/post-process/phase2 migration/store 22/22通过。覆盖 profile不存在/平台错配与 inspectAccount verified-but-different-profile（均零 intent、零 Publisher）、intent成功后的 restart→manual-check、Publisher throw→uncertain、outcome SQLite failure→不启动后处理、order evidence 与 outcome 同事务、post-process crash 幂等/失败不自动重领、claim释放及旧worker迟到防护。attention 删除重建、canonical full suite 与最终 migration/backup/recovery/revert/zero-reference evidence尚需实际执行；保持 `IN_PROGRESS`。

## 13. 阶段完成收口（2026-07-25）

- 状态：`COMPLETE`。production 调用图为 workspace runtime → composition-owned PublicationWorkflow/OperationalStore → Publisher；worker 仅返回 outcome。AttentionQuery 为只读派生，AttentionResolver 仅调用 PublicationWorkflow 与 post-processing port。
- 删除：legacy publication ledger/store、batch/export/order JSON writer、publication-ledger migration script、旧 executor 与仅验证其行为的测试/fixture；没有双写或默认 AccountProfile。
- 账号与恢复：profile不存在、平台错配、inspect mismatch 均零 intent/零 Publisher；intent后中断转 blocking uncertain；Publisher throw→uncertain；outcome事务失败不后处理；post-processing retry 不新建 attempt/不重投；并发 claim/迟到worker与重复target均 fail-closed。
- 数据：合成 legacy fixture dry-run→execute→schema/FK/count/manual-item→backup→新目录restore→verify，且 lifecycle fault/rename/rollback 全部通过；阶段2 OperationalStore migration/backup/restore 保留。
- 最终门禁：`npm test` 170 files，893 pass/0 fail/0 skip，约84秒；`npm run lint`、三项 typecheck、renderer build、format check、auth 16/16、packaging 33/33均通过；production-only rg 对旧 writer/script/constructor/executor/worker state write零命中（OperationalStore runtime.lock 为唯一合法单writer锁）。
- 阶段4：仍为 NOT_STARTED；其后续仅可从本阶段里程碑提交开始。
