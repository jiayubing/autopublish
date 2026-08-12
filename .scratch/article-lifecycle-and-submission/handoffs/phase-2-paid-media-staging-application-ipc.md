# Phase 2 — Paid Media Staging Application / IPC Handoff

## Baseline

```text
repository root: C:\Users\violet\.codex\worktrees\57a3\官媒投稿-refactor
project root: auto—publish
start HEAD: 4f4a721e8510e09935851c04c754bee7dae475b6
start parent: 0734b89a38a85cd8173ce4ce4a291c0075482e1e
start status: the isolated continuation worktree already contained the Phase 2 implementation/test diff; the主工作树 M05-J8 plan deletion and untracked remediation plan were not present here
final pre-commit source state: start HEAD plus only the Phase 2 files listed below
subagents/subthreads: none
```

Phase 2 was executed serially from the required integration HEAD. No push, merge, Phase 3 dispatch, or real external operation was performed.

## Scope

```text
owned scope: application/service staging commands, shared regular-admission guard, typed IPC contracts and handlers, preload/bridge/type mapping, stable known-error mapping, ClientId boundary regression, and public application/IPC behavior evidence
explicitly out of scope: Phase 3 renderer UI/workbench/picker, Phase 4 paid preflight/fee confirmation/confirmed batch handoff, batch/order creation or execution, media refresh, supplier/remote calls, Phase 5 integration full gate, Phase 6 independent audit, M05/M06, and Ticket 25
```

## Changed files

| file | owner | change | why required |
| --- | --- | --- | --- |
| `auto—publish/desktop/composition/content-lifecycle-composition.js` | application composition | Passes the paid-staging transition port into the article mutation kernel | Lets the shared regular-admission owner observe the Phase 1 staging fact |
| `auto—publish/desktop/composition/workspace-runtime-composition.js` | production composition root | Wires the Phase 1 staging port to the content submission and regular queue applications | Keeps production on the existing OperationalStore owner and closes the cross-channel path |
| `auto—publish/desktop/ipc/content-submission-ipc.js` | content IPC handler | Adds four validated handlers and safe projections for add/remove/set-media/list | Exposes the application capability without moving business state into transport |
| `auto—publish/desktop/ipc/contracts/content-operations-contracts.js` | typed contract assembly | Registers the staging contract set in content operations | Makes all four channels part of the shared versioned registry |
| `auto—publish/desktop/ipc/contracts/submission-contract-shared.js` | submission error contract | Adds stable staging and cross-channel error metadata | Prevents known business failures from degrading to `IPC_INTERNAL` |
| `auto—publish/desktop/ipc/contracts/submission-paid-staging-contracts.js` | paid-staging IPC contract owner | Adds request/result schemas, projections, and synthetic round-trip fixtures for four capabilities | Defines the fail-closed public transport shape without naming it `confirmPaidMediaBatch` |
| `auto—publish/desktop/preload.js` | preload boundary | Forwards the four exact channels through the controlled content namespace | Keeps Electron transport minimal and isolated |
| `auto—publish/desktop/services/content-submission-application.js` | application facade | Exposes mandatory add/remove/set-media/list staging operations | Gives callers one stable application seam over the Phase 1 owner |
| `auto—publish/desktop/services/operational-content-submission-service.js` | content submission service | Enforces saved-only admission, maps store errors, and projects durable staging results | Implements the application-level admission and stable error boundary |
| `auto—publish/desktop/services/regular-queue-application.js` | regular admission application owner | Checks paid staging before regular preview/admission and preserves the conflict result | Closes the ordinary-queue competition path while allowing recovery after removal |
| `auto—publish/media-workbench/src/bridge/content.ts` | renderer bridge transport | Adds typed staging API methods and response mapping | Exposes only transport/type mapping; no renderer state machine or UI was added |
| `auto—publish/media-workbench/src/types/publication.ts` | renderer public types | Adds staging item and mutation result types | Keeps bridge consumers typed at the public boundary |
| `auto—publish/src/content/internal/article-mutation-admission.js` | shared article mutation admission owner | Applies the same staging conflict guard to the canonical regular admission path | Prevents callers bypassing the regular application from creating a competing queue fact |
| `auto—publish/src/content/internal/article-mutation-kernel.js` | article mutation kernel | Carries the staging transition port into admission | Supplies the shared guard with the existing fact reader |
| `auto—publish/src/domain/identities.js` | domain identity owner | Allows trimmed Unicode `ClientId` values while retaining dangerous path/control rejection | Covers the requested positive Unicode and negative dangerous-ID boundary cases |
| `auto—publish/src/infrastructure/operational-store/internal/operational-store-queue-admission-transaction.js` | OperationalStore regular queue transaction | Rechecks staging inside the regular admission transaction | Protects the persisted fact boundary against reordered/concurrent admission |
| `auto—publish/src/infrastructure/operational-store/internal/operational-store-transition-ports.js` | OperationalStore transition port assembly | Exposes only `hasPaidStagingItem` to article mutation consumers | Reuses the Phase 1 owner without exposing internal SQL |
| `auto—publish/src/infrastructure/operational-store/operational-store.js` | OperationalStore facade | Supplies the staging transition dependency to the public port assembly | Preserves one operational writer and the existing facade boundary |
| `auto—publish/tests/fixtures/phase-06-production-ipc-contract-fixtures.js` | typed IPC registry fixture evidence | Adds four `PRODUCTION_CALLERS` entries and synthetic request/result fixtures | Keeps the 133-capability registry fixture inventory complete; no extra consumer verifier metadata remains |
| `auto—publish/tests/phase-06-content-operations-typed-ipc.test.js` | content contract regression evidence | Updates the exact content-operation inventory and channel set to include four staging capabilities | Verifies public registry membership and typed channel coverage |
| `auto—publish/tests/phase-06-production-ipc-fixture-matrix.test.js` | production registry count evidence | Updates the expected registry/fixture count from 129 to 133 | Detects missing staging entries in the shared production fixture inventory |
| `auto—publish/tests/submission-preparation-lifecycle.test.js` | application facade regression evidence | Includes the four staging operations in the stable facade surface test | Prevents accidental omission of the application capability |
| `auto—publish/tests/phase-02-paid-media-staging-application-ipc.test.js` | Phase 2 public behavior evidence | Adds synthetic application, regular admission, typed IPC, preload, identity, persistence, and no-side-effect tests | Verifies behavior at public seams rather than by reading production implementation |
| `.scratch/article-lifecycle-and-submission/handoffs/phase-2-paid-media-staging-application-ipc.md` | Phase 2 evidence handoff | Records implementation, tests, audit, limitations, and exit decision | Binds the Phase 2 result to the actual source state and commands |

## Preserved and new invariants

### Preserved

- OperationalStore remains the sole staging fact writer/reader; the application, IPC, preload, and bridge do not own the state machine.
- Saved articles are the only articles admitted to paid staging; generated/dirty articles and missing articles fail closed.
- Existing active/runnable publication targets block staging admission.
- No paid batch, order, supplier call, media refresh, remote observation, or external side effect is created by this phase.
- The existing regular queue lifecycle and its single target/account rules remain intact for non-staged articles.
- Phase 4 remains the owner of paid preflight/confirm ordering and its final active-target recheck.

### New

- `content.addPaidSubmissionStaging`, `content.removePaidSubmissionStaging`, `content.setPaidSubmissionStagingMedia`, and `content.getPaidSubmissionStaging` are exposed through the application and typed IPC boundaries.
- Duplicate add is stable/idempotent (`ALREADY_STAGED`); remove of an absent item is stable (`NOT_IN_STAGING`); media IDs are validated and may be cleared through the existing Phase 1 capability.
- A staged article returns `PAID_STAGING_REGULAR_QUEUE_CONFLICT` from both regular preview and regular admission; staging is not silently removed.
- Explicit staging removal restores regular admission, and the persisted staging fact remains client-scoped and durable until that removal.
- Stable known mappings include `ARTICLE_NOT_FOUND`, `ARTICLE_NOT_SAVED`, `ALREADY_STAGED`, `ACTIVE_PUBLICATION_CONFLICT`, `NOT_IN_STAGING`, `INVALID_MEDIA_RESOURCE_ID`, and `STAGING_PERSISTENCE_FAILED`; none are intentionally downgraded to `IPC_INTERNAL`.
- Unicode `ClientId` values are accepted after NFKC/trim normalization while path/control/dangerous values remain rejected.

## Tests and gates

Environment: Windows `win32/x64`, Node `v24.16.0`. The isolated worktree used `NODE_PATH=F:\官媒投稿-refactor\auto—publish\node_modules` for the existing dependency installation. A temporary `media-workbench/node_modules` junction was used only for the renderer TypeScript evidence and was removed before closure; no dependency or junction was staged.

| command | result | count/evidence |
| --- | --- | ---: |
| `git rev-parse HEAD` / `git rev-parse HEAD^` | PASS | `4f4a721e8510e09935851c04c754bee7dae475b6` / `0734b89a38a85cd8173ce4ce4a291c0075482e1e` |
| `node --test --test-concurrency=1 tests/phase-02-paid-media-staging-application-ipc.test.js` | PASS | 4/4 |
| `node --test --test-concurrency=1 tests/phase-06-production-bridge-fail-closed.test.js` | PASS | 9/9 |
| `node --test --test-concurrency=1 tests/phase-06-content-operations-typed-ipc.test.js tests/phase-07-regular-queue.test.js tests/submission-preparation-lifecycle.test.js` | PASS | 30/30 |
| `node $ts --noEmit -p media-workbench/tsconfig.strict.json` with `$ts=F:\官媒投稿-refactor\auto—publish\media-workbench\node_modules\typescript\bin\tsc` | PASS | renderer strict typecheck |
| `node --check` on changed JavaScript source/test files | PASS | 0 syntax errors |
| independent staging contract round-trip script | PASS | 4/4 staging fixtures; required known-error registry mapping PASS |
| `git diff --check` | PASS | 0 whitespace errors; only Git LF→CRLF warnings |

The 133-capability production TypeChecker matrix was attempted with the required `NODE_PATH` workaround. It is not claimed as PASS: the run reported 4/33 PASS and 29 failures, beginning with the pre-existing `electron`/`ipcRenderer` TypeChecker symbol evidence (`preloadTransportReceiver: unknown`) across historical capabilities. The four Phase 2 staging capabilities also intentionally have no Phase 3 renderer consumer. This is recorded as a `PROCESS_EVIDENCE_GAP`, not as a business-behavior pass or as a fabricated full-matrix closure.

## Primary Audit

Scope was limited to the Phase 2 application owner, Phase 1 OperationalStore reuse, regular admission guard, IPC/preload/bridge boundary, known-error mapping, identity boundary, direct callers, and public behavior evidence.

Checked invariants:

- unique staging owner and public application facade;
- saved/dirty/not-found/active-target admission behavior;
- duplicate/remove/media idempotency and durable facts;
- regular-vs-paid conflict in both preview and admission, including remove recovery;
- typed request/result validation, known-error preservation, preload channel forwarding, and fail-closed bridge behavior;
- Unicode positive identity and dangerous negative identity behavior;
- absence of batch/order/supplier/remote/media-refresh side effects;
- acceptance tests observe public seams and persisted facts rather than production source text.

Findings:

- `P2 — PROCESS_EVIDENCE_GAP` (non-blocking, deferred): the broad production TypeChecker matrix cannot close historical Electron preload/bridge symbol evidence in this isolated environment, and Phase 2 deliberately has no renderer consumer before Phase 3. Owner: Phase 3 renderer consumer plus the existing production evidence verifier. The independent Phase 2 application/IPC/bridge tests and direct typed-contract round trips pass.

No `INTRODUCED_BY_CHANGE` P0/P1 or acceptance-blocking P2 finding was found. No `CROSS_TICKET_INTERACTION` finding or escalation condition was triggered.

## Bounded Re-audit

Rechecked only the known evidence gap, the final Phase 2 diff after removing the extra verifier metadata, the four staging contract fixtures, the regular admission conflict/recovery path, the direct IPC regression, bridge fail-closed behavior, typecheck, syntax checks, and `git diff --check`.

- Phase 2 public behavior: 4/4 PASS.
- Direct typed IPC/regular/facade regression: 30/30 PASS.
- Bridge fail-closed: 9/9 PASS.
- Four staging contract fixtures and known-error registry mapping: PASS.
- Strict renderer typecheck and syntax checks: PASS.
- No new blocking finding; no fresh full review or escalation was opened.

## External operations

```text
supplier calls: none
real publication: none
real order creation: none
real charging/payment: none
credentials/accounts: none
production database/workspace: none
git push/merge: none
subagents/subthreads: none
```

## Known limitations

- Phase 3 must add the renderer/workbench consumer for these capabilities; no UI or picker was implemented here.
- Phase 4 must retain the final active-target competition check around paid preflight/confirm; this phase does not rewrite that owner.
- The broad 133-capability TypeChecker evidence remains a `PROCESS_EVIDENCE_GAP` and is not represented as a passing full production matrix.
- Tests relied on the existing external dependency installation through `NODE_PATH`; the temporary junction used during typecheck was removed before staging.

## Exit decision

```text
externalOperations: none
PHASE_2_PASS
```
