# Ticket 24-C handoff — remove generic runtime outcome vocabulary

## Provenance and scope

- Ticket: `24-C`
- Base integration HEAD: `640a1d13de251224b5538a11575a8a4b0895068b`
- Final commit: the single 24-C commit containing this handoff; the exact hash is recorded by the closure response and clean-HEAD verification.
- Scope owner: Runtime Outcome Vocabulary Owner.
- Explicitly out of scope: Ticket 24-D published recycle/queue-copy cleanup, the 24-B target contract, migration reader/planner ownership, M04, merge, push, and real external operations.

## Implemented contract

- Normal publication runtime no longer carries generic `submitting`, `submitted`, or `reviewing` states. The publication state owner uses `queued -> remote_started -> published|failed|uncertain`; `accepted` is the regular platform outcome that commits the sole publication-success fact.
- Regular platform adapters, worker, application boundary, outcome service, IPC contract, and Renderer types use typed outcomes (`accepted`, `article_rejected`, `group_blocked`, `uncertain`) and do not use `submitted` as a success fallback.
- Website media keeps supplier/order facts separate: order creation returns the existing `order_created` typed result, order observations project to `paid_processing`, `published`, `cancelled`, or `manual_check`, and late/duplicate observations remain idempotent.
- `submittedAt`, `submittedAtSource`, `submittedTitle`, `submittedBody`, order submission time, and supplier raw/status-code facts remain evidence fields. They are mapped at the adapter/order boundary and are not exposed as article lifecycle enums.
- Legacy generic success paths reject `submitted`/other retired outcomes. Unknown legacy record values fail closed to manual check/uncertain at the presentation boundary; uncertain publication remains frozen and is not directly retryable.
- No SQLite schema or historical migration import was changed. The old schema `CHECK` values and migration-only `submitted` import remain historical compatibility evidence, as required.

## Changed direct owners and callers

- `src/publication/publication-state.js`, article lifecycle facts/projection, and OperationalStore regular/paid aggregates now own the reduced runtime vocabulary.
- Platform adapters, worker executor/service, media publisher, and IPC/preload-facing contracts now map to their typed boundary outcomes.
- Media-workbench publication status and type contracts no longer expose generic submitted/submitting states; unknown legacy history is shown as `manual_check`.
- Direct queue/action callers were aligned to `remote_started`; no published recycle or queue-copy behavior was changed.
- Added focused Ticket 24-C behavior coverage for regular success/failure/uncertain, paid order processing/published, late/duplicate observations, legacy isolation, IPC/Renderer absence, and no automatic retry.

## Real verification

Final minimal targeted command, run from `auto—publish` after the last source change:

```text
node --test tests/ticket-24-c-runtime-outcome-vocabulary.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-platform-outcome-service.test.js tests/regular-platform-outcomes.test.js tests/phase-03-media-publication-workflow.test.js tests/phase-03-media-order-evidence.test.js tests/phase-03-media-order-projection.test.js tests/phase-03-worker-main-contract.test.js tests/phase-03-six-stage-article-lifecycle.test.js tests/phase-06-platform-typed-ipc.test.js tests/phase-06-renderer-bridge-api-surface.test.js tests/renderer-publication-history.test.js tests/phase-03-remote-order-legacy-path-absence.test.js tests/phase-06-legacy-path-absence.test.js
```

Result: `97 passed, 0 failed`.

Additional real results:

- `node --test tests/phase-01-domain-contracts.test.js`: `4/4 passed`.
- Regular adapter/service outcome tests: `8/8 passed`.
- Paid workflow/order evidence/projection tests: `12/12 passed`.
- Regular outcome matrix: `24/24 passed`.
- Worker/main contract: `10/10 passed`.
- Six-stage lifecycle: `20/20 passed`.
- IPC/bridge/Renderer targeted contracts: `34/34 passed` across the listed targeted commands.
- Operational content submission/order observation/list projection targeted contracts: `40/40 passed`.
- `npm run lint`: passed.
- `npm run typecheck:renderer`: passed.
- `npm run typecheck:bridge`: passed.
- `npm run typecheck:main`: passed.
- `npm run test:legacy-absence`: passed with `sourceMatches: 0`.
- Targeted Prettier checks for changed source/type/test files: passed.
- `git diff --check`: passed; Git only reported normal LF-to-CRLF working-copy warnings.

## Primary Audit and bounded re-audit

Primary Audit was limited to the 24-C diff and its direct composition/call chain. It found no P0/P1/P2 blocking finding. The focused production-owner scan found no `submitting`, `submitted`, or `reviewing` occurrence in the current publication facts/projection, publication state, publisher contract, platform adapters, worker, desktop services/IPC, or Renderer source. Remaining production occurrences are limited to the unchanged historical schema/v4 `CHECK` definitions and migration import.

Resolution: retained the schema/migration history boundary; removed normal runtime vocabulary and mapped outcomes at the adapter/order/IPC/Renderer boundaries. The bounded re-audit rechecked the changed diff, direct composition (which exposes only `publicationWorkflow.recover`), legacy absence tests, and the final `97/97` targeted set; no blocking finding remained.

## Unrun or non-green gates

- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js tests/phase-06-production-bridge-fail-closed.test.js` was attempted and timed out. This is the known packaged production fixture timeout recorded by the 24-B handoff; no 24-C scope expansion was made.
- `npm run format:check` was attempted. It remained non-green only for the untouched pre-existing `media-workbench/src/types/generation.ts`; all changed files passed targeted formatting checks.
- Direct `node scripts/verify-renderer-contract-absence.js` was not usable without its required packaged `--resources` argument. The corresponding Renderer contract artifact/bridge tests passed.
- No real account, supplier, publication, payment, cancellation, production database, M04, push, or merge operation was run.

## Next action

Main integration task should consume the single 24-C commit, verify the clean HEAD against the recorded base/commit, and proceed according to the Wave Plan. Do not enter 24-D or add automatic retry behavior.
