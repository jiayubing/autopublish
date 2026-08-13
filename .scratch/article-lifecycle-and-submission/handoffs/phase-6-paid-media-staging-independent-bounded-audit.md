# Phase 6 — Paid Media Staging Independent Bounded Audit Handoff

## AUDIT RESULT

```text
AUDIT RESULT: BLOCKED
```

本次是当前 remediation 的独立 bounded audit，不是 Ticket 25 全量审计。审计在发现计划明确列出的 blocking finding 后停止继续扩展；未开发、未修复、未补测试、未启动 subagent/并行任务，未提交/合并/推送。

## Scope and baseline

```text
repository root: F:\官媒投稿-refactor
project root: auto—publish
target worktree: local dirty worktree
HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
required ancestors: 0734b89 and 4f4a721 present
externalOperations=none
supplier writes: none
order creation: none
charging: none
credentials: none
real login: none
real media query: none
production database/workspace: none
git commit/merge/push: none
```

已读取并按其约束执行：根 `AGENTS.md`、`EXECUTION-PROTOCOL.md`、`AUDIT-PROTOCOL.md`、`ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md`、`CONTEXT.md`、生命周期规格、`PAID-MEDIA-STAGING-QUEUE-FINAL-EXECUTION-PLAN.md`，以及 Phase 3A、3B、3C、4A、4B、4C、5 handoff。

## Checked invariants 1–22

状态中的 `PASS*` 表示 production source 路径已核对，但受到下方 F-001 的真实 owner integration evidence 阻塞；不把它解释为本次 audit 的无条件 PASS。

| # | 状态 | Evidence |
|---:|---|---|
| 1 | PASS* | Phase 1/2 的 `paid_staging_items` durable owner 仍是 `auto—publish/src/infrastructure/operational-store/internal/operational-store-paid-staging-aggregate.js`，经 `operational-store.js` 暴露；`tests/phase-01-paid-media-staging.test.js`、`tests/phase-02-paid-media-staging-application-ipc.test.js` 通过。 |
| 2 | PASS | `media-workbench/src/features/content/article-management-feature.js` 的 staging commands 通过 `use-content-workbench-feature.ts` 注入的既有 bridge；`tests/phase-03-paid-media-staging-renderer.test.mjs`、typed IPC direct set 通过。 |
| 3 | PASS* | 未发现第二个 production staging/media durable owner；staging UI 是 `PaidSubmissionStagingPanel.tsx`，媒体事实仍由既有 media feature / `MediaPoolStore` 提供；`phase-3a`、`phase-3c`、`phase-4c` handoff 与 source search 一致。 |
| 4 | PASS | `GeneratedArticlesView.tsx` 已移除旧 editable/manual `paidMediaResourceId` 入口和旧文章页 preflight；资源编码只在 staging picker 中作为既有选择结果展示。`renderer-content-client-switch.test.js` 覆盖旧入口缺失。 |
| 5 | PASS | `PaidSubmissionStagingPanel.tsx` 只从 `App.tsx` 传入的既有 `mediaSnapshot.pool` 选择并调用 staging set-media；缓存 price 仅展示，staging durable fact 只保存 resource id。 |
| 6 | PASS* / F-001 evidence blocked | production composition 在 `desktop/composition/workspace-runtime-composition.js:347-359,700-709` 创建并传递同一个 `MediaPoolStore`；`desktop/services/media-workbench-application.js:66-72,115-124` 将其传给 preflight；preflight service 的 `assertFavoriteMembership` 调用 `mediaPoolStore.contains`。但当前关键测试没有使用这个真实 owner，见 F-001。 |
| 7 | PASS | Panel 未把 cached price 送入 preflight/confirm；preflight service 通过 current resource query 建立报价和 fingerprint，`phase-12-paid-media-preflight.test.js` 覆盖 price drift / authoritative resource 行为。 |
| 8 | PASS | `paid-media-preflight-service.js` 的 guard 顺序为 staging membership → selected media match → favorite membership → current resource query → existing article/lifecycle/system checks；Phase 4B handoff 及 Phase 12 的固定 guard-order 测试通过。 |
| 9 | PASS | 同一 service 的 confirm 在 `paidAdmission.admitPaidBatch()` 前重查 staging、selected media、favorite、resource、article/system fingerprints；Phase 12 的 stale/cancel-favorite/delete-staging/duplicate-confirm tests 通过。 |
| 10 | PASS | `src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js:400` 的 `admitPaidBatch` 在既有 transaction 中执行 staging guard、batch/publication/active-target facts、consume 和 commit。Phase 4A real temporary OperationalStore tests 通过。 |
| 11 | PASS | 同文件的 `consumePaidStagingForNewBatch` 累加 DELETE changes，并严格要求 `deletedCount === items.length`；`staging consume count mismatch rolls back` test 通过。 |
| 12 | PASS | transaction failure 与 delete-count anomaly 都由 transaction rollback 保留 staging、移除 partial batch facts；Phase 4A rollback tests 通过。 |
| 13 | PASS | `admitPaidBatch` 先检查 existing legal paid batch replay，再绕过已消费的 staging；`existing legal paid batch replay succeeds after its staging rows were consumed` test 通过。 |
| 14 | PASS | 新 batch 写入 `pause_intent='manual'`，执行 projection 维持 paused；Phase 4A paused assertion、Phase 4C renderer batch projection 通过。 |
| 15 | PASS | confirm service 只调用 `paidAdmission.admitPaidBatch`，没有 order/supplier call；当前定向命令 87/87 通过，Phase 4A/4C 均有 no-order assertions。 |
| 16 | PASS | regular admission 仍由 OperationalStore 检查 staging conflict，paid admission 仍检查 active target；Phase 1/2、Phase 4A、Phase 12 regular/paid race tests 通过。 |
| 17 | PASS* | staging list 按 client scope，Renderer Panel 按 `item.articleRef.clientId === currentClientId` 过滤，batch projection 也过滤 current client；`renderer-content-client-switch.test.js` 与 Phase 1/2 scope tests 通过。 |
| 18 | PASS | Unicode `ClientId`（包括 `东方视光`）在 domain/IPC/staging scope 路径有 direct evidence；Phase 2 test 通过。 |
| 19 | PASS | 本 remediation 未修改 media refresh owner；`media-resource-service.test.js`、Phase 6 media tests 和 Phase 5 记录的 refresh gate 通过，`0734b89` 祖先仍在 HEAD。 |
| 20 | PASS | `submission-contract-shared.js` / production registry 保留稳定 paid staging/preflight/admission error codes；Phase 2 IPC 与 Phase 12 typed error tests 通过，已知业务错误未映射为 `IPC_INTERNAL`。 |
| 21 | BLOCKED | Staging/application/OperationalStore 边界有真实 temporary store 测试，但 favorite membership 的关键 acceptance/preflight 测试在 `phase-12-paid-media-preflight.test.js:57-64,113` 使用自造 `{ resourceIds, contains() }`，并在 `:774,827,890` 等处使用 `mediaPoolStore: { contains: () => true }`；`article-lifecycle-ticket-13.test.js:88`、`article-lifecycle-ticket-14.test.js:98`、`m06-c-remote-process-runtime.test.js:185`、`ticket-25-d-paid-media-acceptance.test.js:195` 也使用 fake pool capability。真实 `MediaPoolStore` 只在 `media-resource-service.test.js` 的 pool page/add/query 测试中出现，没有穿过真实 composition/application 验证 preflight/confirm owner wiring。 |
| 22 | BLOCKED / evidence not fully credible | HEAD、dirty source list、Phase 5 handoff 中的命令记录与当前实际状态一致；本次 serial targeted command 为 87 tests, 87 pass, 0 fail, 0 skip。但 Phase 5 所称“Main-side `MediaPoolStore.contains` enforcement passed”没有被真实 owner integration test 证明，故不能作为完整 Phase 6 PASS evidence。 |

## Findings

### F-001 — blocking: preflight favorite-owner evidence is replaced by a fake

```text
severity: P1 / BLOCKING
classification: PROCESS_EVIDENCE_GAP
owner: Phase 4B/Phase 6 acceptance evidence owner; bounded test integration seam
```

Evidence:

- Production wiring appears correct in `auto—publish/desktop/composition/workspace-runtime-composition.js:347-359,700-709` and `auto—publish/desktop/services/media-workbench-application.js:66-72,115-124`: the real `MediaPoolStore` is passed to `createPaidMediaPreflightService`.
- The decisive preflight test fixture does not observe that wiring. It creates a synthetic `favorite` object with its own `resourceIds` Set and `contains` implementation (`auto—publish/tests/phase-12-paid-media-preflight.test.js:57-64`) and passes it as `mediaPoolStore` (`:113`). Several direct cases use an unconditional `contains: () => true` fake (`:774`, `:827`, `:890`). The invalidated regression fixtures do the same in the files listed under invariant 21.
- The real `MediaPoolStore` is exercised by media-resource pool tests, but those tests do not invoke the paid preflight/confirm path through the actual application/composition. Therefore a regression in `poolStore` wiring, wrong store instance, or accidental replacement at the Main/application boundary could leave the current preflight suite green. This is exactly the plan’s blocking category “test fake 掉真正 owner造成 false-pass”.
- The current targeted run passed `87/87`, which demonstrates the fake-backed service behavior but cannot close this owner-wiring gap.

This is not a finding that the inspected production wiring is demonstrably wrong; it is a blocking false-pass/evidence gap in the required public/application/store boundary proof. Per `AUDIT-PROTOCOL.md`, no remediation was made during this audit.

## Blocking / non-blocking

```text
blocking:
- F-001: test fake掉真正 MediaPoolStore owner，造成 Main favorite guard 的 false-pass 风险

non-blocking:
- none recorded; audit stopped at the explicit blocking condition
```

不把 legacy `createPaidSubmissionBatch` 作为本 remediation 的新正式路径：`phase-4a` 已记录其为未改动 legacy facade，当前 production search 未发现调用方；本次不因此扩大 Ticket 25 审计。

## Required remediation

不得在本次 audit 中自行修复。下一次 remediation 应增加一个 bounded real-owner acceptance seam：使用 temporary workspace / synthetic local pool data，通过真实 `MediaPoolStore` 和真实 `createMediaWorkbenchApplication` 或 workspace composition 调用 preflight/confirm，证明收藏、取消收藏以及 confirm 前 membership recheck 均由真实 owner 决定；不得以 unconditional `contains` fake 作为该 owner proof。测试仍应保持无真实登录、supplier、订单、扣费或生产数据库操作。

保留现有 service unit tests 作为 guard-order/error-matrix evidence 可以，但必须另有真实 owner/application boundary evidence。修复后只做 bounded re-audit：

1. 检查 F-001 修复 diff、真实 composition/application wiring、直接调用方和 favorite membership 不变量；
2. 串行运行新增真实 owner test、`tests/phase-12-paid-media-preflight.test.js`、相关 typed IPC/application test、`tests/renderer-content-client-switch.test.js` 和 `tests/media-resource-service.test.js`；
3. 复核 no remote order/supplier/charging、client scope、known error mapping；
4. 不重开 Ticket 25 全量审计，不执行 clean-release smoke。

## Tests actually run

从 `F:\官媒投稿-refactor\auto—publish` 串行运行：

```text
node --test --test-concurrency=1 tests/phase-01-paid-media-staging.test.js tests/phase-02-paid-media-staging-application-ipc.test.js tests/phase-03-paid-media-staging-renderer.test.mjs tests/phase-04-paid-media-staging-queue-admission.test.js tests/phase-12-paid-media-preflight.test.js tests/renderer-content-client-switch.test.js tests/renderer-history-editor-flow.test.js tests/article-lifecycle-ticket-13.test.js tests/article-lifecycle-ticket-14.test.js tests/m06-c-remote-process-runtime.test.js tests/ticket-25-d-paid-media-acceptance.test.js
```

结果：`87 passed, 0 failed, 0 skipped/cancelled`。这是审计证据的一部分，但不能抵消 F-001 的 fake-owner false-pass 风险。

只读状态检查：

```text
git rev-parse HEAD
=> 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd

git diff --check
=> no whitespace errors; only existing LF→CRLF warnings
```

## Final HEAD / worktree state

写入本 handoff 前，HEAD 仍为 `9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd`。既有 dirty/untracked 状态全部保留：用户删除的 `M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md`、Phase 3A–5 source/test/handoffs、`PAID-MEDIA-STAGING-QUEUE-FINAL-EXECUTION-PLAN.md` 以及其他原有变更均未触碰。本次唯一允许的写入是本文件；未 stage、未 commit、未 merge、未 push。

写入后预期只新增本 handoff 的 untracked 状态；production source、现有测试、计划、schema 和其他 handoff 均未修改。

## External operations

```text
externalOperations=none
supplier writes: none
order creation: none
charging: none
credentials collected: none
real login: none
real media query: none
production database/workspace: none
```

```text
PHASE_6_BLOCKED
STOP_AFTER_BLOCKING_FINDING
```
