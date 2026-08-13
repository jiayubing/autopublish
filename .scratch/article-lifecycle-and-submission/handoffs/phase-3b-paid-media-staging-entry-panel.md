# Phase 3B — Paid Media Staging Entry / Panel Handoff

## Baseline

```text
phase: Phase 3B — Article Entry & PaidSubmissionStagingPanel
start HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
required ancestors: 4f4a721 and 0734b89 present
environment: Windows win32/x64, Node v24.16.0, npm 11.13.0
start status: Phase 3A implementation/test/handoff were present and preserved; the user deletion of M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md and untracked PAID-MEDIA-STAGING-QUEUE-FINAL-EXECUTION-PLAN.md were present and preserved
upstream phase: .scratch/article-lifecycle-and-submission/handoffs/phase-3a-paid-media-staging-renderer.md
thread/subagents: one task / none
git commit/merge/push: none
```

## Owner

```text
primary business/UI owner: auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx
bounded collaborators:
- auto—publish/media-workbench/src/components/content/GeneratedArticlesView.tsx
- auto—publish/media-workbench/src/components/content/GeneratedArticlesView.types.ts
- auto—publish/media-workbench/src/components/ContentWorkbench.tsx
- auto—publish/tests/renderer-content-client-switch.test.js
- auto—publish/tests/renderer-history-editor-flow.test.js
```

The component path follows the repository's existing Content UI convention. The Phase 3A article-management feature remains the only Renderer staging snapshot/command owner; the panel owns only ephemeral row selection and UI intent.

## Scope

### Implemented

- Added the current-client paid staging panel with article title, customer, media state (`未选择` or read-only selected resource code), and per-row `移出` action.
- Filtered panel rows by `item.articleRef.clientId === currentClientId` and cleared ephemeral panel selection/error state on client switch.
- Added the saved-article entry action `加入付费媒体投稿队列` in `GeneratedArticlesView`, reusing the Phase 3A `addPaidSubmissionStaging` command and the existing Renderer dirty-article guard.
- Displayed a stable add result for both new and idempotent/duplicate staging entries.
- Routed panel removal through the existing Phase 3A `removePaidSubmissionStaging` command; no new writer or main-process dirty owner was introduced.
- Removed the formal article-page editable media-resource-ID input and old paid-media preflight entry/dialog wiring.
- Removed the old article-page paid-batch refresh/start/pause controls so this intermediate phase exposes no preflight, confirmation, paid-batch, or order action. The underlying Phase 2/paid execution capabilities remain available for the later phase that owns their UI.

### Explicitly not implemented

- No media picker, media-pool read, set-media UI, media membership validation, or media refresh change.
- No paid preflight, fee confirmation, paid-batch creation/transition, order creation, supplier call, charging, or remote operation.
- No OperationalStore schema, paid admission transaction, paid-media-preflight-service, IPC/preload/bridge contract, or durable owner change.
- No automatic regular queue admission; the existing Phase 2 staging-vs-regular conflict guard remains authoritative.

## Changed files

| file | owner | reason |
| --- | --- | --- |
| `auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx` | Phase 3B paid staging UI owner | Renders current-client staging rows, read-only media state, ephemeral selection, and remove intent. |
| `auto—publish/media-workbench/src/components/ContentWorkbench.tsx` | Content UI composition | Projects the Phase 3A `paidStaging` snapshot and existing remove command into the narrow panel. |
| `auto—publish/media-workbench/src/components/content/GeneratedArticlesView.tsx` | Article management entry collaborator | Adds article-to-staging admission, preserves dirty blocking, and removes editable media/preflight and old paid execution UX. |
| `auto—publish/media-workbench/src/components/content/GeneratedArticlesView.types.ts` | Renderer prop/command contract | Adds the staging admission command and removes obsolete article-view paid preflight/execution props. |
| `auto—publish/tests/renderer-content-client-switch.test.js` | Real Renderer behavior evidence | Covers saved add, duplicate result, panel projection, remove, client isolation/selection reset, regular-queue conflict, and absence of preflight/confirm/order calls. |
| `auto—publish/tests/renderer-history-editor-flow.test.js` | Real Renderer dirty/legacy absence evidence | Covers dirty article blocking for both regular and paid staging entry and absence of the old resource-ID/preflight controls. |

Phase 3A files already dirty in the worktree (`article-management-feature.js`, `content-workbench-feature.js`, `use-content-workbench-feature.ts`, its test and handoff) were not changed by this phase. The user deletion and untracked execution plan were not changed.

## Invariants

### Preserved

- OperationalStore remains the sole durable paid-staging fact owner; the Phase 3A feature remains the sole Renderer staging projection/command owner.
- Panel reads only the existing `paidStaging` projection and sends only the existing `addPaidSubmissionStaging`/`removePaidSubmissionStaging` commands.
- Saved-only admission and the existing dirty-article Renderer guard remain in force; no main-process dirty state owner was added.
- Staging remains client-scoped, and the existing Phase 2 regular-queue conflict guard continues to block a staged article from regular admission until explicit staging removal.
- Duplicate add remains idempotent and visible through a stable user result; removal remains available without creating a second staging fact.
- No supplier write, order creation, charging, credentials, schema mutation, or remote side effect is reachable from the new staging UI.

### New

- The paid staging UI has one narrow owner: `PaidSubmissionStagingPanel`.
- Only rows for the current client are rendered; switching clients clears panel selection and cannot display the previous client's staging rows.
- Selected media is display-only in this phase. The panel cannot select or assign a media resource.
- The formal article-management paid preflight/resource-ID/batch execution entry points are absent in this non-release intermediate state.

## Tests

Environment: Windows `win32/x64`, Node `v24.16.0`, npm `11.13.0`.

| command | result | count/evidence |
| --- | --- | --- |
| `npm --prefix media-workbench run typecheck:strict` | PASS | strict renderer TypeScript check |
| `node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js tests/renderer-history-editor-flow.test.js` | PASS | 6/6 real Renderer tests |
| `node --test --test-concurrency=1 tests/phase-03-paid-media-staging-renderer.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/phase-06-content-read-model.test.mjs tests/phase-08-content-renderer-feature-races.test.mjs tests/phase-08-feature-development-admission.test.mjs tests/renderer-content-submission-batch-actions.test.js tests/content-workbench-regression.test.js tests/renderer-content-generation.test.js tests/renderer-template-discovery-empty-client.test.js` | PASS | 46/46 Phase 3A/direct Renderer feature regressions |
| `node --test --test-concurrency=1 tests/phase-02-paid-media-staging-application-ipc.test.js tests/phase-01-paid-media-staging.test.js tests/submission-preparation-lifecycle.test.js tests/phase-06-content-operations-typed-ipc.test.js tests/phase-06-production-bridge-fail-closed.test.js` | PASS | 38/38 Phase 1/2 direct regressions |
| `npm run build:renderer` | PASS | renderer lint/typecheck + Vite production build; existing chunk-size warning only |
| `node --check tests/renderer-content-client-switch.test.js` | PASS | syntax check |
| `node --check tests/renderer-history-editor-flow.test.js` | PASS | syntax check |
| `git diff --check` | PASS | no whitespace errors; Git reported existing LF→CRLF conversion warnings only |

The full repository `npm test`, production packaging, release smoke, real supplier/order operations, real credentials, and real charging were not run because they are outside the Phase 3B targeted gate and the phase is explicitly non-release.

## Local self-audit

- `Did this phase stay inside its primary business owner?` **PASS.** The new panel is the only paid staging UI owner; wiring is limited to the allowed Content collaborators.
- `Did it introduce a second durable/state owner?` **PASS.** No durable fact, feature snapshot owner, media store, or main-process dirty owner was added. Panel selection is ephemeral UI intent only.
- `Did it introduce remote side effects?` **PASS.** No preflight, confirm, batch, order, supplier, payment, or credential path is called by the staging UI.
- `Did it pull future-phase work forward?` **PASS.** Media selection, media-pool authority, preflight, fee confirmation, atomic paid admission, and order execution remain out of scope.
- `Did direct public behavior tests pass?` **PASS.** Real Renderer tests and Phase 1/2/3A direct regressions passed on the final implementation source state.
- No scope-escalation condition was found.

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
PHASE_3B_PASS
NON_RELEASE_INTERMEDIATE_STATE
```
