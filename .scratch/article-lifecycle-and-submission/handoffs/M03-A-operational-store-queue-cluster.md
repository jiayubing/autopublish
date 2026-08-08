# M03-A — OperationalStore queue cluster

日期：2026-08-08

Base integration state：`3ebda26`（`docs: map M03 core ownership contracts`）

Implementation commit：`b0ec480`（`refactor: split operational queue ownership`）

执行模式：Manual Dispatch。本文记录 M03-A implementation 与定向验证；未执行 Primary Audit、finding remediation、bounded re-audit、merge、M03-B 或 M03-C。

## 1. 范围与结果

本工作包只重组 `OperationalStore` queue cluster：

- `operational-store-queue-aggregate.js` 保留为唯一 internal composer，并显式固定原有 20 方法 surface；
- `operational-store-regular-queue-runtime.js` 集中 queue group/item、pause/run intent、claim/renew、remote-start 与 snapshot；
- `operational-store-queue-admission-transaction.js` 集中 regular admit/remove、paid admit、直接 paid batch persistence，以及共享的 active-target 排他、幂等和原子 transaction 规则。

没有修改 `operational-store.js`、named transition ports、composition 或直接调用方；没有新增 public capability、publication-success writer、active-target writer、migration writer、schema、表或兼容层。Ticket 23 migration seam 仍只经过未来 public OperationalStore capability，本次没有实现任何 import API。

## 2. Before / after 与 owner

Before：`operational-store-queue-aggregate.js` 1,896 行，同时包含 regular queue runtime 与 shared admission transaction 两组变化原因。

After：

- composer：35 行，只装配并显式映射既有 internal aggregate surface；
- regular queue runtime：753 行；
- shared admission transaction：1,179 行。

owner 数量保持不变：regular queue runtime 一个、shared admission transaction 一个。regular/paid admission 仍在同一模块消费同一 `context.transaction`，并在同一 SQLite transaction 内检查/写入 `article_active_targets`；没有把 active-target admission 委托给另一 aggregate 或跨 transaction choreography。

迁移前后两组函数体在统一换行后逐段比较完全一致：runtime `26,198` 字符，admission `38,886` 字符。格式化只改变文件排版；SQL、错误码、fault point、状态顺序和返回 DTO 未重写。

## 3. Public contract 与直接调用方

`createOperationalStore()` frozen facade 的 62 个 key 未变；queue 相关 legacy/paid facade 方法未增加、删除或改名。全部 named transition port shape 未变，ArticleMutationCoordinator surface 未变。

直接调用方继续只理解原 capability：

- regular queue application 通过 coordinator 做 admission/removal；
- regular queue group orchestrator 只消费八个 group transitions；
- paid media preflight 只消费 coordinator 的 `admitPaidBatch`；
- workspace composition 仍只装配 `operational-store-queue-aggregate.js`，不知道新 internal 文件、SQL、表或 transaction choreography。

## 4. 实际验证

环境：Windows；Node `v24.16.0`；npm `11.13.0`。

1. `node --test tests/article-lifecycle-ticket-08.test.js tests/phase-07-regular-queue.test.js tests/phase-08-publication-submission-orchestration.test.js tests/phase-12-paid-media-preflight.test.js`
   - 68 tests；68 PASS，0 FAIL。
   - 覆盖 queue group FIFO/pause/run/startup pause、claim/renew/stale、remote-start fault rollback/restart、regular/paid admission、重复调用、目标冲突、partial/fault rollback、regular-vs-paid 竞态和直接调用方。
2. `node --test tests/phase-04-operational-store-lifecycle.test.js tests/regular-platform-outcomes.test.js`
   - 32 tests；32 PASS，0 FAIL。
   - 覆盖 legacy frozen facade、paid confirmation snapshot、active-target database exclusion 和 regular outcome 直接组合回归。
3. `node --test tests/phase-08-operational-store-internals.test.js tests/article-lifecycle-ticket-08.test.js tests/phase-07-regular-queue.test.js tests/phase-12-paid-media-preflight.test.js tests/article-mutation-coordinator.test.js tests/article-lifecycle-ticket-16.test.js tests/article-lifecycle-ticket-22.test.js`
   - 89 tests；87 PASS，2 FAIL。
   - 失败仍是 M03-0 已登记的两项 M03-C 静态测试债务：facade 行数阈值，以及 internal import 手工 allow-list。新 runtime/admission 对 `operational-store-utils` 的合法 internal import 被同一 allow-list 缺陷列出；没有新增失败测试或行为根因。按合同由 M03-C 改成 boundary-based 规则，本工作包不提前修改该测试。
4. `npx eslint`（三个 M03-A production 文件）
   - PASS。
5. `npx prettier --check --end-of-line auto`（三个 M03-A production 文件）
   - PASS。
6. 三文件 `node --check` 与 `git diff --check`
   - PASS。

未运行完整 `npm test`：M03-A Manual Dispatch 和 Maintenance 合同只要求定向 gate；完整最终 gate 属于 M03-C/final clean integration HEAD。四个 `phase-02-migration` inherited failures 未在本工作包重跑或修改。

## 5. 边界与下一动作

本记录只证明 M03-A implementation 与定向 gate。Implementation 已进入 `b0ec480`，Wave Plan/M03 状态不提前回填。下一次得到串行调度后可从包含本工作包的 integration state 进入 M03-B；Primary Audit 仍按 Maintenance 合同对 M03-A/B 最终组合 diff 在 M03-C 执行一次。
