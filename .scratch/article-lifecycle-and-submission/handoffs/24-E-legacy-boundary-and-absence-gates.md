# Ticket 24-E — Legacy Boundary, Extension Seams, and Absence Gates

Status: `CLOSURE-READY` for Ticket 24-E only.

Base: `8b7e751d635c9f3f911bb188a7385e7719bba7bd`

Scope: 24-E deletion-map convergence only. M04 and 24-F were not entered. No push, merge, real external operation, production account, payment, publication, or database migration was performed.

## Implemented

- Removed the dead `deriveWorkflow` snapshot compatibility adapter and the old `buildSelectedPlan` workbench extension seam.
- Deleted the unreferenced `publication-submission-service.js` path and its obsolete tests; retained the current worker publisher/executor path.
- Deleted the unreferenced `scripts/repair-article-removal-regressions.js` operator seam and added its absence to the 24-E gate.
- Made queue sidecars require version `2`, `generatedArticleId`, `targetPlatformId`, and a valid content hash; unversioned and aliased (`articleId`, `articleKey`, `targetPlatform`, `platformId`) sidecars fail closed.
- Removed `articles`/`legacy` aliases from the public article-removal DTOs and action inputs while retaining internal transaction article snapshots required for recovery evidence.
- Removed the retired article lineage fields from the silent-normalization path; `reviewedAt`, `sourceArticleId`, and `version` now fail with `ARTICLE_LEGACY_FIELD_UNSUPPORTED`.
- Added layered `test:ticket-24-e` absence verification for production capabilities/channels, public DTOs, IPC/Renderer methods, dead exports/files, Renderer source, and migration isolation. The gate scans `desktop/services` and `desktop/worker` in addition to IPC and Renderer production roots.
- Removed unused `submitSelected` compatibility fixture fields from the affected Renderer tests.

## Explicitly retained

- The 23 migration-only reader/planner/import contract/OperationalStore importer/script allowlist remains intact and isolated from normal composition and Renderer code.
- The 08/09 `text_only` publication evidence contract, empty image list, `initial` decision, evidence validator, and adapter narrow ports remain intact.
- M04, Wave Plan status, and 24-F issue state were not changed.

## Verification evidence

- Initial baseline before implementation: 28 targeted tests passed, 0 failed.
- Implementation/direct owner groups: 67/67, 46/46, and 31/31 tests passed.
- Renderer compatibility-fixture recheck: 18/18 passed.
- 08/09 text-only/evidence plus 23-B/23-D migration-only recheck: 72/72 passed.
- Final Ticket 24 direct matrix (legacy absence, Renderer bridge/artifact absence, capability/caller inventory, production IPC fixture matrix, and regular queue): 63/63 passed; duration about 120.5 seconds.
- Worker dead-service bounded recheck: 8/8 passed.
- `npm run test:ticket-24-e`: passed; production capability/channel checks `3/2`, public DTO checks `3` requests and `2` results, 222 production files scanned, Renderer `sourceMatches: 0`, migration `forbiddenImports: 0`, stale files/exports `0/0`.
- `npm run test:legacy-absence`: passed with `sourceMatches: 0`, `archiveMatches: 0`.
- `npm run test:discover:evidence`: passed with 266 discovered tests (`249` JS, `17` MJS).
- `npm run lint`, `npm run typecheck:main`, `npm run typecheck:renderer`, and `npm run typecheck:bridge`: passed.
- Changed gate/test files pass direct Prettier check. `git diff --check`: passed.

## Audit closure

Primary Audit found one blocking process-evidence gap: the first absence gate did not cover `desktop/services` and `desktop/worker`. The gate was expanded to those production roots; no business owner or compatibility path was added. A bounded re-audit of the changed gate, deleted seams/fixtures, direct callers, migration isolation, and 08/09 evidence chain passed.

## Not run / non-green by scope or baseline

- `npm test` full suite was not run.
- Full renderer/preload build, packaging, release smoke, and production artifact gates were not run.
- Formal `npm run format:check` was run and remains non-green only because the untouched baseline file `media-workbench/src/types/generation.ts` is not Prettier-formatted; it was not changed for 24-E.
- Real login, publishing, payment, production database, Cloudflare/TLS, image upload, push, M04, and 24-F operations were not run.

The implementation, evidence, and this handoff are intended to land in one commit after final staging.
