# Phase 4A — Paid Media Staging Queue Admission Handoff

## Baseline

```text
phase: Phase 4A — Atomic Staging → Paid Batch Transition
repository root: F:\官媒投稿-refactor
project root: auto—publish
start HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
required ancestors: 4f4a721 and 0734b89 present
environment: Windows win32/x64, Node v24.16.0, npm 11.13.0
start status: preserved the user deletion of M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md and untracked PAID-MEDIA-STAGING-QUEUE-FINAL-EXECUTION-PLAN.md; preserved dirty Phase 3A/3B/3C source, tests, and handoffs
upstream phases: phase-3a-paid-media-staging-renderer.md, phase-3b-paid-media-staging-entry-panel.md, phase-3c-paid-media-staging-favorite-media-assignment.md
thread/subagents: one task / none
git commit/merge/push: none
```

## Owner

```text
primary business owner: auto—publish/src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js
bounded collaborators:
- auto—publish/tests/phase-04-paid-media-staging-queue-admission.test.js
- auto—publish/tests/phase-12-paid-media-preflight.test.js (direct fixture staging prerequisite only)
- auto—publish/tests/ticket-25-d-paid-media-acceptance.test.js (direct fixture staging prerequisite only)
```

The new paid admission path is the existing `admitPaidBatch` transition used by the article mutation coordinator and paid-media preflight. The legacy `createPaidSubmissionBatch` facade path was inspected and left unchanged; it is not the Phase 4A new staging-to-admission path.

## Scope

### Implemented

- New `admitPaidBatch` calls identify and validate an existing legal `paid_submission_batches` replay before consulting staging, so a successful first admission can replay after its staging rows were consumed.
- New batch calls require every `(client_id, article_id)` to exist in `paid_staging_items` and require `selected_media_resource_id` to be non-null and equal to the paid batch media target.
- The existing single transaction now performs staging validation, submission/publication/attempt/recovery/item/active-target/paid-batch creation, matching staging deletion, and strict `deletedCount === itemCount` assertion before the existing commit boundary.
- Staging-consume count anomalies and injected pre-commit failures roll back the entire transaction; failed admission leaves both batch facts absent and staging rows intact.
- The existing paid batch default remains `pause_intent='manual'`; the paid execution projection reports `status='queued'`, `paused=true`, `runState='paused'`.
- Added public transition/store behavior evidence for matching admission, missing/null/mismatched staging, multi-item all-or-nothing validation, rollback, delete-count failure, legal replay, active-target conflict, pause state, and absence of remote order facts.
- Updated only direct paid admission/order test fixtures to seed the now-required synthetic staging fact before valid confirmation paths.

### Explicitly not implemented

- No Renderer, preload, bridge, media pool, preflight service, fee-confirmation UI, schema/migration, order orchestrator, supplier adapter, remote order, or charging change.
- No new staging writer or batch transaction was created; consumption is part of the existing queue-admission transaction owner.
- Phase 4A internal staging error codes are not mapped to Renderer typed IPC semantics; that mapping remains Phase 4B scope.
- No automatic batch start was added.

## Changed files

| file | owner | reason |
| --- | --- | --- |
| `auto—publish/src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js` | Phase 4A primary owner | Validates staging only on new paid admission, consumes matching rows atomically, and asserts exact deletion count. |
| `auto—publish/tests/phase-04-paid-media-staging-queue-admission.test.js` | Phase 4A direct transition/store evidence | Covers the required success, validation, rollback, idempotency, pause, conflict, delete-count, and no-side-effect behaviors with synthetic OperationalStore data. |
| `auto—publish/tests/phase-12-paid-media-preflight.test.js` | bounded direct regression fixture | Adds synthetic staging rows only before tests that intentionally reach paid admission; no preflight production behavior changed. |
| `auto—publish/tests/ticket-25-d-paid-media-acceptance.test.js` | bounded direct regression fixture | Adds synthetic staging rows to the paid acceptance fixture, including the second batch article; no application/order production behavior changed. |
| `.scratch/article-lifecycle-and-submission/handoffs/phase-4a-paid-media-staging-queue-admission.md` | Phase evidence | Records the Phase 4A source state, tests, self-audit, and exit decision. |

Phase 3A/3B/3C files, the previous handoffs, the user deletion, and the untracked execution plan were not modified.

## Invariants

### Preserved

- OperationalStore remains the sole operational SQLite writer and `operational-store-queue-admission-transaction.js` remains the sole owner of this admission transaction.
- Existing active publication target conflict, regular/paid exclusivity, publication identity, item identity, and transaction rollback behavior remain enforced.
- Existing legal paid batch replay remains idempotent and does not require staging after the original successful admission consumed it.
- Paid batches remain paused by default and no execution or supplier path is invoked by admission.
- Phase 1/2 staging persistence, client scope, regular queue conflict guard, typed IPC, and Phase 3 Renderer/media-pool ownership remain unchanged.
- No schema or migration changed; all tests use temporary synthetic workspaces and fake/in-memory facts.

### New

- A new paid admission cannot create any batch/publication/active-target facts unless every article is staged with a matching selected media resource.
- A successful new admission consumes exactly the matching staging rows in the same transaction as batch creation.
- A failed creation or delete-count anomaly preserves staging and leaves no partial batch facts.
- Internal Phase 4A failure codes remain below the Renderer typed IPC mapping boundary.

## Tests

Environment: Windows `win32/x64`, Node v24.16.0, npm 11.13.0.

| command | result | count/evidence |
| --- | --- | ---: |
| `node --check src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js; node --check tests/phase-04-paid-media-staging-queue-admission.test.js; node --check tests/phase-12-paid-media-preflight.test.js; node --check tests/ticket-25-d-paid-media-acceptance.test.js` | PASS | no syntax errors |
| `npx prettier --check --end-of-line auto src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js tests/phase-04-paid-media-staging-queue-admission.test.js tests/phase-12-paid-media-preflight.test.js tests/ticket-25-d-paid-media-acceptance.test.js` | PASS | all listed files formatted |
| `node --test --test-concurrency=1 tests/phase-04-paid-media-staging-queue-admission.test.js tests/phase-01-paid-media-staging.test.js tests/phase-02-paid-media-staging-application-ipc.test.js tests/phase-03-paid-media-staging-renderer.test.mjs tests/phase-04-operational-store-lifecycle.test.js tests/phase-08-operational-store-internals.test.js tests/phase-12-paid-media-preflight.test.js tests/ticket-25-d-paid-media-acceptance.test.js` | PASS | 61/61 |
| `git diff --check` | PASS | no whitespace errors |

An initial exploratory run of the existing paid preflight/order tests exposed their old fixtures had no staging rows; only the direct test fixtures were updated to establish the new Phase 4A prerequisite. The final combined command above passed 61/61.

The full repository `npm test`, packaging, release smoke, and real supplier/order/charging operations were not run because they are outside this Phase 4A targeted gate and the state remains explicitly non-release.

## Local self-audit

- **PASS — primary owner:** only the existing OperationalStore queue-admission transaction owns the new persisted transition; no second production state or batch owner was introduced.
- **PASS — new versus replay path:** existing legal replay is checked first and bypasses staging validation; only a genuinely new paid batch consumes staging.
- **PASS — transaction boundary:** all creates, matching deletes, exact delete-count assertion, and commit remain inside one existing `BEGIN IMMEDIATE` transaction; rollback evidence covers pre-commit failure and delete-count anomaly.
- **PASS — failure preservation:** validation or creation failure leaves staging rows and no batch/publication/active-target facts; no partial consume is silently accepted.
- **PASS — pause and side effects:** default `manual` pause intent projects to paused run state; no supplier write, remote order, charging, credential, or automatic start is reachable.
- **PASS — regular/paid conflict:** active-target conflict remains enforced, and Phase 1/2 direct regression continues to prove staged articles cannot enter the regular queue.
- **PASS — boundary:** Phase 4A internal codes do not claim Renderer typed IPC semantics; favorite membership/preflight mapping remains Phase 4B scope.
- **PASS — evidence:** tests observe transition/store facts and execution projection using synthetic temporary databases; no source-regex assertion is used as business proof.
- No scope-escalation condition was found; no independent full Primary Audit was opened.

## External side effects

```text
supplier writes: none
real order creation: none
real charging: none
credentials collected: none
production database/workspace access: none
git commit/merge/push: none
```

## Exit

```text
PHASE_4A_PASS
NON_RELEASE_INTERMEDIATE_STATE
```
