# 23-C — OperationalStore journal and atomic import handoff

## 状态

`COMPLETE`。23-C production implementation、定向验证、implementation commit 与 closure documentation 已闭合。按 umbrella Ticket 合同，23-A–D 不重复开启独立 Primary Audit；23-E 对最终组合 diff 执行一次 Primary Audit。未进入 23-D/23-E，未提前回填 Wave 6–9 或 M03 `COMPLETE`。

## Git / provenance

- Base integration commit: `1dd6c8cf7683323d945260d3f3fcfcb625e5b156`
- Branch: `codex/article-lifecycle-submission`
- Implementation commit: `b7f1d9e` (`feat(migration): add atomic lifecycle fact import`)
- Closure/docs commit: 包含本 handoff、Wave Plan 与 Ticket 状态更新的提交
- 启动时工作树：clean

## 实现边界

- OperationalStore schema 正式升级为 v5，新增 durable migration journal、import entry provenance 与跨 import 唯一 order identity 约束；v4→v5 migration、verify、backup/dry-run contract 同步闭合。
- 新增公共 `createOperationalStoreMigrationFacade`，只暴露 journal bootstrap/read/CAS metadata persistence、唯一 `importLifecycleFacts`、imported-fact readback 与 `close`；不暴露 database、SQL、table 或 transaction primitive。
- `importLifecycleFacts` 每次重新调用 23-A `parseImportPlanV1`，再独立校验 journal/fingerprint、已有文章事实、已有/历史导入订单身份和 durable committed entry 集合。
- 六种 variant 在一个 SQLite transaction 内写入：可信发布、可追踪订单、封闭目标、迁移冲突/删除冲突 provenance、import commit fingerprint、schema version 与 `phase=import_committed`。任何 transaction fault 均回滚全部事实和 journal mutation。
- `publishedEvidence` 与 `trackablePaidOrder` 复用既有 publication/order/active-target tables；封闭目标不保留 active target；迁移 conflict 通过正常 lifecycle fact query 投影为 attention。
- 所有 variant 均不创建 submission item、queue item、paid batch 或可执行远端任务；没有恢复 `commitRemoteOutcome(published)`，没有新增在线 publication-success primitive。
- `after-commit` crash 保留 `import_committed`，重启或 durable `verified` 后重复调用均校验 committed facts 并幂等返回，不重复 import。

## 未实施（保持 23-D / 23-E owner）

- 未建立 workspace gate、backup integrity、confirmation policy、post-import verifier 或正常 composition 放行。
- 未装配 migration composition root，也未改 publisher/worker/paid executor/vendor adapter composition。
- 未执行 23-E final combined Primary Audit、remediation、bounded re-audit、完整 Ticket gate 或 Wave 6–9/M03 reconciliation。

## 实际验证

- `node --test tests/article-lifecycle-ticket-23-a.test.js tests/article-lifecycle-ticket-23-b.test.js tests/article-lifecycle-ticket-23-c.test.js tests/phase-02-operational-store.test.js tests/phase-03-operational-store-v3.test.js tests/phase-04-operational-store-lifecycle.test.js tests/phase-08-operational-store-internals.test.js`
  - PASS，57/57（后续新增 verified-idempotency 与 v5 order identity table 后，直接受影响集合再次运行 44/44 PASS）。
- `npx eslint <23-C changed production/tests>`
  - PASS。
- `npm run typecheck:main`
  - PASS。
- `npx prettier --check <23-C changed production/tests>`
  - PASS。
- `npm run test:discover`
  - PASS；发现 266 个 test files，包含 `tests/article-lifecycle-ticket-23-c.test.js`。
- `npm run test:migration`
  - 61/65 PASS，4 FAIL；failure 数量、测试与根因均与 Wave Plan 登记的 inherited blocker 相同：`tests/phase-02-migration.test.js` 旧脚本仍调用已关闭的 `commitRemoteOutcome(published)`，返回 `PUBLICATION_SUCCESS_WRITER_CLOSED`。23-C 未修改该旧脚本或为其增加 compatibility writer。

## 下一动作

先由集成 owner 检查当前 diff、完成 23-C 所需 integration/commit evidence；随后只能按 Wave Plan 串行进入 23-D。23-D 不得把 facade metadata persistence 解释为 journal transition policy owner；正常 composition 放行仍必须由 Workspace Migration Gate Owner 独占。23-E 才执行 23-A–D final combined audit/closure。
