# Ticket 25-E — Migration / Recovery Acceptance Handoff

**状态：** `PACKAGE_COMPLETE`（仅 25-E package evidence closure；不代表 Ticket 25 / Wave 11 `COMPLETE`）
**记录时间：** 2026-08-12（Asia/Shanghai）

## 范围与停止边界

本包只验证隔离 synthetic legacy source、副本 SQLite、fake/in-memory composition 和现有公开 migration seams。没有读取或改写生产数据库，没有远端请求、真实登录、发布、付费、订单查询/取消、供应商 adapter、图片上传或 push。

本包在 25-E package closure 后停止。下一串行包仍为 `25-F`，但本次 Goal 禁止进入 25-F/G、Ticket 25 independent combined audit、bounded closure re-audit、production smoke、Wave 11 final closure 或任何真实外部验收。

## Git、worktree 与调度预检

- Base integration commit：`ccc87d830f8170294bd389b05ab904c473a00cd2`；当前 worktree 为 `C:\Users\violet\.codex\worktrees\8560\官媒投稿-refactor`，最终保持 detached HEAD，没有夺取 `codex/article-lifecycle-submission`。
- 工具 worktree 初始实际为 clean detached `814ad92d6576ccd8c66208b1b813da438e0cb9d1`，不是合同基线；切换前 `git status --porcelain` 为空，已记录差异后安全切到精确 `ccc87d8`，未覆盖用户改动。
- 当前主任务 worktree `F:\官媒投稿-refactor` 的 `codex/article-lifecycle-submission` 在预检时指向 `ccc87d8`。25-A/B/C/D implementation 与 integration commits 均经 `git merge-base --is-ancestor` 核验在 base 祖先链：A `dde5dfa` / `3ce0eb3`、B `bd3b9b1` / `750c41d`、C `e925dbf` / `c645fe1`、D `45244e5` / `d2ce21f`。
- `git status --porcelain=v2 --branch`、staged/unstaged diff、`git worktree list --porcelain`、`git submodule status` 和 nested `.git` 扫描已复核；最终 clean，未发现 nested repository/submodule 或已有 25-E branch/worktree/handoff。未创建新线程，未使用 spawn/subagent；source thread reference 为 `019ff1af-f015-7111-8af5-7fcb7003ad3c`。
- 直接调度 gate：25-0、24、Maintenance 10.5 和 25-A/B/C/D 均已集成到 base，Wave Plan 明确当前最左包为 25-E；未分析、实现或预建 25-F/G。

## 变更与真实 owner

Implementation commit：`de07190ffcf25a0fce48bcb087827f394194e37d` — `test: cover Ticket 25-E migration recovery acceptance`。

Matrix/evidence docs commit：`33657f217a2bc4edbc5dcbce5d5f9835204d497a` — `docs: record Ticket 25-E migration evidence`。

Handoff-only docs commit：本文件所在的最终 handoff-only commit，由最终 Git 检查返回；该 hash 不在自身内容中自引用。

唯一新增测试是 `auto—publish/tests/ticket-25-e-migration-acceptance.test.js`。没有修改生产源码、schema、IPC、bridge、Renderer、adapter 或 composition owner。行为链复用了：

- `createLegacyMigrationPlanner`：只读 dry-run/确定性计划与数量/阻断报告；
- `createOperationalStoreMigrationFacade`：唯一 `importLifecycleFacts`、journal metadata 和 import commit owner；
- `createWorkspaceMigrationGate` / `createWorkspaceMigrationComposition`：唯一 phase/recovery/正常 composition 放行策略；
- `createWorkspaceMigrationBackup`、`createWorkspaceMigrationVerifier` 和正常公开 `createOperationalStore` fact/read ports。

测试没有创建 acceptance-owned store、writer、state machine、manifest、schema 旁路或远端 capability。

## E 行为与故障证据

E 专项测试在 implementation commit 上为 `7/7 PASS`，最终 clean docs HEAD 的 E/23/migration 组合命令为 `93/93 PASS`，覆盖：

1. six `ImportPlanV1` variants、dry-run 确定性、逐类数量、成功优先级，以及历史投稿正文/提交时间/首次发布时间/图片摘要不可得时保持 `null` 和明确 `missingReasons`；
2. multiple target、missing order、identity/content conflict、deletion/recovery conflict 的既有 23-B planner evidence，并由 E test 验证 attention/conflict 结果；
3. 递归缺字段、extra field、未知 variant、future version、重复 article identity 和 store boundary 的恶意 plan 拒绝；拒绝后 journal 仍为 `confirmed`，没有导入部分事实；
4. 六 variant atomic import 后通过正常公开事实读取验证：发布/订单/迁移 attention 可见，`submissionItems=0`、`listActionableRecovery().length=0`、普通 queue=0、paid batch=0；没有 runnable queue、open remote intent 或 executable paid batch；
5. importer faults：`before-facts`、首个 `after-entry`、`before-journal-commit`、`after-journal-commit` 全部 rollback 到 `confirmed` 且无部分事实；`after-commit` 持久为 `import_committed`，重开后只返回 idempotent import，不重复写入；
6. durable journal crash points：`before/after-detected`、`before/after-backup`、`before/after-backed-up`、`before/after-confirmed`、`before/after-import`、`before/after-verification`、`before/after-verified` 共 14 个点逐一注入；每次恢复最终为 `verified`，journal 数量为 1，执行组仍 `executionGroupsPaused=true`；
7. synthetic backup verify/restore：把已验证的 `operations.db`（及存在的 WAL）复制到隔离恢复副本，用 `verifyOperationalDatabase` 与公开 store 读取验证 schema/fact；128 条 synthetic pre-remote queue entries 导入通过，导入后仍无 queue/paid batch；
8. `import_committed` / 当前 schema 但 verification unresolved 的 startup 结果保持阻断，正常 workspace composition 未构造；放行结果仍明确保持执行组暂停。

## 实际命令与结果

环境：Windows `win32/x64`，Node `v24.16.0`，npm `11.13.0`；依赖安装仅使用 `npm ci --ignore-scripts --no-audit --no-fund`（`auto—publish` 与 `auto—publish/media-workbench`），没有启动外部服务。

候选盘点阶段首次运行 23-A～D 因 worktree 未安装 `@noble/hashes` 失败；安装依赖后同一命令 `36/36 PASS`。扩展候选第一次为 `64/67 PASS`，剩余 3 项均为缺少 `media-workbench/node_modules/typescript` 的环境加载错误；补齐前端依赖后直接重跑为 `7/7 PASS`（Phase 08 cleanup、24-E absence、24-G legacy boundary）。这些失败均为依赖环境，不是产品行为失败。

最终在 clean docs HEAD `33657f217a2bc4edbc5dcbce5d5f9835204d497a` 实际运行：

```text
node --test --test-concurrency=1 tests/ticket-25-e-migration-acceptance.test.js tests/article-lifecycle-ticket-23-a.test.js tests/article-lifecycle-ticket-23-b.test.js tests/article-lifecycle-ticket-23-c.test.js tests/article-lifecycle-ticket-23-d.test.js tests/phase-02-migration.test.js tests/phase-02-operational-store.test.js tests/phase-03-composition.test.js tests/phase-04-operational-store-lifecycle.test.js tests/phase-08-operational-store-internals.test.js tests/ticket-24-e-absence.test.js tests/ticket-24-g-legacy-boundary.test.js
PASS: 93/93, 0 failed/skipped/cancelled

npm run test:ticket-25-a -- --output build/evidence/ticket-25-a-contract.json
PASS: tracked contracts valid; 85 stories, 95 rows, 21 state cases, 10 deferred image rows, 15 tracked artifacts; sourceState=CLEAN; externalOperations=none; credentials=not-collected; sensitiveValues=excluded

npm run test:discover
PASS: 254 test files discovered

npm run lint
PASS

npm run format:check
PASS

git diff --check
PASS
```

`build/evidence/ticket-25-a-contract.json` 是 ignored generated contract evidence，未提交；它绑定 clean docs commit `33657f2`。所有 E temporary workspace、backup、restore copy 和 synthetic facts 均在测试结束后删除；未提交 build/evidence、日志、缓存或 node_modules。

## Matrix、evidence 与 sourceState

- 继续沿用唯一 `.scratch/article-lifecycle-and-submission/acceptance/25-a-state-matrix.json`，保持 21 cases 和既有 A-D evidence；仅为原先未覆盖的 `first-success-after-previous-failure` case 增加 `25-E` package evidence，绑定 `de07190ffcf25a0fce48bcb087827f394194e37d` 与 E test。
- `.scratch/article-lifecycle-and-submission/acceptance/25-a-evidence-manifest.json` 只新增 `ticket-25-e-migration-acceptance` tracked test，tracked artifact count 从 14 增至 15；没有创建第二份 manifest。
- `25-a-story-matrix.json` 的 85 stories/95 rows、所有 A-D rows、两个 `USER_CONTROLLED_REQUIRED` rows 和全部 10 个 `DEFERRED_IMAGE_EXTENSION` rows 未改；当前 matrix 没有独立 25-E story row，因此没有为了 E 新增 story 或改写已有 image/public user-control 状态。
- `25-a-query-scan-budget.json` 未改。E 的 128-entry capacity 是 migration import synthetic capacity evidence，不是 25-F query/scan benchmark，也不发明 wall-clock threshold。
- E 的行为 sourceState 绑定 implementation commit `de07190f`；contract/discovery/lint/format/diff evidence 绑定最终 clean docs HEAD `33657f2`。两者之间只有 tracked evidence docs 变化，没有生产行为 owner 漂移。

## 未运行、残余风险与外部边界

- 未运行完整 `npm test`、25-F query/scan benchmark、25-G full gate、production packaging smoke、Renderer/Preload build、independent combined audit、bounded closure re-audit 或 Wave 11 final clean smoke；这些明确不属于本包或本次 Goal 停止范围。
- 所有自动化结果均为 synthetic/in-memory/isolated-copy。`USER_EXTERNAL_ACCEPTANCE_REQUIRED` 没有新增 E 项；25-D 原有 `user-control:website-media-order-status-refresh` 仍需未来用户明确授权，E 未执行也未改写该状态。
- 历史不可得内容/时间/图片摘要只记录为不可得，不用当前文章正文、迁移执行时间或空图片列表冒充历史事实；图片 extension rows 仍后置。
- 后续包仍是 `25-F`，但本次执行在 E package closure 后停止，不预建、不分析、不实现 F/G。

## 禁止外部操作确认

本包未执行且不得由本 handoff 推断已执行：真实账号登录、平台投稿/公开页面轮询、供应商 HTTP、真实订单创建/刷新/取消/申诉、付费、生产数据库读写/迁移、真实图片上传、发布打包 smoke、push、merge 到主任务 branch 或 Ticket 25/Wave 11 COMPLETE 状态更新。
