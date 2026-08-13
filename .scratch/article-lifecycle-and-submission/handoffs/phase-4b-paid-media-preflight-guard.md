# Phase 4B Paid Media Preflight Guard

## Baseline

- HEAD: `9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd`。
- HEAD parent: `4f4a721e8510e09935851c04c754bee7dae475b6`；工作树保留 Phase 3A–4A、用户删除项和最终执行计划的既有 dirty/untracked 状态。
- Phase 3A、3B、3C、4A handoff 已存在；Phase 4A 的 `admitPaidBatch` 仍是唯一批次事务与 staging consume owner。
- 改动前定向基线：`node --test --test-concurrency=1 tests/phase-12-paid-media-preflight.test.js tests/phase-04-paid-media-staging-queue-admission.test.js tests/content-submission-ipc.test.js`，36/36 通过。

## Owner

- Primary business owner：`auto—publish/desktop/services/paid-media-preflight-service.js`。
- Composition 仅注入两个已有事实读取能力：OperationalStore 的 `listPaidStagingItems`，以及已有 `MediaPoolStore.contains`；没有新增状态机或事实 writer。
- Phase 4A `admitPaidBatch` 继续拥有批次创建、原子消费和 rollback。

## Scope

- Preflight 固定顺序为：staging membership → 所有 staging selected media 与请求媒体一致 → 当前收藏媒体 membership → `queryCurrentResource` → 文章/lifecycle/system-code 检查 → confirmation token/fingerprint。
- Confirm 在调用 `paidAdmission.admitPaidBatch()` 前固定重查：staging membership → selected media → 收藏 membership → 当前 price/availability/fingerprint → 文章 fingerprint/system code → Phase 4A admission。
- staging 读取按 distinct client 一次读取并映射到 article ref；renderer 缓存价格或媒体条目不参与 authority 判断。
- 复用现有资源 price、available、remarks、resource fingerprint、文章 fingerprint、system code、TTL 和 token 语义。
- staging/favorite 变化使 confirmation stale 或返回 `NOT_IN_STAGING`；Phase 4A `PAID_ADMISSION_STAGING_*` 内部错误在 service boundary 映射为稳定安全错误。
- Confirm 成功只返回既有 paused batch path；service 不删除 staging、不创建第二笔 batch transaction，也不创建远端订单。

## Changed files

- `auto—publish/desktop/services/paid-media-preflight-service.js`
- `auto—publish/desktop/services/media-workbench-application.js`
- `auto—publish/desktop/composition/workspace-runtime-composition.js`
- `auto—publish/tests/phase-12-paid-media-preflight.test.js`
- `auto—publish/tests/article-lifecycle-ticket-13.test.js`
- `auto—publish/tests/article-lifecycle-ticket-14.test.js`
- `auto—publish/tests/m06-c-remote-process-runtime.test.js`
- `auto—publish/tests/ticket-25-d-paid-media-acceptance.test.js`

上述测试/fixture 文件的改动仅为接入新的 preflight guard 合同、直接回归和已有 Phase 4A 事实读取前提；未修改 renderer、media refresh 或 order orchestrator。

## Invariants

- 未 staging、未选择媒体、selected media mismatch、未收藏媒体都在资源查询前被阻断。
- 只有当前 `MediaPoolStore.contains(mediaResourceId)` 结果能证明收藏 membership；缓存的 price/items 不是 authority。
- 单次多文章、单 client preflight/confirm 不产生 staging SQL N+1；固定顺序测试验证一次 staging read。
- price、availability、resource fingerprint、article fingerprint、system code 或 TTL/token 失效时不会写入 paid batch。
- Phase 4A 失败仍由其原子 transaction/rollback 负责；service 只做安全错误映射，不增加旁路删除或事务。
- Confirm 成功后 staging 被 Phase 4A 原子消费，且 remote order 数为零。

## Tests

- `node --check desktop/services/paid-media-preflight-service.js; node --check desktop/services/media-workbench-application.js; node --check desktop/composition/workspace-runtime-composition.js; node --check tests/phase-12-paid-media-preflight.test.js; node --check tests/article-lifecycle-ticket-13.test.js; node --check tests/article-lifecycle-ticket-14.test.js; node --check tests/m06-c-remote-process-runtime.test.js; node --check tests/ticket-25-d-paid-media-acceptance.test.js`：通过。
- `node --test --test-concurrency=1 tests/phase-12-paid-media-preflight.test.js tests/phase-04-paid-media-staging-queue-admission.test.js tests/content-submission-ipc.test.js tests/article-lifecycle-ticket-13.test.js tests/article-lifecycle-ticket-14.test.js tests/m06-c-remote-process-runtime.test.js tests/ticket-25-d-paid-media-acceptance.test.js`：78/78 通过。
- `git diff --check`：通过。
- 覆盖：staged/matching/favorite pass、未 staging、无 selected media、selected mismatch、未收藏、媒体/队列/收藏变化 stale、price/availability/article fingerprint drift、typed safe errors、Phase 4A atomic consume、无 remote order 和无 staging N+1。

## Local self-audit

- 未使用 subagent 或并行修改；未提交、合并或推送。
- 未修改 Phase 4A admission owner、schema、renderer/UI、媒体刷新、订单执行或供应商行为。
- 未新增 public error code；复用现有 `NOT_IN_STAGING`、`INVALID_MEDIA_RESOURCE_ID`、`PAID_STAGING_CONFLICT`、`PAID_MEDIA_CONFIRMATION_STALE`、`PAID_ADMISSION_TRANSACTION_FAILED` 和 preflight/resource/storage safe mappings。
- 终态 HEAD 仍为 `9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd`；既有工作树改动均保留。

## External side effects

supplier writes: none
real order creation: none
real charging: none
credentials collected: none

## Exit

PHASE_4B_PASS
