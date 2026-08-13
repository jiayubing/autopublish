# Phase 3A — Renderer Paid Media Staging Feature Owner Handoff

## Baseline

```text
repository root: F:\官媒投稿-refactor
project root: auto—publish
start HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
required ancestors: 4f4a721 and 0734b89 present
environment: Windows win32/x64, Node v24.16.0, npm 11.13.0
start status: preserved user deletion of M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md and untracked PAID-MEDIA-STAGING-QUEUE-FINAL-EXECUTION-PLAN.md
subagents/subthreads: none
git commit/merge/push: none
```

## Owner

```text
primary owner: auto—publish/media-workbench/src/features/content/article-management-feature.js
bounded collaborators:
- auto—publish/media-workbench/src/features/content/content-workbench-feature.js
- auto—publish/media-workbench/src/features/content/use-content-workbench-feature.ts
- auto—publish/tests/phase-03-paid-media-staging-renderer.test.mjs
```

The article-management feature is the only Renderer paid-staging state owner. The composed workbench only projects its read model, and the hook only injects the existing Phase 2 bridge capabilities.

## Scope

Implemented only the Phase 3A renderer connection:

- added `paidStaging: { items, query }` to the article-management and composed Content Workbench snapshots;
- loaded current-client staging during initial, workspace-runtime, client-scope, and management refreshes;
- exposed `addPaidSubmissionStaging`, `removePaidSubmissionStaging`, and `setPaidSubmissionStagingMedia` commands;
- refreshed staging after successful staging commands through the existing management refresh path;
- reused `createQueryIdentity` and `createCommandOwner` for scope/stale/error behavior;
- injected the existing Phase 2 `getPaidSubmissionStaging` and mutation bridge methods from the React feature hook.

Explicitly out of scope: visible staging UI, `GeneratedArticlesView` UX, media pool, favorite-media selection, paid preflight, fee confirmation, paid admission transaction, OperationalStore schema, supplier/order writes, and real external operations.

## Changed files

| file | change |
| --- | --- |
| `auto—publish/media-workbench/src/features/content/article-management-feature.js` | Owns the in-memory staging projection/query, scope invalidation, bridge-backed refresh, and three staging command owners. |
| `auto—publish/media-workbench/src/features/content/content-workbench-feature.js` | Projects `managementSnapshot.paidStaging` at the public workbench snapshot boundary. |
| `auto—publish/media-workbench/src/features/content/use-content-workbench-feature.ts` | Injects the four existing Phase 2 bridge methods. |
| `auto—publish/tests/phase-03-paid-media-staging-renderer.test.mjs` | Adds public behavior coverage for scope loading, mutation refresh, stale results, known errors, and absent order side effects. |
| `.scratch/article-lifecycle-and-submission/handoffs/phase-3a-paid-media-staging-renderer.md` | Records Phase 3A implementation and evidence. |

## Invariants

- OperationalStore remains the sole durable paid-staging fact owner; the Renderer holds only the existing feature snapshot projection.
- Current client/workspace scope gates staging reads and mutation commands; stale client results cannot overwrite the active snapshot.
- Add, remove, and media assignment use the existing Phase 2 bridge contracts and refresh the same staging projection after success.
- Known IPC errors remain in the feature command error state with their stable code.
- No supplier call, order creation, charging, credential collection, batch start, publication target, or schema mutation is reachable from the Phase 3A staging commands.
- No visible staging UI, media-pool owner, preflight/confirm path, or second staging state machine was added.

## Tests

Environment: Windows `win32/x64`, Node `v24.16.0`, npm `11.13.0`.

| command | result |
| --- | --- |
| `npm --prefix media-workbench run typecheck:strict` | PASS |
| `node --test --test-concurrency=1 tests/phase-03-paid-media-staging-renderer.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/phase-06-content-read-model.test.mjs tests/phase-08-content-renderer-feature-races.test.mjs tests/phase-08-feature-development-admission.test.mjs tests/renderer-content-submission-batch-actions.test.js tests/content-workbench-regression.test.js tests/renderer-content-generation.test.js tests/renderer-template-discovery-empty-client.test.js` | PASS, 46/46 |
| `node --test --test-concurrency=1 tests/phase-02-paid-media-staging-application-ipc.test.js tests/phase-01-paid-media-staging.test.js tests/submission-preparation-lifecycle.test.js tests/phase-06-content-operations-typed-ipc.test.js tests/phase-06-production-bridge-fail-closed.test.js` | PASS, 38/38 |
| `node --check media-workbench/src/features/content/article-management-feature.js` | PASS |
| `node --check media-workbench/src/features/content/content-workbench-feature.js` | PASS |
| `node --check tests/phase-03-paid-media-staging-renderer.test.mjs` | PASS |
| `npx prettier --check --end-of-line auto media-workbench/src/features/content/article-management-feature.js media-workbench/src/features/content/content-workbench-feature.js media-workbench/src/features/content/use-content-workbench-feature.ts tests/phase-03-paid-media-staging-renderer.test.mjs` | PASS |
| `git diff --check` | PASS |

The full repository `npm test`, production packaging, real supplier/order operations, and release smoke were not run because they are outside the Phase 3A targeted/direct gate.

## Local self-audit

- PASS: Renderer paid-staging state has one owner: `article-management-feature.js`.
- PASS: `content-workbench-feature.js` adds only a read-model projection; it does not create a second writer or state machine.
- PASS: query identity and command owner semantics are reused for workspace/client stale protection; no custom async race controller was introduced.
- PASS: no durable fact, media cache, supplier capability, order capability, UI component, media-pool logic, preflight, confirm, schema, or admission transaction changed.
- PASS: tests observe public feature snapshots/commands and synthetic adapters rather than production source text.
- PASS: no escalation condition was found.

## External side effects

```text
supplier writes: none
real order creation: none
real charging: none
credentials collected: none
production database/workspace: none
git push/merge: none
```

## Exit

```text
PHASE_3A_PASS
NON_RELEASE_INTERMEDIATE_STATE
```
