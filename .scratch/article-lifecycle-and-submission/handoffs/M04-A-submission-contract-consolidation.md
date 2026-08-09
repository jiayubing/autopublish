# M04-A — Submission Contract Consolidation

状态：`COMPLETE`

## Scope / provenance

- Base integration HEAD：`444db5bd235eb308597a82da330e85002be802bc`
- Source integration branch：`codex/article-lifecycle-submission`
- Execution branch：`codex/m04-a-submission-contract-consolidation`
- Worktree：`C:\Users\violet\.codex\worktrees\e885\官媒投稿-refactor`
- Source owner at start：`auto—publish/desktop/ipc/contracts/submission-contracts.js`
- Before manifest captured before implementation changes：2026-08-09

## Submission capability before manifest

17 capabilities，全部 `feature=content`、`schemaVersion=1`。表中的 request/success 为公开 DTO 顶层字段；嵌套 DTO、closed validation 和 error descriptors 由同一份 contract manifest 绑定。

| Capability | Channel | Kind | Request fields | Success fields |
| --- | --- | --- | --- | --- |
| `content.listSubmissionPlatforms` | `content:list-submission-platforms` | query | — | `platforms` |
| `content.cancelSubmissionBatch` | `content:cancel-submission-batch` | command | `batchId`, `planId`, `confirmed` | `batchId`, `planId`, `cancelledCount`, `idempotentCount`, `skippedCount`, `batchStatus`, `changedScopes`, `blockedItems`, `items` |
| `content.previewTrashedArticleQueueResidue` | `content:preview-trashed-article-queue-residue` | query | — | `items`, `cleanableItems`, `reportedItems`, `cleanableCount`, `reportedCount` |
| `content.cleanupTrashedArticleQueueResidue` | `content:cleanup-trashed-article-queue-residue` | command | `confirmed` | `status`, `cleanedCount`, `failedCount`, `remainingCount`, `cleanableCount`, `reportedCount`, `items`, `remainingItems` |
| `content.previewRegularQueueAdmission` | `content:preview-regular-queue-admission` | query | `articleRefs`, `platformId`, `accountProfileId`, `queueConfig` | `target`, `articleRefs`, `items`, `totalCount`, `queueableCount`, `idempotentCount`, `missingCount`, `conflictCount` |
| `content.admitRegularQueueItems` | `content:admit-regular-queue-items` | command | `articleRefs`, `platformId`, `accountProfileId`, `queueConfig`, `confirmed` | `batchId`, `target`, `articleRefs`, `items`, `admittedCount`, `idempotentCount`, `missingCount`, `conflictCount` |
| `content.removePendingQueueItems` | `content:remove-pending-queue-items` | command | `items`, `operationId`, `confirmed` | `items`, `removedCount`, `idempotentCount`, `conflictCount` |
| `content.listRegularQueueGroups` | `content:list-regular-queue-groups` | query | — | `items` |
| `content.startRegularQueueGroup` | `content:start-regular-queue-group` | command | `queueGroupId` | `items` |
| `content.pauseRegularQueueGroup` | `content:pause-regular-queue-group` | command | `queueGroupId` | `items` |
| `content.startAllRegularQueueGroups` | `content:start-all-regular-queue-groups` | command | — | `items` |
| `content.pauseAllRegularQueueGroups` | `content:pause-all-regular-queue-groups` | command | — | `items` |
| `content.previewPaidMediaPreflight` | `content:preview-paid-media-preflight` | query | `articleRefs`, `mediaResourceId` | `version`, `status`, `canConfirm`, `confirmationToken`, `confirmationFingerprint`, `articleRefs`, `articleCount`, `articles`, `mediaResourceId`, `mediaName`, `mediaRemarks`, `resourceFingerprint`, `resourceAvailable`, `quotedPrice`, `estimatedTotal`, `systemSubmissionCode`, `blockers`, `risks`, `createdAt`, `expiresAt` |
| `content.confirmPaidMediaBatch` | `content:confirm-paid-media-batch` | command | `confirmationToken`, `confirmed` | `batchId`, `targetKey`, `mediaResourceId`, `status`, `articleCount`, `idempotent`, `items`, `articleRefs`, `confirmationFingerprint`, `quotedPrice`, `estimatedTotal` |
| `content.listPaidMediaBatches` | `content:list-paid-media-batches` | query | — | `items` |
| `content.startPaidMediaBatch` | `content:start-paid-media-batch` | command | `batchId` | `executionStatus`, `batch` |
| `content.pausePaidMediaBatch` | `content:pause-paid-media-batch` | command | `batchId` | `executionStatus`, `batch` |

Before implementation evidence from the source module:

- `submissionContracts.length = 17`.
- All 17 contracts reference the same 88-code `COMMON_ERRORS` catalog; descriptor fields are `category`, `retryability`, and `userMessage`.
- `projectSubmissionResult(channel, value)` is the single channel-dispatch projector for all 17 capabilities; `projectBatchItem` is also owned by the source file.
- `submissionContractFixtures.length = 12`, co-located with the production contracts; only capabilities with direct contract fixtures have entries.
- Direct consumers: `desktop/ipc/contracts/content-operations-contracts.js`, `desktop/ipc/content-submission-ipc.js`, and `tests/phase-06-submission-typed-ipc.test.js`.
- Dependency direction before: `submission-contracts.js → registry.js`; `content-operations-contracts.js → submission-contracts.js`; `content-submission-ipc.js → submission-contracts.js`; direct contract test → `submission-contracts.js`.

Machine comparison command used for the before snapshot:

```text
node -e "const crypto=require('node:crypto'); const {submissionContracts}=require('./desktop/ipc/contracts/submission-contracts'); /* normalize contract schemas, errors and public metadata; print SHA-256 */"
```

The implementation phase will append the exact normalized manifest digest, after ownership table, direct consumers, dependency direction, tests, audit findings, remediation, bounded re-audit, commit and clean-worktree evidence below.

## Implementation / after manifest

### Ownership map

| Module | Owned capabilities / responsibility | Real consumers |
| --- | --- | --- |
| `auto—publish/desktop/ipc/contracts/submission-contract-shared.js` | Shared submission primitives, `articleRef`, the single 88-code error catalog/factory, and projector primitives; owns no capability | The five domain contract modules |
| `auto—publish/desktop/ipc/contracts/submission-platform-contracts.js` | `content.listSubmissionPlatforms` and its projector/fixture | `content-operations-contracts.js`, `content-submission-ipc.js`, direct contract test |
| `auto—publish/desktop/ipc/contracts/submission-batch-contracts.js` | `content.cancelSubmissionBatch`, batch DTOs, item projector and fixture | `content-operations-contracts.js`, `content-submission-ipc.js`, direct contract test |
| `auto—publish/desktop/ipc/contracts/submission-maintenance-contracts.js` | residue preview/cleanup capabilities, DTOs, projectors and fixtures | `content-operations-contracts.js`, `content-submission-ipc.js`, direct contract test |
| `auto—publish/desktop/ipc/contracts/submission-regular-contracts.js` | eight regular-queue capabilities, DTOs, admission/removal projectors and fixtures | `content-operations-contracts.js`, `content-submission-ipc.js`, direct contract test |
| `auto—publish/desktop/ipc/contracts/submission-paid-media-contracts.js` | five paid-media capabilities, DTOs, batch/preflight/admission projectors and fixtures | `content-operations-contracts.js`, `content-submission-ipc.js`, direct contract test |

The after manifest has the same 17 rows, in the same capability/channel order, with the same `feature`, `kind`, `schemaVersion`, closed request/success schemas, 88 error codes and error descriptors as the before manifest. The normalized machine comparison produced:

| Manifest | Before | After | Equality |
| --- | --- | --- | --- |
| Contract count | 17 | 17 | PASS |
| Fixture count | 12 | 12 | PASS |
| Error-code count per contract | 88 | 88 | PASS |
| Contract manifest SHA-256 | `06ec5b952119436c3bdaca2bb772914c5c7906e1ad145514b46c5e09fc986749` | `06ec5b952119436c3bdaca2bb772914c5c7906e1ad145514b46c5e09fc986749` | PASS |
| Fixture manifest SHA-256 | `16ff564535e3318c5a2889fb23aa757072541abde2e47d4c7db7b63ed96807b4` | `16ff564535e3318c5a2889fb23aa757072541abde2e47d4c7db7b63ed96807b4` | PASS |

### Dependency direction and change rationale

After the change, domain contract modules depend on `registry.js` and the shared submission contract module; `content-operations-contracts.js` only assembles the five domain arrays plus Doubao contracts; `content-submission-ipc.js` imports named projectors from the domain that owns each DTO; the direct contract test assembles its five domain arrays and fixtures for contract assertions. No module imports a service, OperationalStore, Renderer feature, preload, or content-core contract. The old `submission-contracts.js` path has no remaining consumer and was removed rather than retained as a compatibility layer.

The change is organizational only: the assembly order and all public contract metadata remain unchanged; channel-group projectors that previously fell through to identity now return the same object directly, while every shaped result uses the named projector for its owning domain. No business service, content-core owner, Renderer feature, preload bridge, schema, lifecycle fact, retry rule, or external operation was changed.

## Primary Audit

Scope: the six new submission contract modules, `content-operations-contracts.js`, `content-submission-ipc.js`, the direct submission contract test, and their minimum registry/projector call chain.

Checked invariants:

- one owner per validator, DTO/schema, error descriptor and projector;
- 17 capability/channel/kind/schemaVersion rows and registry order unchanged;
- closed request/result validation, DTO fields and all 88 error descriptors unchanged;
- projector output and IPC response behavior unchanged;
- no old contract import, legacy IPC/bridge capability, or compatibility re-export;
- dependency direction remains contract → registry/shared and consumer → owning contract;
- direct contract fixtures and IPC behavior assert public outcomes.

Findings and remediation:

| Severity / source | Finding | Remediation |
| --- | --- | --- |
| `P2 PROCESS_EVIDENCE_GAP` | Initial handoff wording reported `submissionContractFixtures.length = 17`; the source and normalized comparison show 12 real fixtures. | Corrected the before manifest to 12 and recorded both before/after normalized manifest and fixture SHA-256 values. Blocking evidence gap closed. |
| `P3 INTRODUCED_BY_CHANGE` | The first split exposed internal helpers (`projectBatchItem`, `projectBatch`, `projectRegularQueueItem`, `projectRegularTarget`, `projectPaidExecutionBatch`, `projectPaidArticleSummary`) from new modules without real consumers. | Removed those exports; helpers remain private to their owning projector module. No public capability or behavior changed. |

No P0/P1 finding and no behavior-affecting blocking P2 finding remained after remediation. No unrelated owner finding was changed.

## Verification evidence

Executed on the implementation worktree after remediation:

- `node --test tests/content-submission-ipc.test.js tests/phase-06-submission-typed-ipc.test.js tests/phase-06-content-operations-typed-ipc.test.js`: 25/25 PASS.
- `npm run test:production-ipc-matrix`: 35/35 PASS; all 129 production capabilities closed by TypeScript symbol identity.
- `npm run test:ticket-24-e`: PASS; public source matches 0, forbidden runtime statuses 0, forbidden maintenance literals 0.
- `npm run test:legacy-absence`: PASS; source matches 0.
- `npm run lint`: PASS.
- `npm run typecheck:main`: PASS.
- `npm run typecheck:bridge`: PASS.
- `npm run typecheck:renderer`: PASS.
- normalized before/after manifest and 12 fixture projector comparison: PASS; no projector diffs.
- `git diff --check`: PASS (only Git's LF→CRLF normalization warnings, no whitespace error).
- `npm test`: not completed; the repository runner hit the 604-second command timeout while a child was running `tests/phase-08-cleanup-gates.test.js`, without emitting a failure assertion. The verified residual runner processes from this timed-out command were stopped; this command is not counted as PASS.

Environment setup: root `npm ci --ignore-scripts` and `npm ci --prefix media-workbench --ignore-scripts` were required because the clean worktree initially had no installed dependencies; neither command changed a tracked file. npm reported existing dependency audit warnings; no audit fix was run.

## Bounded Re-audit

Re-audit scope is limited to the two Primary Audit findings, their remediation diff, the affected export/consumer paths, normalized manifest equality, direct submission/IPC regressions, legacy absence, lint and typecheck. Result: `PASS`; all bounded checks and the final production IPC matrix passed on the final implementation source. The unrelated/full-run timeout is recorded as an evidence gap and did not affect the scoped PASS. No escalation condition was triggered.

## Closure record

- Implementation commit: this single M04-A commit, containing the implementation and this handoff; the final hash is the clean HEAD reported at closure.
- Final clean HEAD / `git status --short --branch`: verified after the commit containing this handoff; exact final hash is reported in the task closure.
- The main task integrated implementation commit `e7db055147034c1edd887328e5a8cfa6bc564430` into `codex/article-lifecycle-submission` with merge commit `049f223f467edd4f18f0734ff00b6fac8c93e297`; the integration tree equals the implementation tree and was clean before this state/evidence update.
- The execution thread itself performed no push, real login, publish, payment, cancellation, production database, or other external side-effect operation; the main task likewise performed no such operation.
