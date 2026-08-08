# Wave 6 Final Closure — bounded evidence

日期：2026-08-08

Implementation/integration HEAD：`afd49d04adb9f2278acaa1b861a994564e500743`

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

## 改动文件

- `auto—publish/src/infrastructure/operational-store/internal/order-transition-guard.js`
- `auto—publish/src/infrastructure/operational-store/internal/operational-store-order-observation-aggregate.js`
- `auto—publish/desktop/services/media-order-service.js`
- `auto—publish/tests/phase-03-supplier-canonical-behavior.test.js`
- `auto—publish/tests/regular-platform-outcomes.test.js`
