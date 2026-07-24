# 阶段02交接：SQLite运行状态存储

## 状态

- 状态：COMPLETE；里程碑 commit：当前 `HEAD`（`refactor(phase-02): complete operational store`）。
- 起点：`codex/refactor-program` / `7cab1c9aad167c7e2eca8f1dd2732124ba24a434`。
- 范围：所有验证均为 OS 临时目录中的合成 workspace；没有读取、复制、写入或迁移真实用户 workspace，也没有外部投稿、扣费、账号或网络调用。

## Schema v1、关系与 interface

`operations.db` 位于 `.autopublish/operations/`，以 foreign keys、WAL、`synchronous=FULL` 与 5 秒 busy timeout 打开。v1 表为 `schema_migrations`、`account_profiles`、`publication_records`、`publication_attempts`、`remote_evidence`、`recovery_intents`、`submission_batches`、`submission_items`、`remote_orders`、`post_processing_jobs`。

```text
publication_records 1--N publication_attempts 1--1 recovery_intents
                                      |--N remote_evidence
                                      |--N remote_orders
                                      |--N post_processing_jobs
submission_batches  1--N submission_items
```

`createOperationalStore` 不公开 database handle 或 CRUD。完整意图接口为 `reservePublicationTarget`、`commitRemoteOutcome`、`listActionableRecovery` / `deriveAttentionInput`、`createSubmissionBatch`、`claimSubmissionItem`、`updateSubmissionItem`、`attachRemoteOrderEvidence`、`claimPostProcessing`、`completePostProcessing`、`verify`、`backup`、`close`。publication aggregate `(articleId,targetKey)` 唯一；attempt/evidence/order/batch revision 均事务性 fail-closed；敏感正文、Cookie、API key、authorization 和绝对路径字段被拒绝。

## 写入所有权、WAL 与故障结果

- 运行期 writer 的内部 `runtime.lock` 使用 `wx` 与随机 token；同进程 Map 只是补充，真实 child process 互斥才是权威证据。第二 writer 返回稳定 `OPERATIONAL_WRITE_OWNER_EXISTS`。
- migration lease 为内部 `migration.lock`。运行期 writer 存在时 migration 返回 `MIGRATION_RUNTIME_OWNER_ACTIVE`；migration lease 存在时 writer 返回 `OPERATIONAL_MIGRATION_LEASE_ACTIVE`。二者均不向普通 caller 暴露锁管理接口。
- graceful close 后不同进程可接管。强杀后仅在原 DB 通过只读 schema、integrity/foreign-key 验证后才删除陈旧 runtime owner；已 commit 事实保留，commit 前强杀的 aggregate 可重新 reserve。关闭会 checkpoint WAL 并收敛可删除的 WAL/SHM。
- 故障覆盖：migration 的开始前、四类 scan、import、SQLite commit 前、verify、rename 前、rename 失败、rename 后；`SQLITE_FULL` 等价 commit seam、不可创建 operations 目录、损坏 DB、backup destination、重复 target/attempt/remote ID/batch revision。失败不写 legacy source、不覆盖既有 target、不产生可被应用视为正式的临时 DB；诊断/report 仅含相对 source、计数与 code。

## v1 migration 与合成链路

CLI：`node scripts/migrate-operational-store-v1.js --workspace <synthetic-workspace>` 为 dry-run；添加 `--execute` 才执行。它只支持显式调用，production startup 不自动创建或迁移 DB。

输入映射：

| Legacy 输入 | v1 映射 |
|---|---|
| `submission-records/publications/publication-*.json` | publication + latest attempt；普通平台为不可自动执行的 `legacy-unknown-account` |
| `submission-batches` / 兼容 batch JSON | submission batch + item payload identity |
| `.autopublish/input/**/*.submission.json` 与队列文件 | queued publication/attempt，校验内容 hash 与 batch identity |
| `submission-orders.jsonl` | media target、publication/attempt outcome 与 remote order evidence |

确定性 report 按类型记录输入 `files/records`，并记录 `mapped`、`duplicates`、`conflicts`、`corrupt`、`unknownAccounts`、`remoteIdMissing`、将创建的 `targets/attempts/batches/items/orders`、`manualItems` 和逐项诊断。缺 remote ID、未知账号、损坏、重复或归属冲突均明确人工处理，绝不猜测账号、identity、远端结果或归属。合成链路完成 dry-run → execute 到全新临时 DB → verify → backup → restore verifier → 再次 verify；publication/attempt/batch/item/sidecar-batch identity/order 关系均经计数和 foreign-key 验证，legacy hash 不变。

## 容量基线（Windows 11、Node 24.16.0、临时合成 fixture）

| 基线 | 建库/写入 | claim/update | close/reopen | DB 大小 | 查询计划 |
|---|---:|---:|---:|---:|---|
| 500 batch items | 38 ms | 764 ms | 11 ms | 319,488 bytes | `SEARCH ... USING INDEX sqlite_autoindex_submission_items_2 (batch_id=?)`；无全表 scan |
| 5,000 batch items | 170 ms | 13,253 ms | 21 ms | 1,986,560 bytes | 同上；无全表 scan |
| 10,000 publications | 8,482 ms | — | verify after close | 7,348,224 bytes | 10,000 actionable recovery，foreign-key check 通过 |

500/5,000 均覆盖 claim、revision update、过期 claim 重领、旧 revision 冲突拒绝和 reopen 后 verify；这是可复现基线，不是性能 SLA。

## 验证证据

| 命令 | 结果 |
|---|---|
| `npm run test:discover` | 182 test files，0 skip |
| `npm test` | 977/977 pass，0 fail，0 skip；串行约 285 s |
| `npm run test:auth` | 16/16 pass |
| `node --test tests/phase-02-*.test.js` | 15/15 pass，0 fail，0 skip；含 child process、故障、迁移和容量 |
| `npm run lint`、`npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge` | 全部通过 |
| `npm run build:renderer` | 通过，Vite 2,137 modules |
| `npm run format:check` | 通过；显式覆盖 Phase 02 script/store/tests |
| `npm run test:links` | 172/172 pass，0 skip；file symlink 与 directory junction 均可用 |
| `npm run test:packaging` | 33/33 pass |
| `npm audit --omit=dev --audit-level=high` | 通过，0 vulnerabilities |
| `npm run pack:smoke` | 通过，非签名 Windows `--dir` 制品 |
| `ELECTRON_RUN_AS_NODE=1 release-alpha/win-unpacked/鱼饼大王.exe -e <DatabaseSync :memory: probe>` | 通过，输出 `node:sqlite=ok` |

Renderer/worker 静态测试仍禁止导入 SQLite write adapter，`desktop/workspace-runtime.js` 仍不构造 OperationalStore；现有 JSON/JSONL production writer 未切换，未发生双写，也没有自动创建 `operations.db`。

## Phase 3 切换清单（仅清单，尚未执行）

| 旧 store/caller | Phase 3 应切至的事务 |
|---|---|
| `src/publication/publication-ledger.js` / `publication-ledger-store.js` | reserve intent、commit outcome、recovery query |
| `src/content/submission-batch-store.js` | create/claim/update submission batch item |
| `src/content/submission-export-service.js` | queue export 前 reserve；sidecar 只保留内容事实，不再作为运行期权威状态 |
| `src/platforms/media/submission-order-store.js`、`desktop/services/media-order-service.js` | attach remote order evidence 与 evidence query |
| `desktop/workspace-runtime.js` 的旧 publication/content submission 组装 | 仅在 Phase 3 由唯一 PublicationWorkflow 组合根注入 OperationalStore |

Phase 3 仍为 `NOT_STARTED`；本阶段里程碑已固化，下一任务可将其标为 READY 后开始。剩余人工风险仅是正式用户副本迁移必须另行获得隔离路径授权；本阶段不请求也不执行。
