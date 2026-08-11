# M06-0 — Authoritative Residual Silent Failure Inventory

> 基线：`8bded8134bd70998c8cc91b7e24617a588cdaad8`；日期：2026-08-11。本文与 `maintenance/M06-0-catch-inventory.mjs` 共同构成 M06 后续 A–G 的唯一 inventory/scope 真源。源码、测试、schema、运行脚本与真实外部状态均未修改。

## 1. 结论

M06 保留用户提出的 owner/failure-domain 边界，不按 catch 数量机械均分：

`M06-0 → A → B → C → D → E → F → G`

- A：OperationalStore / workspace / state persistence / cleanup
- B：content / file persistence / lifecycle
- C：remote / process / platform runtime
- D：optional probe / parse / diagnostics / IPC / Renderer
- E：auth / security
- F：operator / release / migration scripts
- G：combined audit + M06 closure；重新核对 inventory、失败语义、关键故障注入和最终 clean-HEAD 完整测试，关闭 Maintenance 10.5

不再拆 C 或 F。真实 inventory 显示，同一 adapter/script 内常同时拥有 parse、process cleanup、远端 outcome 或 operator result；按语句形状再拆会让同一 owner/file 跨包并制造重复修改。A–F 的高优先级复核量已在 18–45 项之间，无需按总 catch 数量追求表面平均。

Ticket 25 不属于 M06，本 inventory 和后续 A–G 均不得启动 Ticket 25。

## 2. 扫描口径与可复现证据

扫描根：

- `auto—publish/src`
- `auto—publish/desktop`
- `auto—publish/media-workbench/src`
- `auto—publish/auth-server/src`
- `auto—publish/scripts`
- `auto—publish/auth-server/scripts`

扩展名：`.js`、`.cjs`、`.mjs`、`.ts`、`.tsx`。排除 tests、`node_modules`、dist/build/coverage、vendor 与生成物。AST 同时识别 `try/catch` 和内联 Promise `.catch(handler)`，不把字符串、注释或测试 fixture 中的 `catch` 当生产命中。

复现命令：

```powershell
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs
```

基线结果：505 个生产/正式脚本文件完成解析，276 个文件包含 catch/rejection handler，共 1,099 项；TypeScript AST parse diagnostics 为 0。其中 1,057 个 `catch` clause、42 个内联 Promise `.catch`。

## 3. 全量 census 与分类

分类是失败处理形状，不直接等于最终 disposition：

- `PROPAGATE_OR_RETHROW`：catch 内显式 throw；408 项。
- `DIAGNOSTIC`：catch 内显式安全诊断/报告；104 项。
- `RETURN_OR_FALLBACK`：显式返回稳定结果、fallback 或 optional probe 值；245 项。
- `SIDE_EFFECT_OR_MAPPING`：通过调用映射 UI/状态/outcome 或执行 cleanup；120 项。
- `ASSIGNMENT_MAPPING`：赋值后由外层返回/推进显式结果；55 项。
- `EMPTY`：空 block、仅注释，或空 Promise handler；148 项。
- `OTHER`：主要是 `.catch(() => undefined/null/false)`、`continue` 与条件 fall-through；19 项。

| 包       |    文件 | 全部 catch | propagate | diagnostic | return/fallback | side-effect/mapping | assignment |   empty |  other |
| -------- | ------: | ---------: | --------: | ---------: | --------------: | ------------------: | ---------: | ------: | -----: |
| A        |      44 |        192 |        95 |         11 |              43 |                   5 |         17 |      21 |      0 |
| B        |      48 |        270 |       132 |         29 |              39 |                  27 |          9 |      34 |      0 |
| C        |      67 |        241 |        57 |         18 |              93 |                  22 |         17 |      32 |      2 |
| D        |      54 |        182 |        46 |          1 |              43 |                  50 |          5 |      23 |     14 |
| E        |      21 |         76 |        34 |          3 |              13 |                  10 |          3 |      12 |      1 |
| F        |      42 |        138 |        44 |         42 |              14 |                   6 |          4 |      26 |      2 |
| **总计** | **276** |  **1,099** |   **408** |    **104** |         **245** |             **120** |     **55** | **148** | **19** |

### Disposition 规则

1. 408 个显式传播项和 104 个显式 diagnostic 项默认不是 residual silent failure；后续包只在直接调用链证明其会泄密、覆盖主错误或伪装成功时修改。
2. 245 个 return/fallback、120 个 side-effect/mapping、55 个 assignment mapping 均已纳入对应 owner 包；它们必须通过公开返回值、状态投影或调用方测试证明失败对调用方可见。形状分类不能自动证明语义正确。
3. 148 个 `EMPTY` 全部是显式 disposition 必查项；不得仅添加 `console.log`。
4. 19 个 `OTHER` 全部是显式 disposition 必查项。auth password mismatch 的 `false` 与 paid precheck stable error 可能是合法 fail-closed/mapping；Renderer fire-and-forget、queue refresh suppression、packaged-entry `continue` 等不能仅凭 fallback 形状保留。
5. 额外按 mutation/cleanup/process/security 关键词识别了 136 个 no-throw/no-diagnostic 高风险项。与 `EMPTY`/`OTHER` 去重后，高优先级复核集共 217 项：A=34、B=45、C=44、D=43、E=18、F=33。该集合只决定复核优先级，不是“其余 882 项自动安全”的白名单。

## 4. 高优先级复核集（217）

以下行号绑定基线 HEAD。后续包修改后必须重跑 AST inventory，以新的行号和 disposition ledger 对账。

### A（34）

- `desktop/ai-provider-config-store.js`: 111
- `desktop/application-identity.js`: 69
- `desktop/device-identity-store.js`: 54
- `desktop/platform-provider-config-store.js`: 159
- `desktop/runtime-config-store.js`: 133, 154
- `desktop/runtime-config.js`: 166, 234, 255
- `desktop/services/platform-account-binding-store.js`: 81
- `desktop/services/platform-task-state-store.js`: 82, 92, 99
- `desktop/services/storage-maintenance-service.js`: 231, 285
- `desktop/services/submission-operation-staging.js`: 221
- `desktop/workspace-bootstrap-service.js`: 216, 334, 351, 524
- `desktop/workspace-location-store.js`: 23, 165
- `desktop/workspace-validator.js`: 164, 177
- `src/infrastructure/operational-store/internal/operational-store-owner-lease.js`: 25, 74, 201, 205, 221
- `src/infrastructure/operational-store/internal/operational-store-recovery-guard.js`: 39, 52, 55
- `src/infrastructure/operational-store/internal/operational-store-runtime.js`: 72
- `src/infrastructure/operational-store/internal/operational-store-transaction.js`: 11

初始语义：`platform-task-state-store` 的 snapshot read/write、workspace/state save 与 migration/verification fallback 是 persistence，不得静默；rollback/close/temp cleanup 可以保留 best-effort，但 cleanup failure 不得覆盖主错误，且 lease/lock 未释放必须具备安全可观察语义。M02 点名的 `submission-operation-staging.js:221` 继续属于 A。

### B（45）

- `desktop/ai-provider-test-status-store.js`: 70
- `desktop/services/ai-content-service.js`: 128, 137, 143
- `desktop/services/ai-provider-service.js`: 131
- `desktop/services/article-attention-query.js`: 118, 133, 146
- `desktop/services/content-generation-batch-service.js`: 192, 214, 379, 484, 491
- `desktop/services/doubao-collection-service.js`: 53, 98, 109
- `src/content/article-file-transaction.js`: 235, 617
- `src/content/article-lock.js`: 82, 96
- `src/content/article-removal-recovery-scheduler.js`: 20
- `src/content/article-removal-service.js`: 68
- `src/content/article-removal-state.js`: 93
- `src/content/article-removal-transaction-store.js`: 104, 127, 133, 136, 149, 154
- `src/content/article-store.js`: 249
- `src/content/client-material-store.js`: 210
- `src/content/content-file-transaction.js`: 57
- `src/content/doubao-browser-adapter.js`: 174, 178, 189
- `src/content/doubao-collection-queue.js`: 88
- `src/content/generation-batch-file-store.js`: 218
- `src/content/generation-batch-runner.js`: 88
- `src/content/legacy-migration-planner.js`: 559, 570, 593
- `src/content/question-store.js`: 214, 219
- `src/core/files.js`: 122, 204

初始语义：article removal/generation batch/AI test status 的持久化与 recovery 不得伪装成功；`article-attention-query` 不得把存储异常投影成“文章不存在/无事实”；listener/invalidation hook 可隔离消费者失败，但必须明确不改变唯一业务事实，并使用安全诊断或显式 best-effort port。

### C（44）

- `desktop/runtime-paths.js`: 3
- `desktop/services/desktop-task-service.js`: 52, 208, 210, 326
- `desktop/services/paid-media-batch-orchestrator.js`: 166
- `desktop/services/platform-settings/hepan-settings-adapter.js`: 117, 141, 264, 266, 280, 282, 300, 309, 310, 318
- `desktop/services/platform-settings/media-risk-confirmation-adapter.js`: 40, 50
- `desktop/services/platform-workbench-application.js`: 43
- `desktop/services/platform-workbench/command-preparer.js`: 208
- `desktop/services/platform-workbench/queue-reader.js`: 243
- `desktop/services/publication-submission-orchestrator.js`: 145
- `desktop/services/regular-queue-group-orchestrator.js`: 193
- `desktop/services/runtime-browser-smoke.js`: 106
- `desktop/services/worker-publisher.js`: 74
- `desktop/worker/run-task.js`: 91
- `src/core/stop-signal.js`: 21, 40
- `src/platforms/hepan/adapter.js`: 71, 86, 136, 227, 339, 347, 356, 364
- `src/platforms/lieju/adapter.js`: 108, 409
- `src/platforms/media/media-draft-store.js`: 118
- `src/platforms/media/media-resource-store.js`: 112
- `src/platforms/media/media-transport.js`: 158
- `src/platforms/shared/browser-session-lifecycle.js`: 86
- `src/platforms/toutiao/adapter.js`: 116, 213

初始语义：已发出的远端请求必须区分明确失败、成功和 uncertain；parse failure 不得把 unknown outcome 提升为 accepted/success；process kill/browser close/abort 可 best-effort，但超时与残留进程必须安全可诊断；stop/pause signal 删除失败不能静默声称控制已生效。platform file stores 的 delete 仍属于 C owner，不迁到 A，避免同一 adapter owner 跨包。

### D（43）

- `desktop/ipc/content-generation-batch-ipc.js`: 189
- `desktop/ipc/contracts/registry.js`: 583
- `desktop/ipc/register.js`: 132, 137, 187
- `desktop/ipc/workspace-bootstrap-ipc.js`: 150
- `desktop/main.js`: 96, 405, 411
- `desktop/services/runtime-diagnostics-probes.js`: 32, 42
- `desktop/services/runtime-diagnostics-service.js`: 201, 206
- `media-workbench/src/bridge/content.ts`: 284, 296
- `media-workbench/src/components/article-editor-session.js`: 29, 70
- `media-workbench/src/components/ArticleEditor.tsx`: 109, 127
- `media-workbench/src/components/AuthGate.tsx`: 86
- `media-workbench/src/components/content/ArticleAttentionPanel.tsx`: 115
- `media-workbench/src/components/content/GeneratedArticleEditorPanel.tsx`: 76, 87
- `media-workbench/src/components/content/QuestionCollectionView.tsx`: 192
- `media-workbench/src/components/ContentWorkbench.tsx`: 170
- `media-workbench/src/components/OrdersView.tsx`: 160
- `media-workbench/src/features/generation/use-generation-feature.ts`: 46
- `media-workbench/src/features/media/media-feature.js`: 678
- `media-workbench/src/features/platform/platform-feature-context.tsx`: 66, 67, 68
- `media-workbench/src/features/platform/platform-feature.js`: 211, 278, 295, 436, 471
- `media-workbench/src/features/workspace/workspace-coordinator-context.tsx`: 56
- `src/diagnostics/diagnostic-file-sink.js`: 103, 116, 119
- `src/diagnostics/diagnostic-producer.js`: 24
- `src/diagnostics/diagnostic-projection.js`: 51
- `src/diagnostics/runtime-diagnostic-snapshot.js`: 79

初始语义：optional parse/probe 必须显式产出 `null`/result/fallback，且调用方知道它是不完整 observation；IPC/renderer fire-and-forget 不能无痕丢失用户操作或刷新失败；diagnostic sink 自身失败可 best-effort，但不得递归记录或泄露敏感正文，应通过 sanitized counter/status/allowlisted metadata 暴露；listener isolation 不得中断其他 listener。

### E（18）

- `auth-server/src/auth-backup-orchestrator.js`: 62
- `auth-server/src/auth-database-verifier.js`: 226
- `auth-server/src/auth-domain.js`: 209
- `auth-server/src/auth-migration-guard.js`: 110
- `auth-server/src/auth-recovery-check.js`: 43, 46, 58, 61
- `auth-server/src/domain/auth-password-policy.js`: 143
- `auth-server/src/health/integrity-runner.js`: 84
- `auth-server/src/health/sqlite-integrity-check.js`: 41
- `auth-server/src/health/sqlite-integrity-worker.js`: 59
- `auth-server/src/recovery-fixtures.js`: 115, 122
- `auth-server/src/repositories/sqlite-auth-repository.js`: 92, 105
- `desktop/services/auth-service.js`: 211, 224

初始语义：password verification 的 `false` 是 fail-closed 候选，需保持 timing/security contract；audit write、backup/recovery、migration rollback 与 repository close 不能产生假成功。保留“cleanup 不覆盖原安全错误”时仍需 sanitized diagnostic，不记录 token、密码、source fingerprint 原值、数据库行或请求正文。

### F（33）

- `scripts/migrate-content-library-v2.js`: 411, 435, 1022
- `scripts/migrate-content-metadata-v1.js`: 98, 598, 736, 859, 890, 943, 1016
- `scripts/migrate-operational-store-v1.js`: 27, 54, 558, 603, 620, 624, 630
- `scripts/offline-smoke-checks.js`: 239
- `scripts/offline-smoke-runtime.js`: 92
- `scripts/prepare-runtime-tools.js`: 16, 19, 20, 72, 76, 77, 132, 161, 163
- `scripts/verify-legacy-absence.js`: 131
- `scripts/verify-link-capability.js`: 42
- `scripts/verify-packaged-playwright-runtime.js`: 70, 163
- `scripts/verify-phase-08-gates.js`: 551

初始语义：migration 的 `NEEDS_REPAIR` 写入、lock/lease release、rollback 与 operator exit result 不得静默；release/runtime preparation 中 version/commit/dirty state 获取失败必须显式标记 unavailable 或 fail closed，不得生成看似完整的 provenance；package verifier 跳过不可读 entry 不能产生 false PASS。纯临时文件清理可 best-effort，但主结果需先确定且 cleanup failure 不覆盖它。

## 5. A–F 实施合同

每包都必须：

1. 以本 inventory 的该包全部 catch 为范围，以 217 高优先级集合为 review-first；不得只改空 catch 数量。
2. 为每个保留的 no-throw/no-diagnostic catch 登记 `EXPLICIT_OUTCOME`、`BEST_EFFORT_CLEANUP`、`OPTIONAL_PROBE_PARSE`、`LISTENER_ISOLATION` 或 `FAIL_CLOSED`，并写出公开可观察语义。
3. persistence/security/remote/process 不得以 `EMPTY` disposition 结束；远端 unknown 不得自动 retry。
4. cleanup failure 不覆盖主错误；无主错误时，关键 lock/lease/state cleanup 失败不能伪装成功。
5. diagnostic 只能使用 allowlisted/sanitized metadata；不得记录 token、Cookie、请求头、敏感正文、数据库行或绝对敏感路径。
6. 修改 owner 后补最窄公开行为/故障注入测试，再跑直接调用链 gate。不得用源码 regex 证明业务语义。
7. 包结束时重跑 inventory，并提供 before/after：总 catch、各 shape、保留项、remediated 项及新增项；新增 catch 必须逐项解释。

## 6. G closure contract

G 只做 combined audit、blocking remediation、bounded re-audit 和 Maintenance 10.5 closure，不启动 Ticket 25。最低矩阵：

- persistence write/read/rollback/lock release failure；
- content file transaction/recovery failure；
- remote explicit failure / uncertain / process timeout / cleanup failure；
- optional parse malformed input 与 diagnostic sink failure；
- auth audit/repository/rollback cleanup failure；
- migration/operator/release evidence partial failure；
- cleanup failure 与主业务错误同时发生时，主错误不被覆盖；
- sensitive error metadata 不泄露。

G 必须在所有 remediation 进入最终 clean integration HEAD 后重跑 AST inventory、关键故障注入、完整 `npm test` 与合同要求的 auth/format/type/build gate；evidence 绑定精确 HEAD/sourceState/Node/命令/时间/结果。只有 G PASS 后，M06 与 Maintenance 10.5 才可标记 `COMPLETE`；随后停止，不自动启动 Ticket 25。

## 7. M06-0 验证与边界

- `node --check .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs`
- `node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary`
- AST parse diagnostics：0
- 本包未运行完整 `npm test`：inventory-only、无 production/test/schema/gate 行为变更；完整测试属于 G 的最终 clean-HEAD gate。
- 未执行真实登录、投稿、付费、取消、上传、生产数据库、打包、发布、push 或 Ticket 25。

## 10. M06-G final authoritative reconciliation

本节是 M06-G 对 A–F 全库 inventory 的最终对账；它不改变 M06-0 的扫描口径，也不把历史 handoff 当作实时调度真源。最终候选以 integration HEAD `b87028b98645f3fe3e34ae18abe1336034ac6d9e` 为 parent，在本隔离 worktree 中验证；最终 closure commit 的 parent 必须仍为该 hash。Node 为 `v24.16.0`，npm 为 `11.13.0`。所有外部/生产操作均未执行。

### 10.1 Final AST summary and package ledger

命令：

```powershell
node --check .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs
```

最终全库：`scannedFiles=505`、`filesWithCatches=274`、`catches=1151`、`parseDiagnostics=[]`（0）。A–F handler 文件互不重复且合计 274；handler 合计 1,151。

| package | files | handlers | propagate | diagnostic | return/fallback | side/mapping | assignment | EMPTY | OTHER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 44 | 197 | 104 | 40 | 31 | 5 | 17 | 0 | 0 |
| B | 47 | 282 | 140 | 74 | 26 | 26 | 10 | 6 | 0 |
| C | 67 | 254 | 71 | 20 | 93 | 52 | 13 | 4 | 1 |
| D | 54 | 190 | 48 | 28 | 50 | 53 | 11 | 0 | 0 |
| E | 20 | 77 | 32 | 3 | 15 | 20 | 7 | 0 | 0 |
| F | 42 | 151 | 54 | 42 | 16 | 21 | 18 | 0 | 0 |

This reconciles the final A/B/C/D/E/F handoffs exactly. A, D, E and F have no EMPTY/OTHER. B's six EMPTY items and C's four EMPTY plus one OTHER are listed and proven below; there is no unexplained residual.

### 10.2 Remaining EMPTY/OTHER proof

| package | record | final disposition / proof |
| --- | --- | --- |
| B | `src/content/doubao-browser-adapter.js:176,180,191` | optional artifact cleanup after the primary browser/content result; cleanup is best-effort and cannot replace the primary result |
| B | `src/content/legacy-migration-planner.js:559,570,593` | optional historical fingerprint/probe parse; malformed optional legacy evidence stays absent/unknown and never authorizes a write or success |
| C | `desktop/runtime-paths.js:3` | optional Electron capability import; non-Electron runtime keeps the optional capability absent |
| C | `desktop/services/paid-media-batch-orchestrator.js:166` | stable `PAID_ORDER_PRECHECK_FAILED` mapping; primary precheck failure remains visible |
| C | `desktop/services/platform-settings/hepan-settings-adapter.js:356` | malformed optional JSONL entry is ignored as an optional parse record, not treated as a valid remote fact |
| C | `desktop/services/platform-settings/media-risk-confirmation-adapter.js:50` | invalid optional endpoint is invalidated/no-op and cannot authorize a submission |
| C | `src/platforms/hepan/adapter.js:154` | optional JSONL parse failure is absent/unknown and cannot become accepted/success |

### 10.3 Combined audit and bounded re-audit

Primary Audit covered owner/public contract, failure propagation, primary-error preservation through cleanup, remote uncertain/manual-check semantics, idempotency/concurrency/lease/lock/rollback, provenance/evidence fail-closed behavior, sensitive diagnostics, unique writer/state-machine ownership and bypass absence. Findings were classified under the protocol:

| classification | severity | finding | disposition |
| --- | --- | --- | --- |
| `INTRODUCED_BY_CHANGE` | P1 | malformed migration lease JSON was mapped to `MIGRATION_LEASE_UNAVAILABLE`, while the existing contender contract requires `MIGRATION_LEASE_ACTIVE`; a contender never removed a lease it did not own | fixed in `scripts/migrate-operational-store-v1.js`; `SyntaxError → MIGRATION_LEASE_ACTIVE`, structured migration errors still propagate, unreadable I/O remains unavailable; direct regression and `npm run test:migration` pass |
| `EXPOSED_PREEXISTING` | P1 | typed renderer IPC `ipcError` kept safe text only in `Error.message`, so feature `safeError` lost the public `userMessage` and fell back to a generic message | fixed at the bridge owner by retaining `userMessage`; renderer media-refresh failure now exposes the safe contract text; affected 45/45 regression passes |
| `EXPOSED_PREEXISTING` | P2 | three renderer fixtures/assertions lagged current public capabilities/DTO/fallback contracts (`listRegularQueueGroups`, login observation, account-profile fallback) | bounded test-contract/fixture correction; no production bypass or weakened assertion; affected 45/45 passes |
| `CROSS_COMPONENT_INTERACTION` | P1 | release-evidence source-state hashing used `auto—publish/` while M06 closure documents are tracked at the Git top-level, producing a false provenance mismatch | fixed `currentSourceState` to resolve the Git top-level; release-evidence 10/10 and packaging 47/47 pass |
| `PROCESS_EVIDENCE_GAP` | P2 | an earlier 604-second full-run timeout was initially unclassified | resolved by process-tree timing: 249 files = 210 parallel + 39 serial; Phase 05 ~191s, production IPC ~284s, Phase 08 ~230s; runner children closed normally and the bounded 1,200-second run completed. No runner code change was needed |
| `EXPOSED_PREEXISTING` | P2 non-blocking | full development dependency audit reports the existing 5 vulnerability tree; production-only audit is clean | recorded to dependency owner; no manifest/lock upgrade in M06-G |

After remediation only a bounded re-audit was run: repaired lease/error-propagation paths, direct callers, affected renderer contracts, relevant invariants, and the final gates. No fresh unbounded full review was reopened.

### 10.4 Failure matrix and gate evidence

The combined matrix used synthetic/temp workspaces, fault injection and fake transports only:

| failure class | evidence |
| --- | --- |
| persistence read/write/rollback/lock/lease | M06-A/B tests; migration 67/67; capacity/lease regression; final root suite |
| content parse/rename/file cleanup/recovery | M06-B direct suite; links 189/189; final root suite |
| remote explicit failure / uncertain / manual check / no automatic retry | M06-C 209/209; final root suite and production IPC matrix |
| process timeout/stop/cleanup and primary-error preservation | M06-C 209/209; Phase 08 4/4; final root suite |
| optional parse/probe and diagnostic sink failure | diagnostics 37/37; M06-D 81/81; final root suite |
| auth audit/repository/rollback/cleanup | auth-server 63/63, including M06-E 9/9 |
| migration/operator/release/provenance partial failure | migration 67/67; packaging 47/47; local alpha smoke verifier PASS; provenance fail-closed tests |
| sensitive diagnostics | diagnostics, auth, IPC and final root suite; no raw token/Cookie/API key/password/body/database row/path accepted |

Final gate commands included auth-server full test, format check, lint, main/bridge/renderer typechecks, renderer/preload build, migration, links, diagnostics, production IPC/renderer/Phase 08/package gates, legacy absence, Ticket 24-E absence, dependency audits and the exact complete root `npm test` with the Electron focus gate explicitly enabled (`RUN_ELECTRON_FOCUS_TESTS=1`). The final handoff records actual post-commit exit codes/counts; a skipped test was never accepted as PASS.

### 10.5 Ownership / provenance boundary

`verify-phase-08-gates.js` reported `capabilityReachability=129/129`, `uniqueOwnersAndWriters=PASSED`, `dependencyDirection=PASSED`, `operationalStoreBoundary=PASSED`, `legacyAbsence=PASSED`, and `trackedGeneratedOutput=PASSED`; the publication owner remained `src/infrastructure/operational-store/operational-store.js`, the remote publisher owner remained `desktop/services/desktop-publisher-router.js`, and no second writer/state machine/compatibility path was introduced. Provenance and artifact gates fail closed when HEAD/sourceState/command/metadata are missing or unreadable.

M06-G changed only the M06 closure candidate and its direct regressions/evidence. No real login, publish, payment, upload, production database, migration, external account, push, release or Ticket 25 operation was performed.

## 8. M06-E authoritative reconciliation

本节是 M06-E 对本 inventory 的当前增量闭合记录；上文 M06-0 census 仍保留其历史基线语义，不覆盖 exact-parent 上已完成的 M06-A～D 代码。M06-E 严格从 integration parent `ed9f8ec48a315ab21d4ac2fdb45dfdacebab67a7` 开始，未执行真实账号、生产数据库、发布、付费或外部写操作。

### AST before/after

命令：`node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary`。扫描根、排除规则和 AST shape 定义未改变；最终 parse diagnostics 为 0。

| source state | scanned files | files with handlers | handlers | E files | E handlers | E shapes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| M06-E exact parent `ed9f8ec48a315ab21d4ac2fdb45dfdacebab67a7` | 505 | 275 | 1,137 | 21 | 76 | `PROPAGATE_OR_RETHROW=34`, `SIDE_EFFECT_OR_MAPPING=10`, `ASSIGNMENT_MAPPING=3`, `RETURN_OR_FALLBACK=13`, `DIAGNOSTIC=3`, `EMPTY=12`, `OTHER=1` |
| M06-E implementation tree before commit | 505 | 274 | 1,138 | 20 | 77 | `PROPAGATE_OR_RETHROW=32`, `SIDE_EFFECT_OR_MAPPING=20`, `ASSIGNMENT_MAPPING=7`, `RETURN_OR_FALLBACK=15`, `DIAGNOSTIC=3`, `EMPTY=0`, `OTHER=0` |

Reconciliation：E handler 数量净增 1，不是遗漏或机械补 catch。`sqlite-integrity-check.js:41` 的空 Promise rejection handler 被改成显式 worker termination outcome，因此该 AST handler 被移除；其余新增 2 个 side-effect/mapping、4 个 assignment mapping、2 个 return/fallback 与若干主错误保留/cleanup 分支均服务于 close/rollback/cleanup 可观察性、稳定 health mapping 或 auth-session outcome。E 全量 76 个 parent handlers 与最终 77 个 handlers 均已登记如下；优先清单的原始行号因上述修改发生位移，以当前 AST 行号为准。

### EMPTY / OTHER 清零证据

exact parent 的 12 个 `EMPTY` 与 1 个 `OTHER` 逐项闭合如下：

| parent row | original shape | final disposition |
| --- | --- | --- |
| `auth-database-verifier.js:226` | `EMPTY`，close catch 注释 preserve verification result | close failure 生成 `AUTH_DB_CLOSE_FAILED` 或给主错误追加 `cleanupCode`；当前 `SIDE_EFFECT_OR_MAPPING` |
| `auth-domain.js:209` | `EMPTY`，secondary device audit 注释 preserve stable domain error | 保留主错误并写入安全 `auditStatus=write_failed`；当前 `SIDE_EFFECT_OR_MAPPING` |
| `auth-migration-guard.js:110` | `EMPTY`，rollback 注释 preserve migration failure | rollback failure 写入 `AUTH_DB_ROLLBACK_FAILED`；当前 `SIDE_EFFECT_OR_MAPPING` |
| `auth-recovery-check.js:43` | `EMPTY`，isolation failure cleanup 注释 | 失败显式为 `AUTH_RESTORE_ISOLATION_FAILED` 并执行可观察 cleanup；当前 `SIDE_EFFECT_OR_MAPPING` |
| `auth-recovery-check.js:46` | `EMPTY`，source close 注释 preserve isolation result | source close failure 显式 outcome/cleanup code；当前 `SIDE_EFFECT_OR_MAPPING` |
| `auth-password-policy.js:143` | `OTHER`，password verifier `false` fallback | 编码、类型、参数和 scrypt failure 全部 fail-closed `false`；当前 `RETURN_OR_FALLBACK` |
| `integrity-runner.js:84` | `EMPTY`，already-aborted controller | abort failure 进入稳定 timeout/cancel outcome 的 `cleanupCode`；当前 `ASSIGNMENT_MAPPING` |
| `sqlite-integrity-check.js:41` | `EMPTY`，worker termination rejection | 保留原 timeout/cancel code，termination rejection 追加安全 cleanup code；该 handler 已移除，不再计入最终 AST |
| `sqlite-integrity-worker.js:59` | `EMPTY`，preserve check result | DB close failure 不再伪装 health success；当前 `SIDE_EFFECT_OR_MAPPING` |
| `recovery-fixtures.js:115` | `EMPTY`，repository cleanup | close failure 记录稳定 cleanup code；当前 `ASSIGNMENT_MAPPING` |
| `recovery-fixtures.js:122` | `EMPTY`，drill result cleanup | temp-root cleanup failure 记录稳定 cleanup code；当前 `ASSIGNMENT_MAPPING` |
| `sqlite-auth-repository.js:92` | `EMPTY`，constructor close fail-closed | close failure 追加安全 cleanup code，原初始化错误继续传播；当前 `SIDE_EFFECT_OR_MAPPING` |
| `sqlite-auth-repository.js:105` | `EMPTY`，transaction rollback | rollback failure 追加安全 cleanup code，原 transaction error 继续传播；当前 `SIDE_EFFECT_OR_MAPPING` |

### E full handler disposition ledger

以下缩写仅用于表格压缩：`PROPAGATE_PRIMARY`=主错误继续传播/在直接边界稳定映射；`EXPLICIT_OUTCOME`=稳定 code/result/fallback；`FAIL_CLOSED`=拒绝或不可用而不放行；`BEST_EFFORT_CLEANUP`=cleanup 尝试失败可附加安全 metadata 且不覆盖主错误；`CONTROLLED_DIAGNOSTIC`=allowlisted diagnostic；`LISTENER_ISOLATION`=隔离消费者失败。每个条目同时保留 authoritative AST shape、当前行号和 disposition。

| E owner/file | final AST row ledger (`line: SHAPE → disposition`) |
| --- | --- |
| `auth-server/src/auth-backup-orchestrator.js` | `26: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `32: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `45: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `58: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME`; `63: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP+EXPLICIT_OUTCOME`; `74: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME` |
| `auth-server/src/auth-database-verifier.js` | `125: PROPAGATE_OR_RETHROW → FAIL_CLOSED`; `128: PROPAGATE_OR_RETHROW → FAIL_CLOSED`; `194: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `200: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `218: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `235: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME`; `241: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP+EXPLICIT_OUTCOME` |
| `auth-server/src/auth-domain.js` | `203: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `222: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME+CONTROLLED_DIAGNOSTIC` |
| `auth-server/src/auth-migration-guard.js` | `28: PROPAGATE_OR_RETHROW → FAIL_CLOSED`; `113: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP`; `131: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `152: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY+BEST_EFFORT_CLEANUP` |
| `auth-server/src/auth-recovery-check.js` | `16: PROPAGATE_OR_RETHROW → FAIL_CLOSED`; `23: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `36: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `39: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME`; `41: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME`; `47: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP+EXPLICIT_OUTCOME`; `56: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP`; `72: ASSIGNMENT_MAPPING → EXPLICIT_OUTCOME`; `75: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP+EXPLICIT_OUTCOME` |
| `auth-server/src/domain/auth-password-policy.js` | `164: RETURN_OR_FALLBACK → FAIL_CLOSED` |
| `auth-server/src/health/http-health-handler.js` | `36: ASSIGNMENT_MAPPING → EXPLICIT_OUTCOME` |
| `auth-server/src/health/integrity-runner.js` | `63: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME`; `88: ASSIGNMENT_MAPPING → EXPLICIT_OUTCOME+BEST_EFFORT_CLEANUP` |
| `auth-server/src/health/liveness-probe.js` | `13: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME` |
| `auth-server/src/health/repository-probe.js` | `18: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME` |
| `auth-server/src/health/sqlite-integrity-worker.js` | `23: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `31: PROPAGATE_OR_RETHROW → FAIL_CLOSED`; `46: PROPAGATE_OR_RETHROW → FAIL_CLOSED`; `53: PROPAGATE_OR_RETHROW → FAIL_CLOSED`; `64: ASSIGNMENT_MAPPING → EXPLICIT_OUTCOME`; `70: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP+EXPLICIT_OUTCOME`; `83: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME` |
| `auth-server/src/recovery-fixtures.js` | `36: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `90: ASSIGNMENT_MAPPING → EXPLICIT_OUTCOME`; `112: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `120: ASSIGNMENT_MAPPING → BEST_EFFORT_CLEANUP`; `127: ASSIGNMENT_MAPPING → BEST_EFFORT_CLEANUP+EXPLICIT_OUTCOME` |
| `auth-server/src/repositories/in-memory-auth-repository.js` | `22: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY` |
| `auth-server/src/repositories/sqlite-auth-repository.js` | `92: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `96: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP`; `111: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `114: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP` |
| `auth-server/src/security/proxy-config-adapter.js` | `50: PROPAGATE_OR_RETHROW → FAIL_CLOSED` |
| `auth-server/src/security/source-resolver.js` | `86: RETURN_OR_FALLBACK → FAIL_CLOSED` |
| `auth-server/src/server.js` | `115: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME`; `176: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME`; `315: DIAGNOSTIC → CONTROLLED_DIAGNOSTIC`; `359: DIAGNOSTIC → CONTROLLED_DIAGNOSTIC` |
| `desktop/ipc/auth-ipc.js` | `38: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME`; `50: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME`; `62: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME`; `71: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME`; `79: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME` |
| `desktop/services/auth-service.js` | `62: DIAGNOSTIC → CONTROLLED_DIAGNOSTIC`; `140: SIDE_EFFECT_OR_MAPPING → LISTENER_ISOLATION`; `181: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME+CONTROLLED_DIAGNOSTIC`; `207: PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME`; `211: SIDE_EFFECT_OR_MAPPING → BEST_EFFORT_CLEANUP+CONTROLLED_DIAGNOSTIC`; `225: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME+CONTROLLED_DIAGNOSTIC`; `271: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME+CONTROLLED_DIAGNOSTIC`; `287: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME+CONTROLLED_DIAGNOSTIC`; `405: PROPAGATE_OR_RETHROW → FAIL_CLOSED`; `437: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `485: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `514: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY`; `548: RETURN_OR_FALLBACK → EXPLICIT_OUTCOME+CONTROLLED_DIAGNOSTIC`; `579: SIDE_EFFECT_OR_MAPPING → EXPLICIT_OUTCOME+CONTROLLED_DIAGNOSTIC` |
| `desktop/services/authenticated-runtime.js` | `20: PROPAGATE_OR_RETHROW → PROPAGATE_PRIMARY` |

总数核对：表内 `PROPAGATE_OR_RETHROW=32`、`SIDE_EFFECT_OR_MAPPING=20`、`ASSIGNMENT_MAPPING=7`、`RETURN_OR_FALLBACK=15`、`DIAGNOSTIC=3`，合计 77；与 AST summary 一致。E 的 18 项 priority set 全部落入以上 ledger，未只处理 priority rows。

## 9. M06-F authoritative reconciliation

本节为 M06-F 的最终 inventory 增量；F 严格从 integration parent `2c3e97d57c32316b214ce8cbfc1f2281a4f1a0dd` 开始，未执行真实发布、生产迁移、生产数据库、真实账号、付费、push、release 或其他外部写操作。`M06-F-operator-release-migration-scripts-cleanup.md` 是本包实现、测试、审计和 handoff evidence；本节保留 authoritative AST 对账与全量 F disposition。

### AST before/after

命令：

```powershell
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary
```

扫描根、扩展名、排除规则与 shape 定义未改变，两个状态均为 parse diagnostics `[]`。

| source state | scanned files | files with handlers | all handlers | F files | F handlers | F shapes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| exact parent `2c3e97d57c32316b214ce8cbfc1f2281a4f1a0dd` | 505 | 274 | 1,138 | 42 | 138 | `DIAGNOSTIC=42`, `ASSIGNMENT_MAPPING=4`, `RETURN_OR_FALLBACK=14`, `PROPAGATE_OR_RETHROW=44`, `SIDE_EFFECT_OR_MAPPING=6`, `EMPTY=26`, `OTHER=2` |
| F implementation tree before docs/commit | 505 | 274 | 1,151 | 42 | 151 | `DIAGNOSTIC=42`, `ASSIGNMENT_MAPPING=18`, `RETURN_OR_FALLBACK=16`, `PROPAGATE_OR_RETHROW=54`, `SIDE_EFFECT_OR_MAPPING=21`, `EMPTY=0`, `OTHER=0` |

当前全库 package reconciliation 为：A `44/197`、B `47/282`、C `67/254`、D `54/190`、E `20/77`、F `42/151`（格式均为 files/handlers）；全库为 `505/274/1,151`。F 净增 13 个 handler 仅来自 `migrate-content-metadata-v1.js` (+3)、`migrate-operational-store-v1.js` (+2)、`offline-smoke-checks.js` (+1)、`verify-alpha-package.js` (+3)、`verify-packaged-docx-runtime.js` (+2)、`verify-packaged-playwright-runtime.js` (+2)，均是主错误保留、稳定 outcome、受控 cleanup 或 fail-closed provenance/package evidence 分支；没有新增 writer、第二状态机、schema 或兼容旁路。

### Baseline EMPTY / OTHER 清零证据

exact parent 的 26 个 `EMPTY` 与 2 个 `OTHER` 逐项如下。每一行对应一个 parent AST handler；右列是当前实现的公开语义与最终 shape，未用增加日志替代失败处理。

| parent handler | parent shape | F disposition / final result |
| --- | --- | --- |
| `scripts/migrate-content-library-v2.js:411` | `EMPTY` | temporary unlink 是 best-effort，但 cleanup failure 现在进入 `MIGRATION_TEMP_CLEANUP_FAILED` 且不覆盖主错误；非 EMPTY |
| `scripts/migrate-content-library-v2.js:435` | `EMPTY` | 同上，atomic copy temporary cleanup 显式保留 cleanup outcome；非 EMPTY |
| `scripts/migrate-content-library-v2.js:1022` | `EMPTY` | 同上，per-record temporary cleanup 显式保留 cleanup outcome；非 EMPTY |
| `scripts/migrate-content-metadata-v1.js:98` | `EMPTY` | temporary unlink 进入 `CONTENT_METADATA_TEMP_CLEANUP_FAILED`，主错误优先；非 EMPTY |
| `scripts/migrate-content-metadata-v1.js:598` | `EMPTY` | `NEEDS_REPAIR` persistence failure 不再吞掉，进入 `CONTENT_METADATA_REPAIR_STATE_UNAVAILABLE`；非 EMPTY |
| `scripts/migrate-content-metadata-v1.js:1016` | `EMPTY` | installed-state probe 变为显式 repair/recovery evidence，不再把异常当作未安装；非 EMPTY |
| `scripts/migrate-operational-store-v1.js:54` | `EMPTY` | lease cleanup 校验 identity/token，失败保留安全 cleanup code，不删除 replacement lease；非 EMPTY |
| `scripts/migrate-operational-store-v1.js:558` | `EMPTY` | fd close 记录 cleanup status，保留 migration primary result；非 EMPTY |
| `scripts/migrate-operational-store-v1.js:603` | `EMPTY` | store close 记录 cleanup status，失败不伪装迁移成功；非 EMPTY |
| `scripts/migrate-operational-store-v1.js:620` | `EMPTY` | lock unlink failure 映射稳定 cleanup outcome；非 EMPTY |
| `scripts/migrate-operational-store-v1.js:624` | `EMPTY` | guarded lease cleanup 失败可诊断且不覆盖主错误；非 EMPTY |
| `scripts/migrate-operational-store-v1.js:630` | `EMPTY` | temporary suffix cleanup failure 显式保留；非 EMPTY |
| `scripts/offline-smoke-checks.js:239` | `EMPTY` | Hepan payload cleanup failure 进入 `OFFLINE_HEPAN_PAYLOAD_CLEANUP_FAILED`；非 EMPTY |
| `scripts/offline-smoke-runtime.js:92` | `EMPTY` | JSONL parse 失败返回 `parseFailed`/safe observation，调用方可见；非 EMPTY |
| `scripts/prepare-runtime-tools.js:16` | `EMPTY` | package version unreadable 时 `readBuildInfo` fail closed，不生成伪 provenance；非 EMPTY |
| `scripts/prepare-runtime-tools.js:19` | `EMPTY` | Git HEAD unreadable 时 fail closed，不回退到 fake commit；非 EMPTY |
| `scripts/prepare-runtime-tools.js:20` | `EMPTY` | dirty/source state unreadable 时 fail closed；非 EMPTY |
| `scripts/prepare-runtime-tools.js:72` | `EMPTY` | destination cleanup failure 记录稳定 runtime-tool cleanup code；非 EMPTY |
| `scripts/prepare-runtime-tools.js:76` | `EMPTY` | stream destroy failure 保留 primary download error；非 EMPTY |
| `scripts/prepare-runtime-tools.js:77` | `EMPTY` | destination unlink failure 不覆盖 primary download error；非 EMPTY |
| `scripts/prepare-runtime-tools.js:132` | `EMPTY` | download temporary cleanup failure 显式返回；非 EMPTY |
| `scripts/prepare-runtime-tools.js:161` | `EMPTY` | staging cleanup failure 显式返回且不伪装 install success；非 EMPTY |
| `scripts/prepare-runtime-tools.js:163` | `EMPTY` | extraction cleanup failure 显式返回且不覆盖 archive/install error；非 EMPTY |
| `scripts/verify-legacy-absence.js:131` | `OTHER` | archive entry unreadable 现在 fail closed 为 `LEGACY_ARCHIVE_ENTRY_UNAVAILABLE`，不再 `continue` 后 false PASS |
| `scripts/verify-link-capability.js:42` | `EMPTY` | temporary root cleanup status 进入 result，`--strict` 在 cleanup 未通过时失败；非 EMPTY |
| `scripts/verify-packaged-playwright-runtime.js:70` | `EMPTY` | static entry unreadable 进入 failed evidence，不再缺失/不可读即 PASS；非 EMPTY |
| `scripts/verify-packaged-playwright-runtime.js:163` | `EMPTY` | isolated CLI close failure 保留安全 cleanup code，不覆盖主 verifier result；非 EMPTY |
| `scripts/verify-phase-08-gates.js:551` | `OTHER` | package entry unreadable 形成 violation，不能通过 `continue` 隐藏；非 OTHER |

### F full handler disposition ledger

以下表格覆盖最终 AST 的全部 151 个 F handler，而非仅覆盖 33 个 priority handler。每个 `line: SHAPE` 是一个独立 authoritative AST 项；同一行的 disposition 对该项生效。`PROPAGATE_PRIMARY` 表示主错误继续传播或在 CLI 边界稳定映射；`EXPLICIT_OUTCOME` 表示稳定 code/result/partial/uncertain；`FAIL_CLOSED` 表示不可验证时拒绝通过；`BEST_EFFORT_CLEANUP` 表示 cleanup 失败可附加安全 metadata 但不得覆盖主错误；`CONTROLLED_DIAGNOSTIC` 表示 allowlisted/sanitized diagnostic；`OPTIONAL_PROBE_PARSE` 表示缺失、不可读或 malformed observation 对调用方显式可见。

| F owner/file | final AST handler ledger (`line: SHAPE`) | disposition |
| --- | --- | --- |
| `auth-server/scripts/admin.js` | `16: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；CLI 只输出 `AUTH_*` code 或 generic safe text |
| `auth-server/scripts/apctl.js` | `128: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；不输出原始异常 |
| `auth-server/scripts/authctl.js` | `208: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；不输出 token/cookie/key/path |
| `auth-server/scripts/backup-restore-evidence.js` | `92: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；backup/restore evidence 不可验证即拒绝 |
| `auth-server/scripts/backup.js` | `27: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；operator result 使用稳定 `AUTH_*` code |
| `auth-server/scripts/container-smoke.js` | `40: ASSIGNMENT_MAPPING`; `87: DIAGNOSTIC` | `EXPLICIT_OUTCOME + CONTROLLED_DIAGNOSTIC`；container smoke 失败不变成 healthy |
| `auth-server/scripts/create-test-summary-evidence.js` | `86: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；summary evidence 缺失不输出 PASS |
| `auth-server/scripts/integrity-check.js` | `108: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；完整性检查失败保持失败 |
| `auth-server/scripts/migrate.js` | `45: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；migration CLI 不输出 raw error |
| `auth-server/scripts/migration-roundtrip-evidence.js` | `101: ASSIGNMENT_MAPPING`; `162: DIAGNOSTIC` | `EXPLICIT_OUTCOME + FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；round-trip partial/uncertain 可见 |
| `auth-server/scripts/recovery-drill.js` | `31: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；recovery drill 不伪装成功 |
| `auth-server/scripts/restore-check.js` | `29: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；restore verification 不可读即拒绝 |
| `scripts/artifact-manifest-collector.js` | `19: RETURN_OR_FALLBACK`; `34: PROPAGATE_OR_RETHROW` | `OPTIONAL_PROBE_PARSE + PROPAGATE_PRIMARY`；artifact entry observation 显式区分缺失/失败 |
| `scripts/create-production-artifact-manifest.js` | `63: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；manifest 绑定实际 HEAD/sourceState/command |
| `scripts/create-release-evidence-manifest.js` | `114: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；不可验证 evidence 不得 PASS |
| `scripts/create-root-test-evidence.js` | `70: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；test result 只保留安全摘要 |
| `scripts/create-test-discovery-evidence.js` | `97: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；discovery failure 使用稳定 code |
| `scripts/create-test-inventory-evidence.js` | `48: PROPAGATE_OR_RETHROW`; `105: DIAGNOSTIC` | `PROPAGATE_PRIMARY + FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；inventory unreadable 不生成 evidence |
| `scripts/create-test-suite-evidence.js` | `104: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；suite evidence 不输出 fake PASS |
| `scripts/migrate-content-library-v2.js` | `182: RETURN_OR_FALLBACK`; `261: PROPAGATE_OR_RETHROW`; `428: ASSIGNMENT_MAPPING`; `461: ASSIGNMENT_MAPPING`; `472: PROPAGATE_OR_RETHROW`; `582: PROPAGATE_OR_RETHROW`; `752: SIDE_EFFECT_OR_MAPPING`; `1050: ASSIGNMENT_MAPPING`; `1126: PROPAGATE_OR_RETHROW`; `1329: DIAGNOSTIC` | `EXPLICIT_OUTCOME + PROPAGATE_PRIMARY + BEST_EFFORT_CLEANUP + FAIL_CLOSED`；目标冲突、rollback、manifest/completion provenance、cleanup 与 CLI code 均显式可见 |
| `scripts/migrate-content-metadata-v1.js` | `25: PROPAGATE_OR_RETHROW`; `97: ASSIGNMENT_MAPPING`; `103: ASSIGNMENT_MAPPING`; `129: PROPAGATE_OR_RETHROW`; `143: PROPAGATE_OR_RETHROW`; `301: DIAGNOSTIC`; `385: DIAGNOSTIC`; `500: PROPAGATE_OR_RETHROW`; `698: PROPAGATE_OR_RETHROW`; `789: SIDE_EFFECT_OR_MAPPING`; `880: PROPAGATE_OR_RETHROW`; `912: SIDE_EFFECT_OR_MAPPING`; `943: SIDE_EFFECT_OR_MAPPING`; `996: SIDE_EFFECT_OR_MAPPING`; `1059: PROPAGATE_OR_RETHROW`; `1070: ASSIGNMENT_MAPPING`; `1244: PROPAGATE_OR_RETHROW`; `1269: PROPAGATE_OR_RETHROW`; `1336: PROPAGATE_OR_RETHROW`; `1426: DIAGNOSTIC` | `EXPLICIT_OUTCOME + PROPAGATE_PRIMARY + BEST_EFFORT_CLEANUP + FAIL_CLOSED`；`NEEDS_REPAIR`、rollback、partial staging、recovery conflict 与 cleanup 保真 |
| `scripts/migrate-geo-data.js` | `36: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；legacy database 错误只输出 allowlisted code |
| `scripts/migrate-operational-store-v1.js` | `41: RETURN_OR_FALLBACK`; `57: PROPAGATE_OR_RETHROW`; `68: PROPAGATE_OR_RETHROW`; `90: PROPAGATE_OR_RETHROW`; `113: RETURN_OR_FALLBACK`; `128: PROPAGATE_OR_RETHROW`; `149: RETURN_OR_FALLBACK`; `225: PROPAGATE_OR_RETHROW`; `238: PROPAGATE_OR_RETHROW`; `316: DIAGNOSTIC`; `379: DIAGNOSTIC`; `446: DIAGNOSTIC`; `551: DIAGNOSTIC`; `639: PROPAGATE_OR_RETHROW`; `670: ASSIGNMENT_MAPPING`; `682: SIDE_EFFECT_OR_MAPPING`; `705: PROPAGATE_OR_RETHROW`; `738: ASSIGNMENT_MAPPING`; `744: SIDE_EFFECT_OR_MAPPING`; `754: SIDE_EFFECT_OR_MAPPING`; `773: SIDE_EFFECT_OR_MAPPING`; `793: SIDE_EFFECT_OR_MAPPING`; `832: DIAGNOSTIC` | `FAIL_CLOSED + EXPLICIT_OUTCOME + PROPAGATE_PRIMARY + BEST_EFFORT_CLEANUP`；lock/lease liveness、manual review、rollback、post-rename uncertain 与 operator action 保真 |
| `scripts/offline-self-test.js` | `60: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；offline result 不泄露绝对路径或原始异常 |
| `scripts/offline-smoke-checks.js` | `238: ASSIGNMENT_MAPPING`; `243: SIDE_EFFECT_OR_MAPPING`; `288: PROPAGATE_OR_RETHROW` | `EXPLICIT_OUTCOME + BEST_EFFORT_CLEANUP + PROPAGATE_PRIMARY`；payload cleanup 不覆盖 smoke primary |
| `scripts/offline-smoke-runtime.js` | `64: PROPAGATE_OR_RETHROW`; `94: ASSIGNMENT_MAPPING`; `118: RETURN_OR_FALLBACK`; `130: PROPAGATE_OR_RETHROW` | `OPTIONAL_PROBE_PARSE + EXPLICIT_OUTCOME + PROPAGATE_PRIMARY`；parseFailed/validator/runner outcome 可见 |
| `scripts/prepare-runtime-tools.js` | `41: PROPAGATE_OR_RETHROW`; `69: PROPAGATE_OR_RETHROW`; `107: RETURN_OR_FALLBACK`; `125: PROPAGATE_OR_RETHROW`; `169: PROPAGATE_OR_RETHROW`; `182: PROPAGATE_OR_RETHROW`; `258: SIDE_EFFECT_OR_MAPPING`; `316: PROPAGATE_OR_RETHROW`; `357: PROPAGATE_OR_RETHROW`; `396: SIDE_EFFECT_OR_MAPPING`; `456: PROPAGATE_OR_RETHROW`; `482: SIDE_EFFECT_OR_MAPPING`; `516: DIAGNOSTIC` | `FAIL_CLOSED + EXPLICIT_OUTCOME + PROPAGATE_PRIMARY + BEST_EFFORT_CLEANUP`；archive checksum、regular-file boundary、actual build provenance、install uncertain 与 cleanup 保真 |
| `scripts/release-evidence-inputs.js` | `89: PROPAGATE_OR_RETHROW`; `100: PROPAGATE_OR_RETHROW`; `206: PROPAGATE_OR_RETHROW`; `292: RETURN_OR_FALLBACK`; `344: SIDE_EFFECT_OR_MAPPING`; `365: RETURN_OR_FALLBACK` | `FAIL_CLOSED + EXPLICIT_OUTCOME`；缺少 execution provenance 的 PASSED report 降为 `PENDING_HUMAN`，artifact manifest 不可验证即拒绝 |
| `scripts/run-tests.js` | `543: DIAGNOSTIC` | `CONTROLLED_DIAGNOSTIC`；stream failure 只输出稳定 code |
| `scripts/test-inventory.js` | `3680: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；inventory evidence 失败不输出完整 PASS |
| `scripts/test-runner-policy.js` | `59: PROPAGATE_OR_RETHROW` | `FAIL_CLOSED + PROPAGATE_PRIMARY`；缺少 test source 进入稳定 `TEST_RUNNER_SOURCE_UNAVAILABLE` |
| `scripts/validate-release-checklist.js` | `200: PROPAGATE_OR_RETHROW`; `218: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；human gate 与 automated result 不混淆 |
| `scripts/verify-alpha-package.js` | `125: RETURN_OR_FALLBACK`; `134: RETURN_OR_FALLBACK`; `291: ASSIGNMENT_MAPPING`; `381: ASSIGNMENT_MAPPING`; `409: DIAGNOSTIC` | `FAIL_CLOSED + BEST_EFFORT_CLEANUP + CONTROLLED_DIAGNOSTIC`；package boundary、private entry 与 cleanup failure 不伪装通过 |
| `scripts/verify-legacy-absence.js` | `98: PROPAGATE_OR_RETHROW`; `131: PROPAGATE_OR_RETHROW`; `235: DIAGNOSTIC` | `FAIL_CLOSED + PROPAGATE_PRIMARY + CONTROLLED_DIAGNOSTIC`；source/archive unreadable 不继续扫描为 PASS |
| `scripts/verify-link-capability.js` | `32: ASSIGNMENT_MAPPING`; `38: ASSIGNMENT_MAPPING`; `43: ASSIGNMENT_MAPPING` | `EXPLICIT_OUTCOME + BEST_EFFORT_CLEANUP`；cleanup status 绑定 strict result |
| `scripts/verify-packaged-docx-runtime.js` | `148: SIDE_EFFECT_OR_MAPPING`; `166: SIDE_EFFECT_OR_MAPPING`; `174: SIDE_EFFECT_OR_MAPPING`; `193: DIAGNOSTIC` | `FAIL_CLOSED + BEST_EFFORT_CLEANUP + CONTROLLED_DIAGNOSTIC`；runtime/license/temp failure 保留主结果 |
| `scripts/verify-packaged-playwright-runtime.js` | `53: RETURN_OR_FALLBACK`; `72: RETURN_OR_FALLBACK`; `99: RETURN_OR_FALLBACK`; `137: PROPAGATE_OR_RETHROW`; `188: PROPAGATE_OR_RETHROW`; `256: PROPAGATE_OR_RETHROW`; `315: ASSIGNMENT_MAPPING`; `322: SIDE_EFFECT_OR_MAPPING`; `334: SIDE_EFFECT_OR_MAPPING`; `371: DIAGNOSTIC` | `FAIL_CLOSED + OPTIONAL_PROBE_PARSE + BEST_EFFORT_CLEANUP + CONTROLLED_DIAGNOSTIC`；unreadable entry、CLI close、temp cleanup 均不产生 fake PASS |
| `scripts/verify-phase-08-gates.js` | `401: PROPAGATE_OR_RETHROW`; `414: PROPAGATE_OR_RETHROW`; `551: SIDE_EFFECT_OR_MAPPING`; `599: PROPAGATE_OR_RETHROW`; `743: DIAGNOSTIC` | `FAIL_CLOSED + BEST_EFFORT_CLEANUP + CONTROLLED_DIAGNOSTIC`；package source/entry unreadable 为 violation |
| `scripts/verify-production-package.js` | `52: PROPAGATE_OR_RETHROW`; `65: RETURN_OR_FALLBACK`; `154: PROPAGATE_OR_RETHROW`; `232: DIAGNOSTIC` | `FAIL_CLOSED + OPTIONAL_PROBE_PARSE + CONTROLLED_DIAGNOSTIC`；production package 不完整即拒绝 |
| `scripts/verify-renderer-contract-absence.js` | `243: RETURN_OR_FALLBACK`; `262: PROPAGATE_OR_RETHROW`; `906: DIAGNOSTIC` | `FAIL_CLOSED + OPTIONAL_PROBE_PARSE + CONTROLLED_DIAGNOSTIC`；legacy contract absence 不可验证即失败 |
| `scripts/verify-ticket-24-e-absence.js` | `156: PROPAGATE_OR_RETHROW`; `173: PROPAGATE_OR_RETHROW`; `520: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；retired capability evidence 不可读即拒绝 |
| `scripts/workspace-manifest.js` | `58: PROPAGATE_OR_RETHROW`; `137: DIAGNOSTIC` | `FAIL_CLOSED + CONTROLLED_DIAGNOSTIC`；manifest unreadable 不输出完整结果 |

表内 handler 数量核对为 `DIAGNOSTIC=42`、`ASSIGNMENT_MAPPING=18`、`RETURN_OR_FALLBACK=16`、`PROPAGATE_OR_RETHROW=54`、`SIDE_EFFECT_OR_MAPPING=21`，合计 151；`EMPTY=0`、`OTHER=0`。F 的 33 项 priority set 全部在上述全量 ledger 中，未将非 priority handler 当作自动安全白名单。

## 11. Post-closure blocking remediation reconciliation

`696f5cff183632bd4700df96cb006da98504adf9` 后续 audit 暴露 queue reader 与 paid-media 的 blocking failure-semantics finding。本节只对 remediation 直接改变的 A/C handler 做增量对账，不重开 A～F fresh full review。

候选树命令：

```powershell
node --check .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary
```

结果为 `scannedFiles=505`、`filesWithCatches=274`、`catches=1154`、`parseDiagnostics=[]`。相对 `696f5cff` 的 1,151 handlers 净增 3；A 只发生 shape 收敛，C 新增 3 个显式主错误传播 handler。B/D/E/F 的 files/handler totals 均未变化。

| package | files | handlers | propagate | diagnostic | return/fallback | side/mapping | assignment | EMPTY | OTHER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 44 | 197 | 106 | 40 | 29 | 5 | 17 | 0 | 0 |
| B | 47 | 282 | 140 | 74 | 26 | 26 | 10 | 6 | 0 |
| C | 67 | 257 | 76 | 20 | 92 | 52 | 12 | 4 | 1 |
| D | 54 | 190 | 48 | 28 | 50 | 53 | 11 | 0 | 0 |
| E | 20 | 77 | 32 | 3 | 15 | 20 | 7 | 0 | 0 |
| F | 42 | 151 | 54 | 42 | 16 | 21 | 18 | 0 | 0 |

受影响 ledger：

- `desktop/composition/workspace-runtime-composition.js:203,726`：`PROPAGATE_OR_RETHROW → FAIL_CLOSED + EXPLICIT_ABSENCE`；只有 `PLATFORM_CONFIG_NOT_SET` 返回空配置，配置存储/解密/路径读取失败继续传播。
- `desktop/services/paid-media-preflight-service.js:289,523,540`：`PROPAGATE_OR_RETHROW → EXPLICIT_OUTCOME + PROPAGATE_PRIMARY`；preflight 使用 `PAID_MEDIA_ARTICLE_STATE_UNAVAILABLE` blocker，confirmation 的文章/配置读取失败保留稳定错误并复位本地 `inFlight`，未消费 token、未创建 admission fact。
- `desktop/services/platform-workbench/queue-reader.js:83,204,315`：`PROPAGATE_OR_RETHROW → EXPLICIT_ABSENCE + PROPAGATE_PRIMARY`；仅 `ENOENT` 代表真实缺失/并发消失，其他 primary/sidecar inspection failure 映射为 `PLATFORM_QUEUE_READ_FAILED`。
- `desktop/services/platform-workbench/queue-reader.js:103`：`RETURN_OR_FALLBACK → EXPLICIT_INVALID_INPUT`；JSON malformed 仍是 invalid sidecar，不与上面的 I/O inspection failure 竞争。

本增量没有新增 `EMPTY`/`OTHER`、writer、状态机、schema、compatibility path 或远端副作用。最终 post-commit clean-HEAD full gate evidence 尚未生成，因此本节当前只证明候选 AST reconciliation，不能单独恢复 M06=`COMPLETE`。
