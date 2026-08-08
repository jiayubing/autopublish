# Ticket 24-F — Final Wave/Combined Audit and Wave 10 Closure

Status: `COMPLETE`.

Base clean integration HEAD: `af84dcbbf1399eed9540c425cfecf45c586b7bca`.

Combined 24-A–E audit range: `334a027aaff61496f94dddb2d62c21c0a5be089e..af84dcbbf1399eed9540c425cfecf45c586b7bca` (`123` files, `+1688/-2911`). The implementation commits covered by this audit were `965ea04` (24-A), `fa861f6` (24-B), `90254f9` (24-C), `53e0aa9` (24-D), and `6cb15cf` (24-E), with their corresponding documentation commits already integrated before the 24-F base.

This was the final Wave/combined audit requested by Ticket 24. It did not enter M04, push, merge, or perform real login, publication, payment, cancellation, image upload, production-database, Cloudflare/TLS, or other external operations. The audit followed Primary Audit → blocking remediation → bounded re-audit; it did not reopen a fresh full review.

## Primary finding and remediation

The blocking finding was `P1 / CROSS_TICKET_INTERACTION`: normal generation handoff composition still injected `contentSubmissionService`, whose planner and `submission_batches` persistence path did not consult the canonical regular-platform admission owner. That seam could bypass active-target, published-immutable, uncertain-result, and executable-account-profile facts even though 24-A–E had removed the corresponding legacy public capabilities.

The minimal root fix was applied in the handoff seam:

- `generation-submission-handoff-service` now requires `regularQueueApplication.previewRegularQueueAdmission` and `admitRegularQueueItems`.
- Preview re-reads canonical admission facts and classifies published, uncertain, missing-content, and active-target conflicts; commit admits only the currently queueable article references.
- Normal workspace composition injects the canonical regular queue application and the loaded target-platform list. The generation handoff no longer calls the old batch planner/writer.
- Stable account-profile validation codes are included in the public safe IPC error allowlist; no raw provider/path/token data is exposed.
- The existing public generation DTO remains single-target. No second writer, adapter, compatibility DTO, or parallel lifecycle state machine was introduced.

## Bounded re-audit

The bounded re-audit covered only the changed handoff service/composition/IPC contract, the canonical regular-admission seam, direct callers, affected tests, public capability/error mapping, and the required Wave 10 matrix. It passed. The seam scan confirmed that normal generation composition no longer reads the old content-submission planner while legitimate current `contentSubmissionService` consumers elsewhere remain unchanged.

## Required final matrix

All counts below are from commands actually run under `auto—publish`:

| Required behavior | Evidence |
| --- | --- |
| Generation success → `pending_submission`; single-target admission | Handoff/IPC/generation/production seam/regular queue matrix `44/44`; capacity matrix `16/16`; direct handoff tests `7/7`; regular queue integration `10/10` |
| Ordinary platform accepted, explicit failure, and uncertain | Current outcome matrix `51/51`; current 24-C outcome/evidence/composition matrix `94/94` |
| Media order processing, cancellation, and manual-check/uncertain handling | Ticket 14 direct matrix `13/13`; paid-order/supplier/transport/preflight matrix `45/45`; current media outcome/evidence matrix included in `94/94` |
| Published article immutable; deletion and recovery | Published/removal/recovery matrix `52/52` |
| Migration old evidence and normal composition isolation | Migration/composition/legacy-reader isolation matrix `75/75` |
| `text_only` evidence and later image seam | Current media publication/evidence/adapter seam tests included in `94/94`; no image transport was implemented or promised |

## Final gates

- `npm run test:ticket-24-e`: PASS (`3/2` production capabilities/channels, `3/2` public requests/results, `222` production files, `3` methods, `7` exports, stale files/exports `0/0`, Renderer `sourceMatches: 0`, migration `forbiddenImports: 0`).
- `npm run test:legacy-absence`: PASS (`sourceMatches: 0`, `archiveMatches: 0`).
- `npm run test:discover:evidence`: PASS (`266` tests: `249` JS, `17` MJS; SHA-256 `c5959f80eb6f04752a8dfea22e63682433808abb709de679c05e54e1d6ba8bc3`).
- `npm run lint`, `npm run typecheck:main`, `npm run typecheck:renderer`, `npm run typecheck:bridge`: PASS.
- `npm run test:migration`: PASS (`65` tests); `npm run test:diagnostics`: PASS (`33`); `npm run test:links`: PASS (`189`); `npm run test:phase-08:gates`: PASS (`5`); `npm run test:production-ipc-matrix`: PASS (`35`).
- `git diff --check`: PASS; only the repository's normal LF/CRLF conversion warnings were emitted.

`npm run format:check` was run and is non-green only for the untouched baseline file `media-workbench/src/types/generation.ts`. It was not changed for 24-F; no broad formatting change was made.

An exploratory overbroad media command also reached historical `article-lifecycle-ticket-13`, `15`, and `16` fixtures that still construct retired `submitted`/`submitting` outcomes or call the removed remote-outcome setup. It produced `36/67` passes; those stale historical fixtures were not counted as final 24-F evidence or changed into compatibility tests. The current typed outcome, paid-order, manual-resolution, and Ticket 14 matrices above are the bounded replacement evidence. Full `npm test` was not used as a 24-F gate.

## Retained boundaries and non-goals

- The exact 23 migration-only reader/planner/import/script allowlist remains isolated; normal composition has no legacy reader dependency.
- The current `removePendingQueueItems` behavior remains because it represents removal of an unstarted active queue item through the existing owner, not a user-visible queue-copy entity.
- The 08/09 `text_only` evidence contract, empty image list, `initial` decision, validator, and narrow adapter ports remain available for the later image wave.
- No M04 work was entered. Wave 10.5 remains `PENDING` until separately scheduled.

The final 24-F implementation, test updates, this handoff, and Wave/issue status updates are intended to land in one commit. The final commit OID and clean-HEAD evidence are reported by the closing task result.
