# M05-J2 — Test Quality Final Bounded Remediation

## Verdict

`PASS — M05 COMPLETE, ready for M06`

M05-J2 只处理 classifier false negative、mixed declaration fail-closed 和点名 residual tests；没有重审 M05-A–J、Ticket 24 或 M04，没有修改 runner discovery/exclude/concurrency/timeout/pool policy，也没有进入 M06。

## Commit chain

| Item | Evidence |
| --- | --- |
| Base HEAD | `f071d3e5997eea8b41ba51858d30a93ff3f370ad` |
| M05-J2 implementation HEAD | `d6e5ca513b56e606d55f0bbd4be48f15c98a1777` |
| Closure HEAD | docs-only commit created after this handoff; exact SHA is recorded in the final response |
| Implementation parent | `d6e5ca5` is directly based on the latest M05-J closure `f071d3e` |

The implementation commit contains only inventory tooling and test changes. The generated authoritative ledger and this handoff are the only post-evidence documentation changes.

## Changes

### Classifier

- Added file-scope reader metadata and production-path propagation for direct readers, reader helpers, split `path.join` paths, source-derived aliases, inline readers, and helper return values passed directly to assertions.
- Recognized `includes`, `match`, `test`, `startsWith`, `endsWith`, and `indexOf` source-shape calls, plus the supported `assert`/`expect` forms.
- Added assertion-level static legality and an assertion profile. `RETAIN_STATIC_GUARD` now requires every source assertion in the declaration to be a recognized allowed static invariant; mixed or uncertain declarations fail closed.
- Added contract coverage for file-scope helpers, aliases, inline readers, direct helper assertions, split paths, normal behavior code, all requested source-shape methods, and mixed static/business declarations.

### Residual test migration

- Removed Settings source-string assertions and added public Renderer evidence for workspace guidance, navigation labels, and absence of retired UI vocabulary in `renderer-responsive-layout.test.js`.
- Removed platform reachability source assertions; public navigation/queue lifecycle evidence remains in `renderer-platform-queue-refresh-lifecycle.test.js`.
- Removed login-label/source assertions; public login state and IPC evidence remains in `platform-submission-controller.test.mjs` and `phase-04-platform-account-projection.test.js`.
- Removed private `desktop-task-service` shape assertions and positive paid-media component/source assertions; public feature/controller evidence remains in `phase-06-content-workbench-feature.test.mjs`, platform controller tests, and the Renderer harness.
- Removed source-only encoding labels and extended public markup evidence in `renderer-publication-history.test.js`; retained only the narrow mojibake/replacement-character static quality guard.
- Split the typed IPC positive and raw-handler absence checks into separate declarations so neither mixed declaration receives a static exemption.
- Retained only legitimate architecture, security, retired-capability absence, packaging, CI, and discovery guards.

### Production diff

`d6e5ca5^..d6e5ca5` has no changes under `auto—publish/src/`, `auto—publish/desktop/`, or `auto—publish/media-workbench/src/`; production behavior diff is `0`.

## Final evidence

All final implementation evidence below was run with source code at implementation HEAD `d6e5ca5`; the full runner completed before the docs-only ledger/closure changes.

| Command | Result |
| --- | --- |
| `node --test` targeted residual/replacement set (97 tests) | 97 pass; 0 fail; 0 skip/todo/cancelled |
| `node --test tests/test-inventory-contract.test.js` | 12 pass; 0 fail; 0 skip/todo/cancelled |
| `npm run test:discover` | 248 `.test.js/.test.mjs` files discovered; no exclusion/discovery change |
| `node scripts/test-inventory.js` | regenerated authoritative ledger; manifest `f3d2bd6cebfc4a4669452bd3e2f54e1f45773d17d909073e2c6dea767711c7cd` |
| `npm run lint` | PASS |
| `npm run typecheck:renderer` | PASS |
| `npm run typecheck:bridge` | PASS |
| `npm run typecheck:main` | PASS |
| `npm run test:legacy-absence` | PASS |
| `npm run test:ticket-24-e` | PASS |
| `npm run verify:phase-08` | PASS |
| `npm run test:production-ipc-matrix` | 33/33 pass |
| `$env:RUN_ELECTRON_FOCUS_TESTS='1'; npm test -- --profile-output C:\Users\violet\AppData\Local\Temp\m05-j2-full-runner-934d6b2c-f575-47a2-8016-9824fefdfb00.json` | 1,798/1,798 pass; 0 fail; 0 skipped; 0 todo; 0 cancelled; `lifecycle=CLOSED`; `allFilesReported=true`; `noSkippedTodo=true` |
| `git diff --check` | PASS |

The full runner used all 248 discovered files and did not need the previously recorded artifact/runtime exception allowance. No test was excluded or weakened.

An additional non-M05-J2 `npm run format:check` was run and reports the pre-existing, unmodified file `auto—publish/media-workbench/src/types/generation.ts`. It does not affect the required M05-J2 lint/typecheck/static/full-run gates and was not changed to conceal the unrelated formatting debt.

## Inventory closure

Final inventory at `d6e5ca5`:

```text
files: 248
declarations: 1686
file-level source candidates: 37 files / 240 declarations
source assertion candidates: 62
static guards: 62
REWRITE_PUBLIC_BEHAVIOR: 0
```

The 62 assertion-level candidates are all bound to recognized allowed static categories. Manual bounded review covered the newly promoted reader candidates, current static guards, Renderer/UI labels and controls, platform/login state, paid-media start/pause behavior, confirmation-host absence, and private task implementation shapes. No business/UI/private implementation assertion remains hidden under `RETAIN_STATIC_GUARD`; semantic `REWRITE_PUBLIC_BEHAVIOR=0` is confirmed.

## Replacement coverage

| Removed or split source-shape family | Public replacement or rationale |
| --- | --- |
| Settings workspace guidance and retired vocabulary | `renderer-responsive-layout.test.js` renders Settings, selects 工作区, and observes guidance/absence |
| Platforms reachability | `renderer-platform-queue-refresh-lifecycle.test.js` navigates to `#nav-item-platforms`, observes 普通平台队列, refreshes, and rejects stale workspace events |
| Browser login controls | `platform-submission-controller.test.mjs` and `phase-04-platform-account-projection.test.js` exercise independent open/check state and IPC outcomes |
| Paid-media controls/start/pause | `phase-06-content-workbench-feature.test.mjs` exercises public execution snapshot and independent start/pause commands; Renderer tests cover observable flows |
| Private task-service and task-store shape | `platform-submission-controller.test.mjs` and `platform-task-progress.test.js` verify public snapshots, stale-event rejection, and command convergence; private names were not retained |
| Renderer Chinese labels | `renderer-responsive-layout.test.js` and `renderer-publication-history.test.js` assert rendered labels/controls; encoding test retains only quality absence |
| Typed IPC mixed declaration | Positive and raw-handler checks are separate architecture static declarations |

## Remaining findings

```text
P0: none
P1: none
P2: none
P3: one non-blocking pre-existing format-check finding: media-workbench/src/types/generation.ts; outside M05-J2 scope and unchanged
```

## Handoff

- Implementation HEAD: `d6e5ca513b56e606d55f0bbd4be48f15c98a1777`.
- Final code, inventory, lint/typecheck/static gates, targeted tests, and full runner evidence are bound to that implementation HEAD; the generated ledger and this file are docs-only follow-up.
- Closure commit is docs-only and must contain only this handoff plus the regenerated authoritative ledger.
- After the closure commit, `implementation HEAD..closure HEAD` must contain documentation/evidence paths only; no production, test implementation, discovery, or runner-policy changes.
- Working tree is expected to be clean after the closure commit.
- M05 is complete and the task may proceed to M06; no real login, publish, paid, upload, release, or push operation was performed.
