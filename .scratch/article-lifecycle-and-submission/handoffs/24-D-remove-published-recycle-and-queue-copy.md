# Ticket 24-D handoff — remove published recycle and queue copy

## Provenance and scope

- Ticket: `24-D`
- Base integration HEAD: `4ad663888c61dfb0c592873e0c7ab653048d8746`
- Branch: `codex/article-lifecycle-submission`
- Final implementation commit: `53e0aa99ca55fd7df033fa1a8fbd646841811a39`.
- Scope owner: Removal and Queue Capability Owner.
- Explicitly out of scope: Ticket 24-E, M04, the 24-B target contract, the 24-C typed-outcome owner, migration ownership, merge, push, and real external operations.

## Implemented contract

- Published articles are permanently read-only after the first explicit publication success. Article removal preview now blocks a published submission with `ARTICLE_PUBLISHED_IMMUTABLE`; it exposes no published-local-copy cleanup action. Published history, immutable publication evidence, order history, and deletion transaction recovery remain queryable and preserved.
- Removed `publishedToClean`, `failedToClean`, `cancelledToClean`, `terminalCleanupCount`, the public cleaned status literals, `canCleanup`, and the failed/published/cancelled local-copy user actions from the article-removal owner, content contracts, application/service facades, preload, bridge, feature command surface, component UI, and direct fixtures.
- Removed the independent failed queue-copy cleanup IPC channels, preload/bridge methods, feature commands, generated-article actions, generic attention cleanup/finalize actions, and generic residue-as-attention projection. Failed publication remains available for allowed retry/open/inspect behavior; uncertain publication remains read-only for manual resolution.
- Preserved `removePendingQueueItems` through the existing activity-target/removal owner; its behavior still cancels only an explicitly not-started queue item and restores editing. Preserved `previewTrashedArticleQueueResidue` / `cleanupTrashedArticleQueueResidue` as maintenance repair/evidence capabilities only.
- Durable removal transactions containing retired cleanup actions do not invoke a user cleanup path: revalidation or recovery fails closed to `needs_repair` with `LEGACY_QUEUE_CLEANUP_REQUIRES_REPAIR`. Existing cancel actions, operation-id recovery, uncertain/repair outcomes, staging evidence, and deletion transactions remain recoverable without swallowing uncertainty.

## Changed direct owners and callers

- `desktop/services/article-submission-removal-coordinator.js`, `src/content/article-removal-plan.js`, and `src/content/article-removal-service.js` now own the reduced removal action set: queued cancellation only, published immutable blocking, and retired-action repair routing.
- `desktop/services/submission-cleanup.js` keeps only residue repair/evidence and archive-failure maintenance methods; the operational application facade and content submission IPC expose no independent queue-copy cleanup capability.
- `desktop/ipc/contracts/content-core-contracts.js`, `desktop/ipc/contracts/submission-contracts.js`, `desktop/preload.js`, `media-workbench/src/bridge/content.ts`, feature bindings, Renderer types, and `GeneratedArticlesView` were aligned to the absence contract.
- `article-attention-policy/query/resolver` no longer models queue-pair residue as a user attention entity or dispatches cleanup/finalize actions. Existing removal repair, publication uncertain, published archive failure, order resolution, and retry/history paths remain owned by their existing services.
- Direct behavior/contract fixtures were updated, including the production IPC capability count from 131 to 129 and the renderer confirmation boundary after removal of the cleanup action.

## Real verification

All commands below were run from `auto—publish` unless a path is shown otherwise.

- `node --test --test-force-exit tests/article-attention-policy.test.js tests/article-attention-query.test.js tests/article-removal-service.test.js tests/article-mutation-coordinator.test.js tests/article-lifecycle-ticket-22.test.js tests/phase-05-production-removal.test.js tests/phase-05-p1-blockers.test.js tests/content-submission-ipc.test.js tests/submission-cleanup-recovery.test.js tests/submission-preparation-lifecycle.test.js tests/phase-06-content-core-typed-ipc.test.js tests/phase-06-content-operations-typed-ipc.test.js tests/phase-06-submission-typed-ipc.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-content-confirmation-flow.test.js tests/renderer-history-editor-flow.test.js tests/renderer-article-attention-actions.test.js tests/renderer-residue-cleanup-flow.test.js`: **137 passed, 0 failed**; includes Vite renderer builds.
- `node --test --test-force-exit tests/phase-07-regular-queue.test.js`: **9 passed, 0 failed**; pending removal, target identity, idempotency, active-order blocking, and capability isolation remain intact.
- `node --test --test-force-exit tests/phase-06-production-ipc-fixture-matrix.test.js`: **35 passed, 0 failed**, exit 0 with `--test-force-exit`; the capability identity check reports **all 129**.
- `node --test --test-force-exit tests/phase-06-renderer-bridge-api-surface.test.js tests/phase-06-legacy-path-absence.test.js`: **7 passed, 0 failed**.
- `npm run test:legacy-absence`: passed with `sourceMatches: 0`, `archiveStatus: NOT_APPLICABLE`.
- `npm run lint`: passed.
- `npm run typecheck:main`: passed.
- `npm run typecheck:renderer`: passed.
- `npm run typecheck:bridge`: passed.
- `git diff --check`: passed; Git emitted only normal LF-to-CRLF working-copy warnings.
- A direct `npx prettier --check` over the changed JS/TS/TSX paths reported style issues in 33 files; no bulk formatter rewrite was performed because those paths contain existing file-wide style outside the formal selected format gate. This remains a non-green formatting evidence item alongside the formal `npm run format:check` result below.
- The initial normal production matrix attempt printed **35/35 passed** but the process timed out after the test output and exited 124; it is recorded as a process-evidence gap, not a complete pass. The force-exit rerun above is the complete matrix result. The first combined absence run before the count fix was **41 passed / 1 failed** because the expected count remained 131; the expected count was corrected to 129 and the individual complete gates above were rerun.

## Primary Audit and bounded re-audit

Primary Audit was limited to the 24-D diff and direct owner/caller chain: removal coordinator/plan/service, content contracts and IPC/preload/bridge, feature/component action surfaces, attention projection, residue repair, direct lifecycle/order/deletion/recovery tests, and production fixture absence. No fresh full-repository review was opened.

- Finding `INTRODUCED_BY_CHANGE`: two direct test seams still named the removed cleanup function/field (`renderer-content-confirmation-flow` slice boundary and an obsolete `canCleanup` fixture). Resolution: changed the test boundary to `previewTrashSelections` and removed the obsolete fixture field; the 137-test targeted rerun passed.
- Finding `PROCESS_EVIDENCE_GAP`: the normal production matrix leaves an open test-runner handle after reporting 35/35 and timed out. Resolution: stopped the interrupted unified run as requested, verified no matching Node process remained, and completed the production matrix with `--test-force-exit` at 35/35 exit 0. No timeout output is represented as a full pass.
- Finding `EXPOSED_PREEXISTING` (non-blocking): `npm run format:check` remains non-green only for untouched `media-workbench/src/types/generation.ts`; it is outside the 24-D diff. No 24-D file was changed to mask this baseline issue.

Bounded re-audit rechecked the post-fix diff, direct composition, old capability/channel absence in production source, retention of pending queue cancellation and residue repair, `git diff --check`, the 137-test targeted set, regular queue owner tests, and complete IPC/Renderer absence gates. No P0/P1 or current-correctness P2 finding remains.

## Unrun or non-green gates

- `npm run format:check` is non-green for the untouched `media-workbench/src/types/generation.ts`; the additional direct changed-path check is also non-green as recorded above. No formatter write was run.
- Full `npm test`, full packaging/release gates, `npm run build:renderer` as a standalone gate, production artifact verification, and unrelated repository-wide fresh review were not run; the targeted Renderer tests did run their Vite builds.
- No real account, publication, payment, cancellation, production database, migration execution, M04, merge, or push operation was run.
- The unified absence command that was interrupted by the user is not claimed as a completed result; its production matrix evidence is represented only by the explicit timed-out run and the separate force-exit rerun above.

## Next action

Integration owner should verify the final commit OID and clean HEAD against the recorded base, then consume this single 24-D commit. Do not enter 24-E or perform push/merge/M04/real external operations as part of this handoff.
