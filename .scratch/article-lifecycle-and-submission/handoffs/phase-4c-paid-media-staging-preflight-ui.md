# Phase 4C — Paid Media Staging Preflight / Fee Confirmation UI Handoff

## Baseline

```text
repository root: F:\官媒投稿-refactor
project root: auto—publish
phase: Phase 4C — Queue Preflight / Fee Confirm UI
start HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
final source HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
environment: Windows win32/x64, Node v24.16.0, npm 11.13.0
upstream handoffs: phase-3a, phase-3b, phase-3c, phase-4a, phase-4b
subagents/subthreads: none
git commit/merge/push: none
```

The dirty Phase 3A/3B/3C/4A/4B source and tests, existing user deletion of
`M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md`, untracked final
execution plan, and upstream handoffs were preserved. No reset, checkout,
clean, staging, commit, merge, or push was performed.

## Owner and bounded collaborators

```text
primary owner:
auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx

bounded collaborator:
auto—publish/media-workbench/src/components/ContentWorkbench.tsx

renderer behavior evidence:
auto—publish/tests/renderer-content-client-switch.test.js
```

`GeneratedArticlesView` remains responsible only for the saved article → paid
staging entry. It was not given a second paid target or preflight UI. Existing
renderer feature, bridge, preload/IPC, preflight service, OperationalStore
admission transaction, media refresh, order orchestrator, and supplier behavior
were reused without modification in this phase.

## Implemented UI behavior

- Paid staging rows remain filtered by `item.articleRef.clientId === currentClientId`.
- Preflight is enabled only when one or more current-client staging rows are selected, every selected row has a non-null media resource ID, and all selected IDs are identical. Missing media is explicitly blocked; mixed media shows `请选择同一媒体的文章进行费用预检`; the UI never splits selections into multiple batches.
- Renderer preflight calls the existing `previewPaidMediaPreflight` bridge through the existing Content Workbench command with exactly `{ articleRefs, mediaResourceId }`. Cached pool price, availability, remarks, resource fingerprint, and amount are not sent.
- The confirmation view renders the authoritative preflight model: media name, media remarks, latest quoted unit price, article count, estimated total, system submission code, per-article risks, aggregated risks, and blockers. Pool price remains display-only auxiliary information.
- Confirm uses only the preflight-issued `confirmationToken`; the existing bridge adds the contract-required `confirmed: true`. Renderer does not construct amount, fingerprint, article, resource, or confirmation payload data.
- A successful confirmation refreshes the existing paid staging projection through the management command path, refreshes the existing paid batch snapshot, clears selection, closes the confirmation model, and exposes the resulting paused batch. No `startPaidMediaBatch` call is made.
- A failed confirmation leaves staging visible, clears the stale confirmation model, shows the safe bridge error, and permits a fresh preflight.
- Paid batch display reuses the existing `paidMediaExecution` snapshot and filters out completed batches and batches whose item article references do not belong to the current client. It does not introduce a renderer store or a second lifecycle owner.
- The article-page manual media-resource-ID input and old article-page preflight entry remain absent; target selection and preflight are owned by `PaidSubmissionStagingPanel`.

## Changed files

| file | reason |
| --- | --- |
| `auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx` | Extends the existing staging panel with same-media selection validation, authoritative preflight display, token-only confirmation, safe failure handling, paid-batch refresh/projection, and current-client batch filtering. |
| `auto—publish/media-workbench/src/components/ContentWorkbench.tsx` | Wires existing preflight/confirm command states, paid batch snapshot/query, and paid batch refresh into the panel. |
| `auto—publish/tests/renderer-content-client-switch.test.js` | Extends the real Renderer fixture and public behavior test with missing/mixed media blocking, exact preflight payload, authoritative fee/risk rendering, confirmation failure/success, paused batch visibility, current-client filtering, and no-start/no-order assertions. |
| `.scratch/article-lifecycle-and-submission/handoffs/phase-4c-paid-media-staging-preflight-ui.md` | Records the final Phase 4C implementation and evidence. |

No App/media feature, renderer state owner, IPC/preload contract, main service,
schema, admission transaction, order orchestrator, supplier adapter, or
GeneratedArticlesView paid workflow was added or changed for Phase 4C.

## Tests and gates

All test commands were executed serially with `--test-concurrency=1` where
applicable, from the final implementation source state.

| command | result |
| --- | --- |
| `node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js tests/renderer-history-editor-flow.test.js` | PASS, 6/6 |
| `node --test --test-concurrency=1 tests/phase-03-paid-media-staging-renderer.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/phase-06-content-read-model.test.mjs tests/phase-08-content-renderer-feature-races.test.mjs tests/phase-08-feature-development-admission.test.mjs tests/renderer-content-submission-batch-actions.test.js tests/content-workbench-regression.test.js tests/renderer-content-generation.test.js tests/renderer-template-discovery-empty-client.test.js` | PASS, 46/46 |
| `node --test --test-concurrency=1 tests/phase-02-paid-media-staging-application-ipc.test.js tests/phase-01-paid-media-staging.test.js tests/submission-preparation-lifecycle.test.js tests/phase-06-content-operations-typed-ipc.test.js tests/phase-06-production-bridge-fail-closed.test.js` | PASS, 38/38 |
| `node --test --test-concurrency=1 tests/phase-06-media-feature.test.mjs tests/media-resource-service.test.js` | PASS, 25/25 |
| `node --test --test-concurrency=1 tests/phase-12-paid-media-preflight.test.js tests/phase-04-paid-media-staging-queue-admission.test.js tests/content-submission-ipc.test.js tests/article-lifecycle-ticket-13.test.js tests/article-lifecycle-ticket-14.test.js tests/m06-c-remote-process-runtime.test.js tests/ticket-25-d-paid-media-acceptance.test.js` | PASS, 78/78 |
| `npm --prefix media-workbench run typecheck:strict` | PASS |
| `npm run build:renderer` | PASS; existing Vite chunk-size warning only (`index` chunk ~793 kB minified) |
| `node --check tests/renderer-content-client-switch.test.js` | PASS |
| `npx prettier --check --end-of-line auto media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx media-workbench/src/components/ContentWorkbench.tsx tests/renderer-content-client-switch.test.js` | PASS |
| `git diff --check` | PASS; only existing LF→CRLF normalization warnings were reported |

The renderer behavior test covers the requested public cases: no selected
media, mixed media, same-media multi-article preflight, exact `{refs, id}`
input, authoritative price/remarks/risk/system code/blockers, token-only
confirmation, failure preserving staging, success consuming staging, paused
batch visibility, no automatic start, no remote order path, current-client
batch isolation, and absence of the old article-page manual preflight input.

## Bounded self-audit

- **PASS — unique UI owner:** `PaidSubmissionStagingPanel` is the only paid target-selection/preflight UI. Its selection and preflight model are ephemeral UI state; durable staging, paid batch, and confirmation facts retain their existing owners.
- **PASS — article entry boundary:** `GeneratedArticlesView` contains only the article-to-staging entry and no manual media ID or paid preflight control.
- **PASS — input boundary:** preflight sends only article references and the selected media resource ID; confirm sends only the existing confirmation token to the bridge command.
- **PASS — authority:** the preflight response is the fee/risk authority; picker cached price is never used to calculate or send a fee.
- **PASS — success boundary:** confirmation does not call `startPaidMediaBatch`, supplier, order, or payment capabilities; the resulting batch remains paused and requires the existing separate start action.
- **PASS — failure boundary:** confirm errors leave staging intact and expose a safe retryable error.
- **PASS — client scope:** staging rows and active paid batches are filtered to the current client; other-client active batches are not rendered.
- **PASS — no second store/state machine:** no media/staging/confirmation store or parallel lifecycle state machine was introduced.
- **PASS — worktree safety:** prior dirty/untracked changes and the user deletion were preserved; HEAD remains the required baseline.

## Known skips / gaps

- Full repository `npm test`, packaging/release smoke, production database
  access, real login, real media queries, supplier writes, real order creation,
  charging, credentials, commit, merge, and push were not run by design.
- The final execution plan’s Phase 5 integration gate and Phase 6 independent
  audit remain outside this Phase 4C implementation task.
- Existing renderer build chunk-size warning remains a pre-existing build
  advisory and was not expanded into this phase.

## External operations

```text
supplier writes: none
real order creation: none
real charging: none
credentials collected: none
real login/media query: none
production database/workspace: none
git commit/merge/push: none
```

PHASE_4C_PASS
