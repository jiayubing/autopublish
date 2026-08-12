# Phase 1 — Paid Media Staging Persistence Handoff

## Baseline

```text
start HEAD: 0734b89a38a85cd8173ce4ce4a291c0075482e1e
start status: Phase 1 implementation files were dirty in this isolated worktree; no user M05-J8 plan deletion or untracked remediation plan was present here.
upstream phase: paid media staging remediation plan Phase 1
final source state before commit: same HEAD plus only the Phase 1 diff listed below
```

## Scope

```text
owned scope: paid staging domain contract, OperationalStore persistence owner, schema v6 migration/verification, existing article-owner reader assembly, and domain/store behavior evidence
explicitly out of scope: renderer/UI, media picker, IPC/preload/bridge, supplier/remote calls, paid preflight, fee confirmation, paid batch creation, order execution/state machine, media resource store/refresh, M05/M06, Ticket 25 full gate
```

## Changed files

| file | owner | change | why required |
| --- | --- | --- | --- |
| `src/domain/paid-media-staging-contract.js` | domain contract | Closed staging item, article-ref list, media-id and timestamp parsers | Defines the minimal fail-closed public fact shape |
| `src/domain/index.js` | domain export | Exposes the staging contract | Keeps the domain contract on the existing domain boundary |
| `src/infrastructure/operational-store/internal/operational-store-schema-v6.js` | SQLite schema migration | Adds `paid_staging_items` with composite `(client_id, article_id)` identity and only selected media/time fields | Establishes durable minimal persistence and database-enforced de-duplication |
| `src/infrastructure/operational-store/internal/operational-store-schema.js` | OperationalStore schema owner | Advances schema version 5→6, migration history, dry-run and structure verification | Makes v6 formal, transactional and restartable |
| `src/infrastructure/operational-store/internal/operational-store-verifier.js` | restore verifier | Verifies v6 history and structure | Keeps backup/restore acceptance aligned with the current schema |
| `src/infrastructure/operational-store/internal/operational-store-maintenance.js` | maintenance owner | Verifies v6 history and structure | Keeps public verify/backup maintenance aligned |
| `src/infrastructure/operational-store/internal/operational-store-paid-staging-aggregate.js` | unique staging fact owner | Adds add/remove/list/set-media/has capabilities with article validation, active-target conflict checks, idempotency, scope isolation and transactions | Provides the only staging writer/reader |
| `src/infrastructure/operational-store/internal/operational-store-context.js` | store context | Carries the existing article read capability into the aggregate | Lets staging validate saved article facts without creating a content owner |
| `src/infrastructure/operational-store/operational-store.js` | OperationalStore facade | Assembles and exposes the five minimal staging capabilities | Keeps callers off internal SQL and preserves the public facade boundary |
| `desktop/composition/workspace-runtime-composition.js` | existing composition root | Supplies a closure-backed reader to the store, then binds it to the existing `contentStore` | Ensures staging reads the existing article owner in production composition |
| `tests/phase-01-paid-media-staging.test.js` | Phase 1 behavior evidence | Covers contract, add/batch duplicate, remove, set/clear media, scope, conflict, restart, invalid identity and no side effects | Verifies public behavior and persisted facts with synthetic data |
| `tests/phase-02-operational-store.test.js` | schema/store regression evidence | Updates v6 history/fixture expectations and adds v5→v6 atomic fault/retry coverage | Verifies migration compatibility and rollback |
| `tests/phase-03-operational-store-v3.test.js` | migration regression evidence | Updates current schema expectations and downgrade fixture | Preserves v2/v3 migration coverage under v6 |
| `tests/phase-04-operational-store-lifecycle.test.js` | lifecycle regression evidence | Updates v6 verify/backup/dry-run expectations and downgrade fixture | Preserves lifecycle migration coverage under v6 |
| `tests/phase-08-operational-store-internals.test.js` | facade boundary evidence | Adds the five staging methods to the expected public surface | Verifies the new capability is public but internal SQL remains hidden |
| `tests/article-lifecycle-ticket-23-c.test.js` | bounded migration regression evidence | Updates the v5 fixture to remove v6 staging/history objects before replay | Closes the known v6 fixture finding |
| `tests/phase-03-composition.test.js` | composition regression evidence | Updates current schema expectation | Verifies existing composition remains single-writer/restart safe |
| `tests/ticket-25-e-migration-acceptance.test.js` | migration acceptance evidence | Updates restored schema expectation | Keeps direct restore acceptance on current schema |

## Invariants

### Preserved

- OperationalStore remains the sole operational SQLite writer and internal SQL remains hidden behind the facade.
- Existing v1–v5 migration behavior, history continuity, backup verification, lifecycle facts, paid batch/order state machine and media resource refresh owner are unchanged.
- No renderer, IPC, preload, bridge, supplier, preflight, confirm, batch, order or remote operation is introduced.
- Synthetic tests use temporary workspaces and fake article readers; no external account, supplier or production database is used.

### New

- A staging item persists only `client_id`, `article_id`, `selected_media_resource_id|null`, `created_at`, and `updated_at`.
- `(client_id, article_id)` is unique; duplicate add returns stable `already-staged`/`idempotent` results without a second row.
- Add, remove and media assignment are transactional and support single/batch operations; media may be cleared with `null`.
- List and `has` are client-scoped; invalid article identity, missing article and active/runnable publication target fail closed.
- Reopen restores staging facts; staging writes no publication target, paid batch, order or remote observation.
- Production composition supplies the existing `contentStore` read capability through a closure-backed composition seam; no second article/content store is created.

## Tests

Environment: Windows `win32/x64`, Node `v24.16.0`; isolated worktree has no local `node_modules`, so commands used `NODE_PATH=F:\官媒投稿-refactor\auto—publish\node_modules` only to read the existing dependency installation. No dependency files were copied or staged.

| command | result | count |
| --- | --- | ---: |
| `node --test --test-concurrency=1 tests/phase-01-paid-media-staging.test.js` | PASS | 5/5 |
| `node --test --test-concurrency=1 tests/phase-02-operational-store.test.js tests/phase-03-operational-store-v3.test.js tests/phase-04-operational-store-lifecycle.test.js tests/phase-08-operational-store-internals.test.js` | PASS; includes new v5→v6 migration fault/retry test | 40/40 |
| `node --test --test-concurrency=1 tests/article-lifecycle-ticket-23-c.test.js` | PASS; bounded re-audit of known v6 fixture finding | 8/8 |
| `node --test --test-concurrency=1 tests/article-lifecycle-ticket-23-c.test.js tests/phase-03-composition.test.js tests/ticket-25-e-migration-acceptance.test.js` | PASS | 19/19 |
| `node --check` on all changed JavaScript source/tests | PASS | 0 syntax errors |
| `git diff --check` | PASS | 0 whitespace errors |

The earlier Phase 1 targeted evidence of 39/39 affected OperationalStore/migration/lifecycle tests remains covered by the superseding 40/40 run; the extra case is the new v5→v6 migration regression.

## Primary Audit

Scope was limited to the Phase 1 owner, schema, composition reader assembly, direct callers and public behavior evidence.

Checked invariants:

- unique staging owner and public facade boundary;
- minimal persisted columns and selected media ID only;
- composite client/article uniqueness and duplicate idempotency;
- transactional add/remove/set-media behavior, including rollback on batch failure;
- client-scope isolation and fail-closed identity/article validation;
- active publication target conflict query;
- restart/reopen recovery;
- absence of publication target, paid batch, order and remote side effects;
- tests assert public API results and SQLite persisted facts rather than production source text.

Finding:

- `PROCESS_EVIDENCE_GAP`, P2 during Primary Audit: the 23-C migration test used a v5-era fixture cleanup and left v6 staging/history state when replaying the migration. This caused the known migration fixture to fail before the intended v5 migration fault path.

Remediation:

- Updated only the direct 23-C fixture to remove `paid_staging_items`, `migration_import_entries`, `migration_import_order_identities`, `migration_journals`, and schema history `>=5` before replay. Added direct v5→v6 migration fault/retry behavior coverage in the OperationalStore test.

No P0/P1 or acceptance-blocking owner, persistence, side-effect, scope, or public-contract finding remained.

## Bounded Re-audit

Rechecked only the known fixture finding, the v5/v6 migration diff, direct schema history/rollback behavior, composition regression, and the Phase 1 staging/OperationalStore tests.

- 23-C bounded test: 8/8 PASS.
- Phase 1 staging behavior: 5/5 PASS.
- Affected OperationalStore/migration/lifecycle regression: 40/40 PASS.
- Direct composition and migration acceptance regression: 19/19 PASS.
- No escalation condition was triggered; no fresh full-repository review was opened.

## External side effects

```text
supplier writes: none
real order creation: none
real charging: none
credentials collected: none
production database access: none
git push/merge: none
```

## Known limitations

- Application/IPC/UI wiring and regular-vs-paid admission enforcement remain Phase 2 scope; this Phase 1 store rejects existing active publication targets at staging admission but does not add renderer or IPC behavior.
- The isolated worktree depends on the existing external local `node_modules` path for test execution; this is environment evidence only and is not a repository change.
- No real supplier, account, order, payment or production workspace operation was performed.

## Exit decision

```text
PHASE_1_PASS
```

The handoff is included in the Phase 1 commit created immediately after final diff/staging verification.
