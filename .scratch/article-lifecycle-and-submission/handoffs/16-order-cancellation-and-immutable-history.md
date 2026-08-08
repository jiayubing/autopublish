# Ticket 16 — 服务商订单取消与永久历史

日期：2026-08-08

Base integration HEAD：`db3b16a2c8000b5d443295fc1276b94fbbe012e4`

Implementation commit：`a3469ae`（`feat: add durable paid order cancellation`）

## Scope 与 owner

- 新增独立 `orderCancellationTransitions` owner，负责预检、durable intent、明确 outcome、证据核对和两种具名人工 resolution。
- `operational-store-order-observation-aggregate` 继续唯一拥有 `orderHistoryV1` append 与 paid target projection；取消 owner 只调用未暴露给 composition 的窄内部 capability，没有复制 V1 schema/history writer。
- `orderTransitionGuard` 继续唯一拥有 published/anomaly/cancellation 优先级；可信 status 2 可穿过 open cancellation intent，首次发布事实永久优先。
- 应用层只注入 `orderCancellationTransitions` 与 supplier adapter；已接通 production composition、typed IPC、preload、Renderer bridge、Media feature command owners 和订单页。

## 行为结果

- status 0 返回“取消订单”；status 1 返回“尝试取消”及 `CANCELLATION_MAY_BE_REJECTED`；2/4/9 不提供取消。
- 跨远端边界前原子保存 cancellation attempt identity、订单身份、revision、observation fingerprint 与 consumed confirmation token。
- 明确成功追加 `terminalObservationV1(CANCELLED)`；未发布时结束 paid target 并释放文章，已发布时只追加订单事实且保持永久冻结。
- 明确拒绝收口 intent、保留订单和活动目标；transport/protocol unknown 保留 open intent，禁止再次取消和自动重放。
- `prepareCancellationResolution` 只返回 `verified_cancelled | verified_active | inconclusive`；仅提供 `confirmCancellationSucceeded` 与 `confirmCancellationNotApplied` 两个证据绑定命令，inconclusive 不可收口。
- restart、stale preflight、相反 resolution、outcome transaction fault、published-during-cancellation 和同向重复命令均失败关闭；重复取消不再次调用 supplier。
- 订单 snapshot、报价、系统投稿标识码及 history 不被删除或改写；取消后的订单投影为“已取消”，不会回退成“待安排”。

## Primary Audit

Scope：Ticket 16 diff、唯一 owner/公开 capability、事务与持久事实、uncertain/restart/idempotency、published-first、typed IPC/Renderer 调用链。

Checked invariants：单一 history writer；单一 publication-success primitive；远端调用前 durable intent；unknown 不重试；published 永久优先；证据 fingerprint/token 绑定；composition 不注入完整 OperationalStore；无 Ticket 22/M03/23 或 legacy writer。

Findings：

1. `P1 / INTRODUCED_BY_CHANGE`：`CANCELLED` terminal 被旧 projection 显示为 status 0。Remediation：由 history owner 投影为 `cancelled`，同步订单筛选与 UI，新增公开回归断言。
2. `P1 / INTRODUCED_BY_CHANGE`：已完成 confirmation token 可重新跨过 supplier boundary。Remediation：intent 事务内将 preflight 标记 consumed；同向重复读取 durable outcome 幂等返回，supplier 调用保持一次。

Blocking findings 均已关闭；无 deferred P2/P3；未触发 escalation。

## Bounded Re-audit

复审仅覆盖上述两个 findings、修复 diff、取消成功/拒绝/unknown、restart/fault、published-first、order projection、Media feature 与 typed IPC。结果 `PASS`：两个 P1 已关闭，直接回归通过，无新 owner、schema 或远端副作用边界变化。

## 测试 evidence

- `node --test tests/article-lifecycle-ticket-16.test.js`：8/8 PASS。
- `node --test tests/article-lifecycle-ticket-16.test.js tests/order-list-projection.test.mjs tests/phase-06-media-feature.test.mjs tests/phase-06-media-typed-ipc.test.js`：30/30 PASS。
- `node --test tests/article-lifecycle-ticket-16.test.js tests/article-lifecycle-ticket-15.test.js tests/phase-06-media-typed-ipc.test.js`：37/37 PASS。
- `node --test tests/regular-platform-outcomes.test.js tests/phase-03-supplier-canonical-behavior.test.js tests/article-lifecycle-ticket-15.test.js tests/article-lifecycle-ticket-14.test.js tests/article-lifecycle-ticket-16.test.js tests/phase-06-media-typed-ipc.test.js`：83/83 PASS；包含原 Wave 6 closure 51/51 矩阵及 Ticket 14/15 直接不变量。
- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js`：35/35 PASS；131/131 production capabilities 由 TypeChecker symbol identity 闭合。
- Renderer：`npm run lint`、`npm run typecheck:strict`、`npm run build` PASS。
- 根包：`npm run lint` PASS；`git diff --check` PASS。
- `node --test tests/phase-02-migration.test.js`：4 PASS / 4 FAIL；失败数量、测试与根因均保持继承基线 `PUBLICATION_SUCCESS_WRITER_CLOSED`，Ticket 16 未恢复 legacy writer 或实施 Ticket 23。

环境：Windows；Node `v24.16.0`；npm `11.13.0`。

## Closure

Ticket 16：`COMPLETE`。Primary Audit：`PASS after remediation`。Bounded Re-audit：`PASS`。无 Ticket 16 blocker。

下一项仅为 Dependency-Resolution Lane 的 Ticket 22；必须从本 Ticket 最终 clean closure HEAD 在新的 Codex 线程重新 preflight。本线程不得启动 Ticket 22、M03 或 Ticket 23。
