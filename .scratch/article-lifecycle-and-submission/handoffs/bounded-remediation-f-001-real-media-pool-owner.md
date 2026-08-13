# Bounded Remediation R1 — F-001 Real MediaPoolStore Owner Evidence

## Result

```text
BOUNDED_REMEDIATION_F001_PASS
```

本 remediation 只处理 Phase 6 F-001：关键 paid preflight 测试使用 `MediaPoolStore` fake，未证明真实 Main/application owner wiring。未修改 production source、schema、既有测试、既有 handoff 或计划；未提交、合并或推送。

## Finding owner and scope

```text
finding: F-001
classification: PROCESS_EVIDENCE_GAP
severity: P1 / blocking before remediation
owner: paid preflight acceptance evidence seam
scope: one focused real-owner application boundary test
```

## Changed files

```text
auto—publish/tests/paid-media-preflight-real-media-pool-owner.test.js
.scratch/article-lifecycle-and-submission/handoffs/bounded-remediation-f-001-real-media-pool-owner.md
```

新增测试只使用合成文章、临时 OperationalStore、临时 `MediaPoolStore` JSON 路径和受控的非 owner 依赖（资源查询、订单服务、admission facade）。没有把 fake `contains()` 当作收藏 owner，也没有新增 production API 或第二状态 owner。

## Real owner/application boundary evidence

`paid-media-preflight-real-media-pool-owner.test.js` 实际执行以下公开边界：

1. 使用临时 `paths.data` 实例化真实 `MediaPoolStore`，通过其公开 `contains`、`add`、`remove` 读写收藏事实。
2. 使用真实 `createMediaWorkbenchApplication`，将同一个真实 `poolStore` 传入 application；测试只调用 application 的公开 `preflightPaidMedia` / `confirmPaidMedia`。
3. 使用真实 `OperationalStore` 保存 staging，并通过真实 `listPaidStagingItems` 供 preflight 读取；文章通过真实 content/article store 保存。
4. 收藏池为空时，application preflight 返回 `INVALID_MEDIA_RESOURCE_ID`。
5. `MediaPoolStore.add` 后，同一 application preflight 返回 `ready`、`canConfirm: true` 和目标 `mediaResourceId`。
6. 在预检取得 confirmation token 后，通过真实 `MediaPoolStore.remove` 删除收藏；application confirm 在 admission 前返回 `PAID_MEDIA_CONFIRMATION_STALE`。
7. admission facade 调用次数保持为零，paid batch 数为零，staging 行仍存在，证明取消收藏的 recheck 使用了真实 owner 且没有错误地创建或消费批次。

该测试不读取 production 源码、私有函数名或文件布局来证明行为；断言的是 application 返回的公开结果、稳定错误码和持久可观察事实。

## Tests actually run

工作目录：`F:\官媒投稿-refactor\auto—publish`

```text
node --test --test-concurrency=1 tests/paid-media-preflight-real-media-pool-owner.test.js
=> 1 passed, 0 failed, 0 skipped/cancelled

node --test --test-concurrency=1 tests/paid-media-preflight-real-media-pool-owner.test.js tests/phase-12-paid-media-preflight.test.js tests/phase-02-paid-media-staging-application-ipc.test.js tests/media-resource-service.test.js
=> 43 passed, 0 failed, 0 skipped/cancelled

node --check tests/paid-media-preflight-real-media-pool-owner.test.js
=> passed

npx prettier --check tests/paid-media-preflight-real-media-pool-owner.test.js
=> passed

git diff --check
=> passed; existing LF/CRLF normalization warnings only
```

## External operations and safety

```text
externalOperations=none
supplier writes: none
order creation: none
charging: none
credentials: none
real login: none
real media query: none
production database/workspace: none
```

测试使用 `mkdtemp` 临时目录和合成 transport；测试结束后删除其临时目录。订单服务和 admission 仅为非 owner 受控依赖，confirm 在收藏 recheck 失败时不会调用 admission。

## Final state

```text
HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
production source changed by this remediation: no
existing tests changed by this remediation: no
existing handoffs changed by this remediation: no
commit/merge/push: none
```

工作树中此前 Phase 3A–4C、Phase 5、Phase 6 handoff、用户删除项和计划文件等 dirty/untracked 状态均保留；本 remediation 新增的 untracked 文件仅为上述 focused test 和本 handoff。

## Bounded re-audit scope

下一阶段只复核 F-001 及其直接失效 gate：

1. 检查新增测试是否真的实例化真实 `MediaPoolStore`，并通过 `createMediaWorkbenchApplication` 调用 preflight/confirm；
2. 串行运行新增测试、`phase-12-paid-media-preflight.test.js`、相关 application/typed IPC 测试和 `media-resource-service.test.js`；
3. 复核真实 favorite membership、confirm 前 recheck、无远端订单/供应商副作用，以及 staging 未被错误消费；
4. 不重开 Ticket 25 全量审计，不执行 clean-release smoke，不扩大到无关 invariants。

```text
STOP_AFTER_BOUNDED_REMEDIATION
```
