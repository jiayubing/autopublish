# Ticket 24-G — Final Closure Reconciliation

状态：`COMPLETE`

## Scope

本次只处理 Ticket 24-F 最终确认的三类 closure finding：

1. Ticket 13 / 15 / 16 stale runtime tests and fixtures；
2. retired residue-maintenance vocabulary 泄漏到 public IPC / Renderer contract；
3. legacy SQLite schema/storage compatibility 未被正式建模和精确 gate 保护。

不进入 M04、M05、M06，不做无关重构，不执行真实账号、发布、付费、取消或生产数据库操作。

## Phase 1 baseline

- Base HEAD：`62ba8e4c31ad0332d402fe288e711020f86a4fd6`
- Branch：`codex/article-lifecycle-submission`
- Working tree：clean
- `git diff --check`：PASS
- Baseline `npm run test:ticket-24-e`：PASS（旧 gate 尚未覆盖本次三类边界）
- Baseline `npm run test:legacy-absence`：PASS
- Ticket 13 / 15 / 16 baseline：39 tests，9 PASS，30 FAIL；失败由退休 `submitted` fixture、`submitting` / `submitted` 断言和旧结果语义触发。

## Phase 2 inventory checkpoint

| Finding | Authoritative owner | Affected surface | Invariant | Retained exception | Planned change |
| --- | --- | --- | --- | --- | --- |
| Stale runtime tests | Current publication/order typed-outcome owners；three Ticket test files | `tests/article-lifecycle-ticket-13.test.js`、`15.test.js`、`16.test.js` | Paid execution/order observation/cancellation remains covered by current typed outcomes and durable facts | `submittedAt` / `submittedTitle` evidence fields remain current facts；explicit legacy rejection tests remain | Migrate fixtures and assertions to `order_created` / `remote_started` / current order facts；retire none unless replacement evidence proves it |
| Public residue vocabulary | `desktop/ipc/contracts/submission-contracts.js`；Renderer public types；submission maintenance bridge | Submission residue DTO/projector and `TrashedArticleQueueResidueItem.repairAction` | Public maintenance exposes only canonical `cancel` / `cleanup` and stable reason/status fields | Internal historical queue-residue recovery may retain old storage/action literals behind exact compatibility boundary | Remove old enum values/result fields from public contract and Renderer type; keep canonical maintenance capability and internal recovery semantics |
| Storage compatibility boundary | OperationalStore schema/migration owner；`scripts/verify-ticket-24-e-absence.js` | Legacy schema `CHECK` values, migration reader/planner/import, Ticket 24 absence gate | Normal runtime writer rejects and never creates `submitting` / `submitted`; legacy reads remain isolated | Exact `KEEP_STORAGE_COMPATIBILITY_ONLY` schema files, migration reader/planner/import/script, and explicit rejection fixtures | Add exact allowlists, normal-runtime status checks, public/runtime regression checks, and behavior evidence |

后续各 Phase 的修改、测试和最终 verdict 追加到本 handoff；本文件不是长期 SPEC。

## Phase 3 implementation

### Finding 1 — stale runtime tests and fixtures

- Ticket 13 / 15 / 16 的原有 39 个测试已全部迁移到当前 typed runtime：`remote_started`、`order_created`、当前 publication/attempt/remote order/evidence durable facts；结果为 39/39 PASS。
- 直接调用链中的旧 generic `submitted` fixture 也已迁移：OperationalStore v3/v4 snapshot/backup/lifecycle、post-processing、supplier canonical behavior、publisher router、Hepan、feature admission、task progress 和 Renderer flow 均改为当前 outcome contract。
- 没有删除有效业务不变量；`submittedAt`、`submittedTitle`、`submittedBody` 等仍是当前远端证据字段，不属于退休 runtime status。

### Finding 2 — public residue vocabulary

- IPC submission contract 与 Renderer `TrashedArticleQueueResidueItem` 的公开 action 现在只有 canonical `cancel` / `cleanup`；旧的 `cleanupPublishedLocal`、`cleanupCancelledLocal`、`published-cleaned`、`cancelled-cleaned`、`failed-cleaned` 以及公开 `resultStatus` 已移除。
- submission cleanup/action/recovery/reconciliation service 将 canonical maintenance action 映射到内部历史存储状态；旧 literals 只保留在精确的 internal historical recovery owner 中，不再穿过 IPC/Renderer public DTO。
- `phase-06-submission-typed-ipc` 增加了退休 residue vocabulary 的拒绝回归；Renderer published-trash flow 与 public contract 均通过。

### Finding 3 — legacy SQLite storage boundary

- `KEEP_STORAGE_COMPATIBILITY_ONLY` 精确 allowlist 仅包含：
  - `src/infrastructure/operational-store/internal/operational-store-schema.js`
  - `src/infrastructure/operational-store/internal/operational-store-schema-v4.js`
- migration reader/planner/import/script 仍属于 `KEEP_MIGRATION_ONLY`；历史维护 literals 仅允许出现在 `submission-action-policy.js`、`submission-action-recovery.js`、`submission-item-projection.js`、`submission-result-reconciliation.js`、`src/content/article-lifecycle-facts.js` 及三个 OperationalStore internal aggregate owner 中。
- 新增 Ticket 24-G 行为回归：正常 `commitRemoteOutcome` 对 `submitting` / `submitted` 返回稳定 `OPERATIONAL_OUTCOME_INVALID`，不创建 remote order，也不改变 publication queue 事实。
- Ticket 24-E absence gate 现在同时检查 public residue vocabulary、runtime retired statuses、internal maintenance literal boundary 和 exact compatibility allowlist；最终报告为 runtime forbidden statuses 0、forbidden maintenance literals 0、public source matches 0。

## Phase 4 verification

Final verification was run against implementation commit `cc8b02e` before this handoff-only documentation commit.

| Gate / test | Result |
| --- | --- |
| `npm test` | 267 files, 1,925/1,925 PASS, 0 failed, 0 skipped |
| Ticket 13 / 15 / 16 targeted suite | 39/39 PASS |
| Ticket 24-G + Ticket 24-E + media order evidence focused suite | 5/5 PASS |
| OperationalStore v3/v4 targeted suite | 14/14 PASS |
| IPC / Renderer residue focused suite | 13/13 PASS |
| regular outcome suite | 32/32 PASS |
| supplier canonical suite | 9/9 PASS |
| `npm run test:ticket-24-e` | PASS; public/source matches 0, runtime forbidden statuses 0, forbidden maintenance literals 0 |
| `npm run test:legacy-absence` | PASS |
| `npm run test:migration` | 65/65 PASS |
| `npm run test:diagnostics` | 33/33 PASS |
| `npm run test:links` | 189/189 PASS |
| `npm run test:phase-08:gates` | 5/5 PASS |
| `npm run test:production-ipc-matrix` | 35/35 PASS |
| `npm run test:discover` / `test:discover:evidence` | 267 files；250 JS、17 MJS；evidence SHA-256 `d3226d591388cef08726fe9892c638ace6bbe9066a796829f1d43d782f72ceed` |
| main / bridge / renderer typecheck | PASS |
| lint | PASS |
| `git diff --check` | PASS；仅有 Git 的 LF→CRLF normalization warning，无 whitespace error |

`format:check` 唯一非零项是未修改的既有 `media-workbench/src/types/generation.ts`；本次修改文件已按 formatter 检查，未扩大范围处理该 pre-existing owner。

## Phase 5 bounded review and closure

- Primary audit finding remediation 已完成；没有新增 P0/P1，也没有直接违反当前 acceptance、持久事实一致性、幂等/不确定结果安全或 public contract 的 P2。
- 未执行真实登录、发布、付费、取消、生产数据库或其他外部副作用操作。
- Implementation commit：`cc8b02e`（`fix: reconcile Ticket 24 closure findings`）。本次 handoff 之后仅提交证据文档；最终 HEAD 以最终 Git 复核为准。

PASS — Ticket 24 can remain COMPLETE
