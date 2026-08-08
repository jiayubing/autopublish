# 23-D — Workspace gate and isolated migration composition handoff

## 状态

`COMPLETE`。23-D production implementation、定向验证、implementation commit 与 closure documentation 已闭合。按 umbrella Ticket 合同，Primary Audit 由 23-E 对 23-A–D 最终组合 diff 统一执行；本工作未进入 23-E，Wave 6–9 与 M03 状态未回填。

## Git / provenance

- Base integration commit: `bde9c4c6a69cff82f4d5673612b9c2e7c2804ee6`
- Branch: `codex/article-lifecycle-submission`
- 启动时工作树与暂存区：clean
- Implementation commit: `d26588f` (`feat(migration): add workspace migration gate`)
- Closure/docs commit: 包含本 handoff、Wave Plan 与 Ticket 状态更新的后续提交

## Owner 与公开接缝

- Workspace Migration Gate Owner：`desktop/services/workspace-migration-gate.js`
  - 唯一拥有 `detected → backed_up → confirmed → import_committed → verified` 恢复策略、确认 fingerprint、正常 composition 放行和显式 repair outcome。
  - 只接收 journal metadata ports、单方法 `{ importLifecycleFacts }`、backup port 与 verifier port；不持有完整 OperationalStore 或远端 capability。
- Backup / integrity tool：`desktop/services/workspace-migration-backup.js`
  - 在 OperationalStore facade 打开前保存 `operations.db` 与未 checkpoint 的 `operations.db-wal`，manifest 绑定 workspace/source/plan/run identity，并逐文件校验 hash。
  - restart 优先复用已验证的 pre-open artifact；损坏 artifact 不静默复用，`backed_up` phase 会创建并持久授权新的 repair artifact。
- Post-import verifier：`desktop/services/workspace-migration-verifier.js`
  - 通过 23-C public readback 比对完整 imported entries，并通过 public OperationalStore verifier 校验 schema/integrity；生成稳定 verification fingerprint，不拥有 gate policy。
- OperationalStore metadata inspection：公共 facade 只新增只读 `inspectOperationalStoreMigrationJournals`；SQL 和 table knowledge 位于 `internal/operational-store-migration-journal-inspector.js`，未泄露到外部 caller。
- Isolated migration root：`desktop/composition/workspace-migration-composition.js`
  - 仅装配 23-B planner/reader、backup、journal metadata ports、单方法 importer 和 verifier；facade 在 run 结束后关闭。
- Startup gate：`desktop/composition/workspace-startup-composition.js` 在正常 `workspace-runtime-composition` 之前执行 gate；blocked 时正常 root 不被调用，因此 publisher、queue worker、paid executor、订单查询/取消与供应商 adapter 均不会被构造。

持久化 writer 数量仍为 1：23-C 的 `importLifecycleFacts`。23-D gate 只能通过 OperationalStore metadata CAS port 授权 journal transition，不写 lifecycle facts，也没有第二套 publication/order/queue writer。

## 实现与恢复语义

- 空计划只有在不存在 durable migration journal 时才能返回 `not_required`；schema 当前或当前重读为空不能绕过旧 journal。workspace/source/plan/version 不匹配时返回 `MIGRATION_JOURNAL_FINGERPRINT_MISMATCH` 并继续阻断正常 composition。
- `detected` 创建/复用完整备份；`backed_up` 校验 artifact 并返回绑定 backup/plan 的显式 confirmation fingerprint；只有 fingerprint 完全匹配才进入 `confirmed`。
- `confirmed` 只调用一次 23-C `importLifecycleFacts`。`import_committed` restart 只执行 post-import verifier，不重复 import；`verified` restart 再校验 durable imported facts、schema、backup 与 verification fingerprint 后才放行。
- corrupt/unplanned legacy evidence、备份失败、确认不匹配、import 失败、验证失败及 journal mismatch 均返回稳定 blocked result 和最小 repair kind；不包含绝对路径、原始正文、数据库行或供应商异常。
- gate 放行结果固定 `executionGroupsPaused=true`；它只允许进入既有正常 startup policy，不自行启动任何执行组。
- crash hooks 覆盖 detected、backup、backed_up、confirmed、import、verification、verified 的每个 before/after 边界。

## 改动文件

- `auto—publish/desktop/services/workspace-migration-gate.js`
- `auto—publish/desktop/services/workspace-migration-backup.js`
- `auto—publish/desktop/services/workspace-migration-verifier.js`
- `auto—publish/desktop/composition/workspace-migration-composition.js`
- `auto—publish/desktop/composition/workspace-startup-composition.js`
- `auto—publish/desktop/workspace-runtime.js`
- `auto—publish/src/infrastructure/operational-store/operational-store.js`
- `auto—publish/src/infrastructure/operational-store/internal/operational-store-migration-journal-inspector.js`
- `auto—publish/tests/article-lifecycle-ticket-23-d.test.js`
- `auto—publish/tests/workspace-runtime-lifecycle.test.js`（3 个旧夹具补建真实空 workspace）
- 本 handoff、Wave Plan 与 Ticket 23 实时状态

新增 production 模块按 gate policy、backup、verifier、migration composition、startup boundary 与 OperationalStore internal inspection 六个职责拆分；没有为缩短文件制造同义 wrapper，也没有修改 reader/planner/ImportPlanV1/六 variant/online owner。

## 实际验证

- `node --test tests/article-lifecycle-ticket-23-a.test.js tests/article-lifecycle-ticket-23-b.test.js tests/article-lifecycle-ticket-23-c.test.js tests/article-lifecycle-ticket-23-d.test.js tests/workspace-runtime-lifecycle.test.js tests/phase-08-operational-store-internals.test.js tests/phase-02-operational-store.test.js tests/phase-03-operational-store-v3.test.js tests/phase-04-operational-store-lifecycle.test.js`
  - PASS，75/75。
- 23-D matrix 覆盖：所有 gate before/after crash boundary、真实 planner→pre-open DB+WAL backup→journal→atomic importer→verifier→verified restart、损坏备份 repair、verification failure、unresolved evidence、空计划/旧 journal mismatch、blocked root 不构造正常/远端 composition。
- `npx eslint <23-D changed production/tests>`：PASS。
- `npm run typecheck:main`：PASS。
- `npx prettier --check <23-D changed production/tests>`：PASS。
- `npm run test:discover`：PASS；发现 267 个 test files，包含 `tests/article-lifecycle-ticket-23-d.test.js`。
- `npm run test:migration`：61/65 PASS，4 FAIL；失败数量、测试与根因均与 Wave Plan inherited blocker 完全相同：`tests/phase-02-migration.test.js` 旧脚本仍调用已关闭的 `commitRemoteOutcome(published)`，返回 `PUBLICATION_SUCCESS_WRITER_CLOSED`。

## 未运行 / 已知 evidence

- 未运行完整 `npm test`：23-D Manual Dispatch 与 umbrella 合同不要求；23-E final combined audit/closure 后才进入对应完整 gate。
- 扩大直接回归时单独运行 `tests/phase-03-composition.test.js` 暴露 1 个既有断言仍期望 schema v4、当前 23-C HEAD 已为 schema v5（`5 !== 4`）。分类为 `EXPOSED_PREEXISTING / PROCESS_EVIDENCE_GAP`，23-D 未修改 schema，也不在本工作包顺手改旧 Phase 3 合同测试；23-E 应按 combined audit 判定其 owner/处置。
- 未执行 Primary Audit、finding remediation 或 bounded re-audit：Ticket 23 umbrella 合同固定由 23-E 对 23-A–D 最终组合 diff 执行一次。
- 未 merge、push；未使用真实账号、网络、发布、付费或生产数据。

## 下一动作

下一串行工作包仅为 23-E：对 23-A–D 最终组合 diff 执行一次 Primary Audit，修复 blocking findings 后只做 bounded re-audit，并运行 Ticket 23 最终专项矩阵。不得提前进入 Ticket 24，也不得提前回填 Wave 6–9 或 M03 `COMPLETE`。
