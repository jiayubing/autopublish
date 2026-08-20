# Ticket 27-B — 当前运行期 uncertain 恢复

日期：2026-08-20

分支：`codex/第三阶段`

Base integration HEAD：`e03298ebc8a62377fbb93fb0b696971ecfe6e01d`

Implementation commit：`6b5f53375279b3178f75b3f53f17f800581b5d8e`（`fix(publication): recover runtime uncertain outcomes`）

## 完成范围

regular queue group orchestrator 在远端投稿已经调用且 adapter 已返回结果（或已被归类为 uncertain）后，如果 outcome 本地事务未能提交，会立即调用既有具名转换 `markOrphanedRegularAttemptUncertain`。恢复成功后，同一 attempt 在当前进程进入 durable `uncertain` / `manual_check`，派生一条 Attention，暂停该组并冻结文章。

恢复依赖被收窄为 composition 注入的单方法 capability；orchestrator 没有获得完整 `OperationalStore`。恢复不会再次调用 adapter、不会建立新 attempt，也不会写入旁路状态。若即时恢复也失败，会以独立安全诊断记录失败并重新抛出原 outcome 提交错误；原 `remote_call_started` 记录由既有启动恢复继续兜底。

## 回归覆盖

- 一次性 accepted outcome transaction fault：当前进程内收敛为 uncertain，出现一条 Attention，adapter 调用次数为 1。
- 同一 attempt 的重复 uncertain recovery：幂等，不会重放投稿。
- 即时恢复持续失败：保留原 outcome error；重启后只进行恢复，不调用 adapter，并收敛为 uncertain。
- 现有 regular outcome、FIFO/lease、startup no-replay 与 Attention 测试继续通过。

## 定向验证

在 `auto—publish`（Node `v24.16.0`、npm `11.13.0`）运行：

```text
node --check desktop/services/regular-queue-group-orchestrator.js
node --check desktop/composition/regular-queue-group-composition.js
node --test tests/regular-platform-outcomes.test.js tests/article-lifecycle-ticket-08.test.js tests/article-attention-query.test.js tests/regular-publication-evidence-contract.test.js tests/publication-failure-read-model.test.js tests/article-management-snapshot.test.js tests/ticket-25-b-lifecycle-acceptance.test.js tests/ticket-25-c-regular-platform-acceptance.test.js tests/article-lifecycle-ticket-22.test.js
npm run lint
git diff --check
```

结果：组合测试 `115 passed, 0 failed`；lint、语法检查与 `git diff --check` 通过。

测试只使用临时 SQLite、合成 adapter 和故障注入；未执行真实登录、投稿、付费、取消、迁移或其他外部副作用。

## Primary Audit 与 Bounded Re-audit

Scope：regular queue orchestrator、窄 recovery capability、regular outcome aggregate、startup recovery direct caller、Attention 派生和直接行为测试。

Checked invariants：remote boundary 后无 adapter replay、outcome failure 不伪装为明确远端失败、当前进程 durable uncertain、同 attempt 幂等、启动 recovery 兜底、late accepted first-wins、manual resolution stale fencing、没有第二 status writer 或完整 `OperationalStore` 注入。

Finding：`P1 INTRODUCED_BY_CHANGE`。初版即时恢复的重复调用会随真实时钟产生不同 `observedAt` fingerprint，并可能触发 `REGULAR_OUTCOME_CONFLICT`。修复将 orphaned recovery 的幂等判定收敛到 `recordTerminal` transaction 内，仅对同一具名 orphaned uncertainty 保留首条事实；递增时钟回归覆盖该场景。

Bounded Re-audit：仅复查该修复 diff、`markOrphanedRegularAttemptUncertain` 的直接调用方、first-wins/no-replay 矩阵和上述组合门禁。结论：`PASS`；未发现新的 P0/P1 或本 Ticket 阻塞 P2。

## Closure / 当前边界

27-B 已完成 Primary Audit、P1 remediation、Bounded Re-audit 与 implementation commit。变更直接提交在当前 integration branch `codex/第三阶段`，没有独立工作包分支可供额外 merge。27-C 现已满足前序 gate，但本次不自动开始；仍未执行真实登录、投稿、付费、取消、迁移或其他外部副作用。
