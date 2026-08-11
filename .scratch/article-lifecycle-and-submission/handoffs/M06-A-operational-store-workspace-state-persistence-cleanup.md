# M06-A — OperationalStore / workspace / state persistence / cleanup

**Status:** `COMPLETE`；下一 gate `M06-B=READY`。M06 与 Maintenance 10.5 仍为 `PARTIAL`，Ticket 25 仍 `PENDING`/blocked。

## Scope and provenance

- 调度基线：integration HEAD `75ffac3ae9096f26fa45cb64d10e9ac83f40ec6b`（M06-0）；开始前 detached worktree HEAD 与该 SHA 完全一致。
- 工作树：`C:\Users\violet\.codex\worktrees\ee10\官媒投稿-refactor`；开始前暂存区、工作树、嵌套仓库均 clean，无重复同 owner worktree/thread 被创建或调度。
- integration worktree `F:\官媒投稿` 当时位于 `codex/article-lifecycle-submission` 且同为该基线；本任务未合并、未切换 integration、未 push。
- 事实真源：当前源码、测试、schema、Git 状态、M06-0 AST script；M06-0 历史 handoff 中旧 SHA 不覆盖本次真实基线。
- 未执行真实登录、投稿、付费、取消、上传、release 或生产数据库操作；依赖安装只写入忽略的 `node_modules`。

## Implementation

1. Config/device/application identity stores：temp/rollback/staging cleanup 失败只以 allowlisted、pathless diagnostic 记录，不覆盖原始持久化错误。
2. Runtime config and platform binding：legacy probe/parse 保留显式 fallback + diagnostic；损坏或不可读账号绑定不再被 `get` 当作不存在，改为稳定错误并 fail closed。
3. Platform task state：interrupted snapshot restore、atomic snapshot persist、temporary cleanup 与 listener isolation 都有显式 safe diagnostic；增加真实 `fs/path` fault-injection seam，内存状态与持久恢复 marker 语义分离。
4. Storage/submission cleanup：scan failure 有 pathless diagnostic，ENOENT 仍是空目录/竞态的明确 probe outcome；投稿源文章状态与 published archive attention 读取失败不再返回 `false/[]` 伪装为无残留，改为稳定错误；operation staging root cleanup failure 明确返回 `CONTENT_SUBMISSION_QUEUE_STAGE_CLEANUP_FAILED`。
5. OperationalStore：malformed/unsafe lock 不再按缺失处理；owner liveness 的未知错误、lease release、recovery guard rollback/close、transaction rollback、database close/owner release 均 fail closed 或附 cleanup code，且主业务错误优先保留。runtime close 在 owner release 失败时保持可重试，不删除 active owner 事实；facade construction cleanup 不覆盖主错误。
6. Workspace migration：修复 journal read 内层 catch 错用外层 `error` 的直接错误映射。

## AST inventory reconciliation

使用同一 `M06-0-catch-inventory.mjs`，未按 catch 数量重拆 scope。A 包完整记录为 44 个有 handler 文件。

| 指标 | Before（75ff 基线） | After（本包工作树） | Delta |
| --- | ---: | ---: | ---: |
| A files | 44 | 44 | 0 |
| A handlers | 192 | 197 | +5 |
| `PROPAGATE_OR_RETHROW` | 95 | 104 | +9 |
| `EMPTY` | 21 | 0 | -21 |
| `ASSIGNMENT_MAPPING` | 17 | 17 | 0 |
| `RETURN_OR_FALLBACK` | 43 | 31 | -12 |
| `DIAGNOSTIC` | 11 | 40 | +29 |
| `SIDE_EFFECT_OR_MAPPING` | 5 | 5 | 0 |
| parse diagnostics | 0 | 0 | 0 |

Remediation/accounting：A 的 21 个原始 `EMPTY` 全部已处理；6 个新增 catch 是 application identity final staging cleanup、platform task snapshot temp cleanup、runtime-owner acquire cleanup、recovery-guard callback error capture、runtime open owner-release cleanup、OperationalStore facade failure cleanup，均有明确 cleanup/error-preservation owner。platform binding 删除了原 `get` 外层 swallow catch（-1），因此净新增为 +5。新增及保留 handlers 没有引入第二 writer、旁路 state machine 或 compatibility path。

下表覆盖 AST after 中 A 包全部 44 个有 handler 文件；文件内多个 disposition 以 `/` 分隔，`PROPAGATE_OR_RETHROW` 已由 stable error/primary-error preservation 证明，非 throw handler 只使用合同允许的 disposition：

| 文件 | Before→After handlers | Final disposition |
| --- | ---: | --- |
| `desktop/ai-provider-config-store.js` | 6→6 | BEST_EFFORT_CLEANUP / EXPLICIT_OUTCOME |
| `desktop/application-identity.js` | 3→4 | OPTIONAL_PROBE_PARSE / BEST_EFFORT_CLEANUP |
| `desktop/composition/workspace-migration-composition.js` | 1→1 | EXPLICIT_OUTCOME |
| `desktop/composition/workspace-runtime-composition.js` | 9→9 | EXPLICIT_OUTCOME / FAIL_CLOSED |
| `desktop/device-identity-store.js` | 3→3 | BEST_EFFORT_CLEANUP / FAIL_CLOSED |
| `desktop/platform-provider-config-store.js` | 10→10 | BEST_EFFORT_CLEANUP / EXPLICIT_OUTCOME |
| `desktop/runtime-config-store.js` | 9→9 | BEST_EFFORT_CLEANUP / EXPLICIT_OUTCOME |
| `desktop/runtime-config.js` | 8→8 | OPTIONAL_PROBE_PARSE / EXPLICIT_OUTCOME / BEST_EFFORT_CLEANUP |
| `desktop/services/platform-account-binding-store.js` | 5→4 | FAIL_CLOSED / BEST_EFFORT_CLEANUP |
| `desktop/services/platform-task-state-store.js` | 3→4 | EXPLICIT_OUTCOME / LISTENER_ISOLATION / BEST_EFFORT_CLEANUP |
| `desktop/services/storage-maintenance-service.js` | 5→5 | OPTIONAL_PROBE_PARSE / EXPLICIT_OUTCOME / BEST_EFFORT_CLEANUP |
| `desktop/services/submission-batch-persistence.js` | 3→3 | OPTIONAL_PROBE_PARSE / EXPLICIT_OUTCOME / BEST_EFFORT_CLEANUP |
| `desktop/services/submission-batch-recovery.js` | 3→3 | OPTIONAL_PROBE_PARSE / EXPLICIT_OUTCOME |
| `desktop/services/submission-cleanup.js` | 3→3 | FAIL_CLOSED / EXPLICIT_OUTCOME |
| `desktop/services/submission-file-helpers.js` | 4→4 | BEST_EFFORT_CLEANUP / FAIL_CLOSED |
| `desktop/services/submission-operation-files.js` | 1→1 | EXPLICIT_OUTCOME |
| `desktop/services/submission-operation-staging.js` | 3→3 | FAIL_CLOSED |
| `desktop/services/submission-queue-removal.js` | 1→1 | EXPLICIT_OUTCOME |
| `desktop/services/workspace-migration-backup.js` | 6→6 | OPTIONAL_PROBE_PARSE / EXPLICIT_OUTCOME |
| `desktop/services/workspace-migration-gate.js` | 5→5 | EXPLICIT_OUTCOME / FAIL_CLOSED |
| `desktop/workspace-bootstrap-service.js` | 16→16 | EXPLICIT_OUTCOME / BEST_EFFORT_CLEANUP |
| `desktop/workspace-location-store.js` | 8→8 | EXPLICIT_OUTCOME / BEST_EFFORT_CLEANUP |
| `desktop/workspace-runtime.js` | 5→5 | BEST_EFFORT_CLEANUP / FAIL_CLOSED |
| `desktop/workspace-schema-gate.js` | 2→2 | OPTIONAL_PROBE_PARSE / EXPLICIT_OUTCOME |
| `desktop/workspace-validator.js` | 8→8 | OPTIONAL_PROBE_PARSE / EXPLICIT_OUTCOME / BEST_EFFORT_CLEANUP |
| `src/infrastructure/operational-store/internal/operational-store-active-target-aggregate.js` | 1→1 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-fact-reader.js` | 3→3 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-migration-import.js` | 1→1 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-migration-journal-inspector.js` | 1→1 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-order-aggregate.js` | 7→7 | FAIL_CLOSED / EXPLICIT_OUTCOME |
| `src/infrastructure/operational-store/internal/operational-store-order-link.js` | 1→1 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-order-observation-aggregate.js` | 4→4 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-owner-lease.js` | 15→16 | FAIL_CLOSED / BEST_EFFORT_CLEANUP |
| `src/infrastructure/operational-store/internal/operational-store-paid-execution-aggregate.js` | 3→3 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-publication-archive-query.js` | 3→3 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-publication-success.js` | 1→1 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js` | 7→7 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-reconciliation-aggregate.js` | 1→1 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-recovery-guard.js` | 4→5 | FAIL_CLOSED / BEST_EFFORT_CLEANUP |
| `src/infrastructure/operational-store/internal/operational-store-regular-queue-runtime.js` | 2→2 | FAIL_CLOSED |
| `src/infrastructure/operational-store/internal/operational-store-runtime.js` | 3→4 | FAIL_CLOSED / BEST_EFFORT_CLEANUP |
| `src/infrastructure/operational-store/internal/operational-store-transaction.js` | 2→2 | FAIL_CLOSED / BEST_EFFORT_CLEANUP |
| `src/infrastructure/operational-store/internal/order-transition-guard.js` | 1→1 | FAIL_CLOSED |
| `src/infrastructure/operational-store/operational-store.js` | 2→3 | FAIL_CLOSED / BEST_EFFORT_CLEANUP |

Inventory after command：`node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary` → 505 scanned files, 276 files with catches, 1,104 total handlers, parse diagnostics 0；A=44 files/197 handlers，A `EMPTY=0`。其余包不属于 M06-A owner，本包未改动其 scope。

## Tests and gates

实际通过的验证：

- 17 个修改 production 文件 `node --check`；修改文件 targeted `npx eslint`；`git diff --check`。
- 定向主链：`node --test --test-reporter=dot tests/platform-task-progress.test.js tests/platform-account-binding-store.test.js tests/storage-maintenance-service.test.js tests/workspace-location-store.test.js tests/workspace-validator.test.js tests/workspace-bootstrap-service.test.js tests/submission-preparation-lifecycle.test.js tests/phase-02-migration.test.js tests/phase-08-operational-store-internals.test.js`（91 个基线相关测试通过）；后续修订集也通过。
- 故障/直接调用链：`tests/platform-task-progress.test.js`、`tests/submission-cleanup-recovery.test.js`、`tests/phase-02-runtime-capacity.test.js`、`tests/phase-05-p1-blockers.test.js`、`tests/phase-08-operational-store-internals.test.js`，最终结果分别为 5、4、8、11、8 个测试通过（其中 phase-02-runtime 与 phase-08 含性能/owner 矩阵；submission-cleanup + phase-02-runtime + phase-08 合并执行时 20 个通过，phase-05 单独 11 个通过）。
- `npm run test:diagnostics`：30 passed；`npm run test:migration`：65 passed；`npm run test:links`：189 passed。
- `npm run test:phase-08:gates`：4 passed；`node scripts/verify-phase-08-gates.js`：PASSED，capability 129/129，unique owner/dependency/legacy/package checks passed。
- `npm run format:check`：passed；`npx eslint` targeted：passed。
- media-workbench capability gate 首次因未安装其锁定 TypeScript 依赖报 `MODULE_NOT_FOUND`，执行 `media-workbench\npm ci --ignore-scripts --no-audit --no-fund` 后在更长时限重跑通过；这是已解决的环境前置，不是代码失败。

未运行：完整 `npm test`/M06-G final full gate、renderer build/typecheck、release/package smoke；它们属于 M06-G 或其他 Wave gate，避免在 M06-A 重复扩大范围。未执行任何真实外部操作。

## Primary Audit → remediation → bounded re-audit

Primary Audit 范围限定为本包 diff、A inventory 全部 handlers、直接调用方、OperationalStore public facade、workspace/config/state persistence 与 cleanup 失败边界。

| Finding | 来源/严重度 | 结论 |
| --- | --- | --- |
| A-PA-01：snapshot persistence、owner/lease、recovery guard、transaction rollback 与 DB close cleanup 原先可能静默或覆盖主错误 | `EXPOSED_PREEXISTING`, P1 | 已关闭：stable error/cleanup code + pathless diagnostic；主错误优先，owner release 可重试；fault injection/owner/restart matrix 通过 |
| A-PA-02：损坏 lock 可被当作不存在，可能错误 reclaim | `EXPOSED_PREEXISTING`, P1 | 已关闭：invalid/symlink/unknown liveness fail closed；malformed runtime lock 保持原文件并返回 stable unavailable，migration lock 按 active 处理 |
| A-PA-03：账号 binding / source article / archive attention 的读取异常可能被当作 absent/empty | `EXPOSED_PREEXISTING`, P1 | 已关闭：binding 与投稿 cleanup 改为稳定错误；直接 caller 看到不可核对结果，不自动重试/不伪造无残留 |
| A-PA-04：workspace journal 内层 catch 使用错误变量 | `EXPOSED_PREEXISTING`, P2 | 已关闭：使用 `journalError`，保留正确 stable failure mapping |
| A-PA-05：Phase 08 capability gate 首次缺 renderer TypeScript dependency | `PROCESS_EVIDENCE_GAP`, non-blocking | 已通过锁定依赖安装与 verifier 重跑关闭；无 implementation finding |

无 P0/P1/P2 blocking finding remain open。bounded re-audit 只复核 A-PA-01～04 的修复 diff、直接 caller、故障矩阵、诊断安全边界与最终 AST；未重新开启全仓 fresh review。结果 PASS：A `EMPTY=0`、新增 catch 均为 cleanup/error capture、所有诊断 metadata 为 allowlisted token/number 且不含 token/Cookie/header/body/数据库行/绝对敏感路径。

## Handoff state

- M06-A：`COMPLETE`。
- M06-B：`READY`，本任务未启动。
- M06 / Maintenance 10.5：`PARTIAL`，不得提前 `COMPLETE`。
- Ticket 25：`PENDING`/blocked by M06，未启动。
- Implementation commit：本 handoff 所在最终 commit；最终 SHA 以任务完成时的 `git rev-parse HEAD` 与任务回复为准。
