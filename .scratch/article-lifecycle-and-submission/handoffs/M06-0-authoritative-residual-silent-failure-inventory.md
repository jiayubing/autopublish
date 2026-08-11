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
