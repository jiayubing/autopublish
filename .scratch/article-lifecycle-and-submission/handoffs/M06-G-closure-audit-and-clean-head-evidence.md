# M06-G — Closure Audit + Clean-HEAD Evidence

**Date:** 2026-08-11
**Scope:** Maintenance M06-G only; combined closure of the already integrated M06-A～F work.
**Integration parent:** `b87028b98645f3fe3e34ae18abe1336034ac6d9e`

## 1. Preconditions, provenance and scope

The work was performed in the isolated worktree
`C:\Users\violet\.codex\worktrees\b2bf\官媒投稿-refactor`. Before any implementation or test action:

- `git rev-parse HEAD` was exactly `b87028b98645f3fe3e34ae18abe1336034ac6d9e`.
- `git status --porcelain=v1` was empty; the index had no staged entries.
- The M06-G handoff did not exist, so there was no duplicate M06-G handoff.
- The checkout was detached at the required integration commit; no branch, push, release or external write was used.
- The attached objective and all required repository/spec/protocol/M06 documents were read in full. The attached objective was read with PowerShell `Get-Content -Raw -LiteralPath`.

The only scope was M06-G closure audit, direct blocking remediation, bounded re-audit, authoritative AST reconciliation, failure-matrix verification, final evidence and status documentation. Ticket 25 and every other Maintenance item remain not started. No real login, publish, payment, upload, production database, production migration, external account, push or release operation was performed.

Local provenance used for the evidence: Node `v24.16.0`, npm `11.13.0`; root, `auth-server` and `media-workbench` dependencies were installed locally with `npm ci` variants and no tracked generated output was staged. The auth-server CI baseline is Node 22; this worktree evidence is explicitly recorded as local Node 24.

## 2. Implementation and direct remediation

The combined audit found three blocking correctness/evidence issues and one non-blocking dependency finding. The minimal changes were:

1. `scripts/migrate-operational-store-v1.js`: malformed persisted migration-lease JSON now maps to `MIGRATION_LEASE_ACTIVE`, preserving the contender safety contract; structured `MIGRATION_*` errors still propagate and unreadable I/O remains `MIGRATION_LEASE_UNAVAILABLE`. The lease is never removed by a non-owner.
2. `media-workbench/src/bridge/transport.ts`: typed IPC errors retain the safe public `userMessage` field in addition to `Error.message`; renderer `safeError` therefore preserves the allowlisted user-facing contract without exposing raw exceptions.
3. Three affected test fixtures/assertions were brought back to the current public contract: regular queue-group capability, login observation, and the safe account-profile fallback. Assertions were not weakened.
4. Release evidence now resolves the Git top-level before hashing status/diff/untracked content. This keeps evidence provenance aligned when the repository contains tracked closure documents outside `auto—publish/`; the packaging contract remains fail-closed and `47/47`.
5. Repository-listed formatting files were formatted after the targeted changes. Formatting-only changes are listed by Git; no generated output, node_modules, cache, runtime workspace or package artifact was staged.

## 3. Combined Primary Audit

The Primary Audit covered: owner and public contract; error propagation; cleanup preserving the primary error; remote failure/uncertain/manual-check semantics; idempotency, concurrency, lock, lease and rollback; provenance/evidence fail-closed behavior; sensitive diagnostics; unique writer and state-machine ownership; and absence of bypass writers or a second lifecycle state machine.

| classification | severity | finding | closure |
| --- | --- | --- | --- |
| `INTRODUCED_BY_CHANGE` | P1 | malformed migration lease JSON was reported as unavailable rather than active to a competing migration | fixed in the migration lease owner; direct 8-test regression and `npm run test:migration` 67/67 passed |
| `EXPOSED_PREEXISTING` | P1 | IPC error mapping discarded the typed safe `userMessage` consumed by the renderer contract | fixed at the transport owner; affected renderer/contract regression 45/45 passed |
| `EXPOSED_PREEXISTING` | P2 | three fixtures/assertions lagged the current public DTO/capability/fallback contract | corrected in tests/fixtures only; 45/45 affected regression passed |
| `CROSS_COMPONENT_INTERACTION` | P1 | release-evidence source-state hashing used `auto—publish/` while M06 closure documents are tracked at the Git top-level, producing a false provenance mismatch | fixed `currentSourceState` to resolve `git rev-parse --show-toplevel`; release-evidence regression 10/10 and packaging gate 47/47 passed |
| `PROCESS_EVIDENCE_GAP` | P2 | the first 604-second full-run attempt timed out before the serial suite completed | resolved by process-tree and isolated-run timing; no runner defect or runner code change was found |
| `EXPOSED_PREEXISTING` | P2, non-blocking | development dependency audit reports the existing five-vulnerability tree | production-only audit is clean; recorded for the dependency owner, with no unsafe upgrade made in M06-G |

The blocking findings were fixed before closure. The bounded re-audit checked only the repaired lease/error-propagation paths, direct callers, affected contracts, relevant invariants and final gates. No fresh unbounded full review was reopened.

## 4. 604-second timeout diagnosis

The initial complete `npm test` attempt was bounded at 600,000 ms and timed out at `604056 ms`. The remaining process tree was verified before termination:

```text
npm -> node scripts/run-tests.js -> node tests/phase-08-cleanup-gates.test.js
```

The isolated real runner invocation for the remaining Phase 08 child exited normally with 4/4 tests. `node scripts/run-tests.js` reports 249 files as 210 parallel and 39 serial. The first complete bounded run reached runner lifecycle `CLOSED`/`allFilesReported=true`; it failed only on the then-known source/test issues, not on a live handle. The slow serial stages were approximately: Phase 05 capacity 191 s, production IPC matrix 284 s, Phase 08 cleanup gates 230 s, AST inventory 56 s and runtime capacity 39 s. A subsequent 1,200-second run completed all 1,838 tests with zero test failures; it returned 1 only because one platform-gated Electron test was skipped. That skip was not accepted as closure evidence.

The Electron focus test was then enabled explicitly with `RUN_ELECTRON_FOCUS_TESTS=1` and passed 1/1 in isolation. The required final complete command is therefore the exact root command below with that environment variable set; an exit code of zero and zero skipped tests are mandatory.

## 5. Authoritative AST reconciliation

Commands:

```powershell
node --check .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs --summary
node .scratch/article-lifecycle-and-submission/maintenance/M06-0-catch-inventory.mjs
```

Final full-tree result before the closure commit: `scannedFiles=505`, `filesWithCatches=274`, `catches=1151`, `parseDiagnostics=[]` (0). The A–F ledgers are disjoint and reconcile exactly:

| package | files | handlers | propagate | diagnostic | return/fallback | side/mapping | assignment | EMPTY | OTHER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 44 | 197 | 104 | 40 | 31 | 5 | 17 | 0 | 0 |
| B | 47 | 282 | 140 | 74 | 26 | 26 | 10 | 6 | 0 |
| C | 67 | 254 | 71 | 20 | 93 | 52 | 13 | 4 | 1 |
| D | 54 | 190 | 48 | 28 | 50 | 53 | 11 | 0 | 0 |
| E | 20 | 77 | 32 | 3 | 15 | 20 | 7 | 0 | 0 |
| F | 42 | 151 | 54 | 42 | 16 | 21 | 18 | 0 | 0 |

The only final `EMPTY`/`OTHER` records are the 11 already reconciled in the authoritative inventory: B has three optional browser cleanup handlers and three optional historical-probe parse handlers; C has one optional Electron import, one stable paid-order precheck mapping, one malformed optional settings parse, one invalid optional endpoint no-op and one optional Hepan JSON parse. Each is explicitly optional/unknown or stable failure mapping and cannot authorize success or replace a primary error. A, D, E and F are `EMPTY=0`, `OTHER=0`. The full per-handler ledgers and proof are in `M06-0-authoritative-residual-silent-failure-inventory.md` section 10.

## 6. Synthetic failure matrix

All failure injection used synthetic data, temporary workspaces and fake transports only.

| class | evidence/result |
| --- | --- |
| read / write / rollback / lock / lease | M06-A/B suites, migration 67/67, capacity/lease regression and root suite |
| parse / rename / file cleanup / recovery | M06-B suite, links 189/189 and root suite |
| remote explicit failure / uncertain result / manual check / no automatic retry | M06-C 209/209 and production IPC matrix 33/33 |
| process timeout / stop / cleanup / primary-error preservation | M06-C 209/209 and Phase 08 cleanup 4/4 |
| provenance / artifact evidence failure and fail-closed behavior | packaging 47/47, Phase 08 verifier PASS and provenance regression tests |
| sensitive diagnostics | diagnostics 37/37, auth suite 63/63, IPC/renderer suites; raw token, Cookie, API key, password, body, database row and sensitive path are not accepted |
| normal path / renderer contract | affected regression 45/45 and complete root suite with the focus test enabled |

## 7. Gates run and evidence policy

The following gates were run on the candidate and are required again/recorded on the final clean commit as applicable: auth-server full (`63/63`), format check, lint, main/bridge/renderer typechecks, renderer and preload builds, migration (`67/67`), links (`189/189`), diagnostics (`37/37`), production IPC matrix (`33/33`), Phase 08 gates (`4/4`), `verify-phase-08-gates.js` (129/129 capability reachability plus dependency direction, OperationalStore boundary, unique owners/writers, legacy absence and tracked-generated-output PASS), legacy absence PASS, Ticket 24-E absence PASS, package smoke/packaging (`47/47`) and dependency audits.

`npm audit --omit=dev --audit-level=high` is clean. The full development audit remains a known pre-existing five-vulnerability result (four high and one moderate) and is not represented as PASS. No unavailable, unknown, missing-provenance or unreadable evidence was converted into PASS.

The exact complete root gate is:

```powershell
$env:RUN_ELECTRON_FOCUS_TESTS='1'
npm test
```

The earlier run without this variable produced 1,838 passed and 1 skipped and returned nonzero; it was explicitly rejected. The final clean-HEAD run must report actual exit code 0, 1,838 passed, 0 failed, 0 skipped, lifecycle `CLOSED`, and `allFilesReported=true`. The final closure response records the post-commit SHA, parent, exact start/end timestamps, Node version, source state, command and observed runner counts. Because the commit SHA is self-referential evidence, it cannot be inserted into its own commit before Git creates it; the response is the binding post-commit record, while this handoff records the exact command and acceptance criteria.

## 8. Status and handoff boundary

After the final clean-HEAD gate passes, M06-G is `COMPLETE`, M06 is `COMPLETE`, and Maintenance 10.5 is `COMPLETE`. Ticket 25 remains `PENDING` and explicitly blocked/not started. This closure does not pre-create or schedule Ticket 25 and stops for integration.

## 9. Post-closure remediation supersession

The original delivery at `696f5cff` was later found to have one P1, two blocking P2 findings, including a missing saved post-commit clean-HEAD evidence artifact. Those findings are superseded and closed by implementation commit `8cd5c1c3971e3ce38c28e772958fcf8f2284dcb8`, `M06-G-post-closure-blocking-remediation.md`, and the checked-in `M06-G-post-closure-clean-head-evidence.json`. The new clean implementation HEAD passed 1,843/1,843 complete root tests with zero skipped and all supplemental gates. This historical handoff must not be used to replace the newer evidence.
