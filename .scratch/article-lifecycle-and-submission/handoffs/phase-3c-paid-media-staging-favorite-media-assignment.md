# Phase 3C — Paid Media Staging Favorite Media Assignment Handoff

## Baseline

```text
repository root: F:\官媒投稿-refactor
project root: auto—publish
start HEAD: 9ee4e08fd0d165a4a0f8911c07cdc2187473b6dd
required ancestors: 4f4a721 and 0734b89 present
environment: Windows win32/x64, Node v24.16.0, npm 11.13.0
start status: preserved the user deletion of M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md and untracked PAID-MEDIA-STAGING-QUEUE-FINAL-EXECUTION-PLAN.md; preserved the dirty Phase 3A/3B source, tests, and handoffs
upstream phases: phase-3a-paid-media-staging-renderer.md, phase-3b-paid-media-staging-entry-panel.md
subagents/subthreads: none
git commit/merge/push: none
```

## Owner

```text
primary business/UI owner: auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx
existing media fact owner: useMediaFeature() → mediaSnapshot.pool → mediaFeature.loadPoolPage()
bounded collaborators:
- auto—publish/media-workbench/src/components/ContentWorkbench.tsx
- auto—publish/media-workbench/src/App.tsx
- auto—publish/tests/renderer-content-client-switch.test.js
```

The panel owns only picker intent and row selection. Durable staging remains owned by the existing Phase 1/2 OperationalStore and Phase 3A Renderer feature; the panel writes through the existing `setPaidSubmissionStagingMedia` command only.

## Scope

Implemented only the Phase 3C chain:

```text
existing favorite media pool page
→ PaidSubmissionStagingPanel picker
→ selectedMediaResourceId
```

- App passes a narrow read-only pool capability: current page items, page metadata, loading/error state, and `loadPage`.
- The picker renders only `mediaSnapshot.pool.items`, with media name, cached price, and read-only resource code.
- Existing pool pagination is exposed through previous/next page controls calling `mediaFeature.loadPoolPage()`.
- One selected staging row can receive one media; multiple selected staging rows receive the same media in one existing `setPaidSubmissionStagingMedia` call.
- Per-row and selected-row clearing call the same command with `mediaResourceId: null`.
- Client changes clear row selection, picker highlight, and picker client context; visible staging rows remain current-client filtered.
- A selected resource absent from the currently loaded pool page continues to display its persisted resource code without an authoritative stale/cancelled-favorite conclusion.

Explicitly out of scope: media feature/store/cache/search changes, supplier refresh changes, Main-side favorite membership guard, paid preflight, fee confirmation, paid batch/order/remote writes, schema changes, and restoration of the old editable resource-ID/preflight UX.

## Changed files

| file | owner | change | why required |
| --- | --- | --- | --- |
| `auto—publish/media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx` | Phase 3C UI owner | Adds the favorite-pool picker, pagination controls, single/batch assignment, clear actions, read-only media fields, and non-authoritative selected-ID display | Completes Renderer selection from the existing pool while keeping staging commands and media facts in their existing owners |
| `auto—publish/media-workbench/src/components/ContentWorkbench.tsx` | bounded UI wiring | Passes the narrow pool capability and existing set-media command to the panel | Keeps composition/feature layers free of picker state and business rules |
| `auto—publish/media-workbench/src/App.tsx` | bounded composition wiring | Projects `mediaSnapshot.pool` and `mediaFeature.loadPoolPage()` into the narrow Content prop | Reuses the existing media feature/pagination owner without passing the feature object |
| `auto—publish/tests/renderer-content-client-switch.test.js` | renderer behavior evidence | Extends the real Renderer fixture and test for favorite-only display, cached price, single/batch set, clear, pagination, non-authoritative missing-page behavior, client reset, legacy-input absence, and no paid execution calls | Verifies public UI behavior and command payloads at the real Renderer boundary |
| `.scratch/article-lifecycle-and-submission/handoffs/phase-3c-paid-media-staging-favorite-media-assignment.md` | Phase evidence | Records the implementation, invariants, commands, audit, and exit state | Binds this phase to the current dirty source state and actual evidence |

Phase 3A/3B files already dirty in the worktree were preserved. The existing `tests/phase-03-paid-media-staging-renderer.test.mjs` remained the Phase 3A direct regression and was not repurposed as a UI source-text test.

## Invariants

### Preserved

- `useMediaFeature()` and `mediaSnapshot.pool` remain the sole Renderer media-pool read owner; no second media store/cache/search API was added.
- `article-management-feature.js` remains the sole Renderer paid-staging snapshot/command owner; the panel owns only ephemeral UI state.
- OperationalStore remains the sole durable staging fact owner and still persists only the selected resource ID, including `null` on clear.
- Existing Phase 2/3A typed bridge and command contracts are reused; no new transport or production API was exposed.
- No media price, availability, remarks, or pool membership fact is written to staging or forwarded to preflight/confirm.
- No supplier call, remote order, payment, credential, paid batch, or publication target side effect is reachable from this phase.

### New

- Picker options are derived only from the currently loaded favorite pool page; a non-favorite resource in the general resource page is not rendered as a picker option.
- A single pool selection can assign the same resource ID to one or many current-client staging article refs through one `setPaidSubmissionStagingMedia` command.
- Clear actions use `mediaResourceId: null` and do not create an alternate clear writer.
- A selected ID not present on the current pool page is shown as the persisted ID only; the UI does not label it cancelled, stale, or no longer favorited.
- Client switch invalidates temporary row/picker selection and cannot carry a prior client's article refs into a set-media command.

## Tests

Environment: Windows `win32/x64`, Node `v24.16.0`, npm `11.13.0`.

| command | result | count/evidence |
| --- | --- | ---: |
| `node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js` | PASS | 1/1 real Renderer test; covers all ten Phase 3C targeted behaviors |
| `node --test --test-concurrency=1 tests/renderer-content-client-switch.test.js tests/renderer-history-editor-flow.test.js` | PASS | 6/6 Phase 3B real Renderer/direct regressions |
| `node --test --test-concurrency=1 tests/phase-03-paid-media-staging-renderer.test.mjs` | PASS | 4/4 Phase 3A feature regressions |
| `node --test --test-concurrency=1 tests/phase-03-paid-media-staging-renderer.test.mjs tests/phase-06-content-workbench-feature.test.mjs tests/phase-06-content-read-model.test.mjs tests/phase-08-content-renderer-feature-races.test.mjs tests/phase-08-feature-development-admission.test.mjs tests/renderer-content-submission-batch-actions.test.js tests/content-workbench-regression.test.js tests/renderer-content-generation.test.js tests/renderer-template-discovery-empty-client.test.js` | PASS | 46/46 direct Renderer feature regressions |
| `node --test --test-concurrency=1 tests/phase-02-paid-media-staging-application-ipc.test.js tests/phase-01-paid-media-staging.test.js tests/submission-preparation-lifecycle.test.js tests/phase-06-content-operations-typed-ipc.test.js tests/phase-06-production-bridge-fail-closed.test.js` | PASS | 38/38 Phase 1/2 direct regressions |
| `node --test --test-concurrency=1 tests/phase-06-media-feature.test.mjs` | PASS | 8/8 existing media feature owner tests |
| `node --test --test-concurrency=1 tests/media-resource-service.test.js` | PASS | 17/17 media resource refresh remediation regression tests |
| `npm --prefix media-workbench run typecheck:strict` | PASS | strict renderer bridge/type contract check |
| `npm run build:renderer` | PASS | renderer lint/typecheck and Vite production build; existing chunk-size warning only |
| `node --check tests/renderer-content-client-switch.test.js` and `node --check tests/phase-03-paid-media-staging-renderer.test.mjs` | PASS | no syntax errors |
| `npx prettier --check --end-of-line auto media-workbench/src/components/content/PaidSubmissionStagingPanel.tsx` | PASS | Phase 3C new component formatting |
| `git diff --check` | PASS | no whitespace errors; Git only reported existing LF→CRLF normalization warnings |

The full repository `npm test`, production packaging/release smoke, real supplier/order operations, credentials, and charging were not run because they are outside Phase 3C and the current state is explicitly non-release.

## Local self-audit

- **PASS — owner:** media facts remain in the existing media feature/pool owner; staging assignment remains in the existing Phase 3A command owner; the panel has no durable cache or second state machine.
- **PASS — picker source:** picker options come only from the current paginated `pool.items`; no full-pool search, recommendation, filter, or debounce path was added.
- **PASS — payload boundary:** set-media requests contain article refs and the selected resource ID/null only; cached price is rendered for assistance and is never a fee authority or command input.
- **PASS — stale-page semantics:** missing selected IDs are rendered as persisted “已选 resource code” state and are not interpreted as cancelled or stale favorites.
- **PASS — client isolation:** current-client filtering plus client-change cleanup prevents old row/picker selection from being sent for a new client.
- **PASS — external effects:** no preflight, confirm, batch, order, supplier, payment, or credential path was added; media-resource refresh source remained unchanged.
- **PASS — evidence:** tests observe real Renderer UI, public command payloads, and existing feature behavior; no production-source regex is used as the sole business proof.
- No Phase 3C scope escalation or second owner was found.

## External side effects

```text
supplier writes: none
real order creation: none
real charging: none
credentials collected: none
production database/workspace access: none
git commit/merge/push: none
```

## Remaining out-of-scope gaps

- Phase 4A still owns atomic staging-to-paid-batch transition and staging consumption.
- Phase 4B still owns Main-side authoritative favorite membership validation and safe preflight/confirm error mapping.
- Phase 4C still owns paid preflight, latest-price confirmation, and paused paid-batch UI.
- The Phase 3B–4B intermediate state remains non-release; no real external acceptance was attempted.

## Exit

```text
PHASE_3C_PASS
NON_RELEASE_INTERMEDIATE_STATE
```
