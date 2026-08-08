# Wave 6 Final Closure — bounded evidence

日期：2026-08-08

Closure implementation HEAD：`418267fba2bc8f592ac37c528f543672f9f63eeb`

Gate Recovery implementation HEAD：`ec50d986da1cb1adaf7e44675458c8f280d3a410`

## Scope

仅覆盖 Wave 6 Final Closure 已确认的 Ticket 09/15 跨 Ticket finding：文章级首次发布成功事实与单个付费订单 remote observation/history 被错误短路；未进入 Ticket 10、Ticket 16 或 M03。

## 根因与修复

- `orderTransitionGuard.assertObservationAllowed` 原先在文章已全局发布时返回 `published_wins`，`recordOrderObservation` 随即提前返回，丢弃该订单迟到的可信 status 0/1/4/9。
- guard 现在只阻止全局生命周期副作用，已发布文章上的订单 observation 仍追加到 `orderHistoryV1`；status 2 仍走同一 Ticket 09 `applyFirstPublicationSuccess` primitive。
- 付费 status 2 在已有其他 attempt 的全局成功时不再提前返回；仍收口当前订单的 recovery/anomaly/paid target projection，同时保持原 first-publication evidence 不变。
- 订单页发布链接由历史 `publishedAt` 事实决定，不因后续订单状态覆盖历史链接。

## 公开行为验证

定向命令：

```text
node --test tests/regular-platform-outcomes.test.js tests/phase-03-supplier-canonical-behavior.test.js tests/article-lifecycle-ticket-15.test.js
```

结果：51/51 PASS。

覆盖证据：

- M1/M2/M3/M4：全局 regular accepted 后 paid status 0/1/4/9 追加真实 history，订单投影保留对应 status，文章仍 published/frozen，历史 URL 仍可打开。
- M5：新增 `a paid anomaly closes on its own status 2 after regular global publication`，验证 status 2 history、anomaly resolved、global publication evidence first-wins。
- M6：既有 `regular accepted and paid status 2 share one first-wins publication snapshot`。
- M7：既有 Ticket 15 trusted status 2 优先于 open anomaly/取消 guard seam 的行为覆盖；未实现 Ticket 16 cancellation。
- M8：既有 duplicate、stale query binding、status regression、terminal/reordered observation 测试通过。

## Bounded re-audit

范围仅为上述 finding、修复 diff、M1–M8、Ticket 09/14/15 直接不变量；无新的 P0/P1/P2 finding。`npx eslint` 对 5 个改动文件 PASS。Ticket 14 `order_creation_uncertain` 路径未改动，受影响定向测试 PASS。

## Final gate 状态

在修改后的当前工作树运行 `npm test`，结果为 1,872 tests：1,854 PASS、18 FAIL。失败为已有的迁移 legacy writer、过期 packaged owner hash、能力 inventory 等非本 closure 边界问题；因此本 evidence 不能宣称 final clean integration HEAD gate PASS，Wave Plan 暂保持 Wave 6=`RUNNING`、Wave 7=`PENDING`，等待这些基线问题由其 owner 收敛后重建最终 clean HEAD evidence。

## Gate Recovery failure map

Gate Recovery 按 18 个独立失败逐项分类后，未先修改生产代码。分类与处置如下：

| # | failing test | 分类 | 证据 / 处置 |
| --- | --- | --- | --- |
| 1 | `phase-03-content-publication-chain`: content queue execution | `STALE_TEST_OR_ARTIFACT` | 测试仍把 generic `PublicationWorkflow` 的 `submitted`/`published` 混为成功；生产 composition 已明确 generic publish 不属于 production capability。fixture 改为当前合法 `submitted` 合同。 |
| 2 | 同文件：multiline content | `STALE_TEST_OR_ARTIFACT` | 同 #1。 |
| 3 | 同文件：expired local claim | `STALE_TEST_OR_ARTIFACT` | 同 #1；仍保留 claim reclaim 与 item completion 行为验证。 |
| 4 | `phase-03-media-order-projection`: published link | `INTRODUCED_BY_WAVE6` | closure 误要求 `publishedAt`，破坏仅有 status 2 的合法公开投影；恢复 `statusCode=2 OR historical publishedAt`。 |
| 5 | 同文件：unsafe URL rejection | `INTRODUCED_BY_WAVE6` | 同 #4；恢复 URL 安全 validator 的原错误优先级。 |
| 6 | `phase-03-post-processing`: archive job | `STALE_TEST_OR_ARTIFACT` | generic submitted route 不得再制造 publication-success archive job；测试改为验证无旁路成功 job。 |
| 7 | 同文件：post-processing attention | `STALE_TEST_OR_ARTIFACT` | 同 #6；验证 submitted 不制造虚假 attention。 |
| 8 | `phase-06-media-typed-ipc`: open published URL | `INTRODUCED_BY_WAVE6` | 同 #4，公开 IPC 恢复 status 2 链路。 |
| 9 | `phase-07-regular-queue`: partial admission/removal | `EXPOSED_PREEXISTING` | regular attempt 的 legacy order link 被 paid-order projection 当成 `orderSnapshotV1` 解析；fact reader 仅投影 `target.kind=media` 的 orders。 |
| 10 | `phase-08-feature-development-admission`: fake publisher | `STALE_TEST_OR_ARTIFACT` | generic workflow fixture 改为当前支持的 `submitted`；不恢复 closed success writer。 |
| 11 | `phase-08 ... renderer slice`: resource page | `STALE_TEST_OR_ARTIFACT` | fixture 未同步 Ticket 15 新必需 media commands；补齐真实 production feature dependencies。 |
| 12 | 同文件：workspace order sync race | `STALE_TEST_OR_ARTIFACT` | 同 #11。 |
| 13 | `phase-02-migration`: execute/verify/backup | `FUTURE_TICKET_REQUIRED` | public migration 行为要求保留 legacy published fact；当前 importer 只能调用已关闭的 `commitRemoteOutcome(published)`，没有受控 import capability。 |
| 14 | 同文件：fault cleanup/retry | `FUTURE_TICKET_REQUIRED` | 重试到 import 时被同一缺失 capability 阻断。 |
| 15 | 同文件：lease write retry | `FUTURE_TICKET_REQUIRED` | 同 #13。 |
| 16 | 同文件：rename failure/retry | `FUTURE_TICKET_REQUIRED` | 同 #13；在 rename gate 前即被缺失 import capability 阻断。 |
| 17 | `phase-03-remote-order-legacy-path-absence`: packaged owner hash | `STALE_TEST_OR_ARTIFACT` | 使用正式 `pack:production:smoke:dirty` 流程重建并验证 ASAR；未手改 hash/ASAR。 |
| 18 | `phase-06-capability-specific-inventory`: consumer | `STALE_TEST_OR_ARTIFACT` | capability 已有生产调用链，inventory 缺 `mediaFeature` receiver；同步显式 consumer，不删除 gate。 |

### FUTURE_TICKET_REQUIRED 证据

- 失败保护的是 `createMigration(...).execute()` 的公开行为：导入后可 verify、backup、restore，并保持已发布事实；不是私有函数名或源码布局测试。
- `commitRemoteOutcome(published)` 由 Ticket 09 明确关闭，以保证唯一 publication-success writer；恢复它会违反当前 Wave 6 合同。
- 当前 production surface 没有 migration 专用 success import capability；fixture/artifact/inventory 同步不能让真实 importer 正确保留 published evidence。
- Ticket 23 第 3 步明确由单方法 `importLifecycleFacts` 受控导入可信 published evidence，并禁止 migration 调用在线 outcome/publication-success/order transition；M03 还要求在 Ticket 23 前建立稳定 migration capability。
- 因此正确修复必然进入 Ticket 23/M03 的未来合同。本 Gate Recovery 未实现该能力、未恢复 legacy writer、未增加 compatibility bypass。

### Gate Recovery review / bounded re-review

- 原 18 failure 对应的 10 个测试文件定向运行：55 tests，51 PASS、仅上述 4 个 migration tests FAIL。
- Wave 6 closure + Ticket 14 定向回归：64/64 PASS；原 closure 51/51 矩阵保持 PASS。
- 修改文件 ESLint PASS，`git diff --check` PASS。
- 正式 production-smoke package 生成与验证 PASS；packaged owner hash 定向测试 3/3 PASS。
- Review 未发现降低安全、packaging、inventory 或 lifecycle gate；无 Ticket 10/16/23、M03 实现，无 legacy success writer 恢复。

结论：Gate Recovery 允许范围内 findings 已关闭并 bounded re-review PASS；4 个真实 migration public-contract failures 是 scheduling blocker。Wave 6 不得标记 COMPLETE，Wave 7 保持 PENDING。

## 改动文件

- `auto—publish/src/infrastructure/operational-store/internal/order-transition-guard.js`
- `auto—publish/src/infrastructure/operational-store/internal/operational-store-order-observation-aggregate.js`
- `auto—publish/desktop/services/media-order-service.js`
- `auto—publish/tests/phase-03-supplier-canonical-behavior.test.js`
- `auto—publish/tests/regular-platform-outcomes.test.js`
