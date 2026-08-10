# M05-J — Final Evidence Reconciliation

## Verdict

`PASS — M05 can remain COMPLETE`

M05-J 只处理 M05-I closure 后的 classifier false negative、业务 source assertion residual 和 full-test evidence contract reconciliation；没有重做 M05-A–I，没有修改 production behavior、runner concurrency/timeout/pool policy，也没有进入 M06。

## HEAD and scope

| Item | Evidence |
| --- | --- |
| Base HEAD | `365e4a09d496cc31d7c0b9d4e6663d1a29010d9a` |
| Final clean implementation/evidence anchor | `7f113d2697d707120ecf40395ce30fee53ade48d` |
| Branch | `codex/m05-j-final-evidence-reconciliation` |
| Main planning worktree | `F:\官媒投稿-refactor` untouched |
| M06 | not started |

The final evidence run was executed after the implementation/evidence anchor was committed and clean. The closure commits after that run contain only this handoff and the generated ledger reconciliation; they do not change production code, test implementation, discovery, runner policy, or the tested behavior.

## Finding 1 — classifier false negatives

### Root cause

The old inventory primarily recognized direct production paths and broad file/title signals. It could miss a file-scope helper that read production source outside a test body, miss a reader path assembled through split `path.join` segments or an indirect path variable, and over-report runtime `vm`/Electron harness loading as source-text assertions. Title words such as `safe`, `boundary`, `discovery`, `cookie`, `capability`, and `security` were not reliable static categories.

### Closure

- Centralized production path recognition for continuous paths, split `path.join` paths, and propagated production path variables.
- Promoted file-scope reader helpers into assertion-level analysis.
- Required a source-text assertion to use the reader value inside the assertion/expect call; import-only and runtime harness loading remain distinct evidence levels.
- Derived static categories from actual protected targets and recorded category, owner, invariant, rationale, and replacement mapping in the authoritative ledger; test titles no longer create a static disposition.
- Added regression coverage in `tests/test-inventory-contract.test.js` for file-scope helpers, import-only files, split paths, runtime harnesses, source regex assertions, and title-keyword false positives.

The classifier regression suite passed 9/9, and the final gate reports `REWRITE_PUBLIC_BEHAVIOR=0`.

## Finding 2 — residual business source assertions

Final inventory: 248 files (231 JS / 17 MJS), 1,686 declarations; 35 file-level source-reading candidate files / 224 declarations; 53 assertion-level candidates; 53 legal static guards. Final dispositions are:

| Disposition | Count |
| --- | ---: |
| `RETAIN_BEHAVIOR` | 1,452 |
| `RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION` | 169 |
| `RETAIN_DYNAMIC_MATRIX` | 12 |
| `RETAIN_STATIC_GUARD` | 53 |
| `REWRITE_PUBLIC_BEHAVIOR` | 0 |

### Old assertion → replacement evidence

| Residual family | Replacement evidence |
| --- | --- |
| `content-workbench-regression.test.js`, `renderer-content-generation.test.js`, `renderer-template-discovery-empty-client.test.js` | `createContentWorkbenchFeature` public commands/snapshots and template/client projection behavior |
| `doubao-content-workbench.test.js` | `createContentSourcesFeature` with injected collection adapter outcomes and public source snapshot |
| `media-article-drawer-boundary.test.js`, `media-resource-ux.test.js` | `createMediaFeature` public resource paging, article preview/edit, selected-resource mutation, and normalized snapshot |
| `renderer-article-history.test.js` | `article-history-logic` grouping, saved template snapshot fallback, legacy grouping, and selection state |
| `renderer-article-management-filters.test.js`, `renderer-article-management-flow.test.js`, `renderer-published-trash-flow.test.js` | `deriveArticleLifecycle` and public management/lifecycle outcome assertions |
| `renderer-content-submission-batch-actions.test.js` | `createArticleManagementFeature` public batch action/selection/command behavior |
| `renderer-batch-generation.test.js` | `content-generation-ui-logic` public selection, template projection, source validity, and task-count behavior |
| `hepan-provider-settings.test.js`, `renderer-hepan-settings.test.js` | settings service/provider contract plus `createSettingsFeature` public snapshot; secrets remain tested by safe absence rather than UI source text |
| `renderer-history-editor-flow.test.js`, `renderer-question-editor-session.test.js`, `renderer-responsive-layout.test.js` | existing real Renderer harness tests for transaction/editor interaction, focus/pointer behavior, and responsive layout; deleted source-string assertions have direct interaction evidence |

The retained `renderer-confirmation-host.test.js` is not a business behavior assertion. It is explicitly categorized as `architecture/dependency` and `retired-capability/legacy-absence` for host placement, native confirmation boundary, and legacy modal absence; its observable FIFO/cancellation/focus behavior remains in `renderer-confirmation-host-behavior.test.js`. Other retained source-reader declarations are file heuristics without assertion-level source-text use or narrow legal static gates, and are not treated as business rewrites.

### Static exceptions

All 53 retained static guards have a permitted category and ledger evidence:

- `architecture/dependency`: import graph, owner seam, typed capability, preload/bridge, or single-writer dependency invariants;
- `security`: sandbox, authentication, credential, local-data, and path-boundary invariants;
- `retired-capability/legacy-absence`: removed capability, legacy route, old modal, and absence allowlist invariants;
- `packaging/release/CI`: package inclusion/exclusion, runtime/relaunch, discovery, encoding, and release evidence invariants.

Each row identifies why a public behavior test cannot prove the invariant and names the owning gate. No title-only classification remains.

## Finding 3 — full-test closure contract

### Contract

The reconciled contract is: run the complete discovered set on a clean HEAD with Electron focus enabled; require runner `CLOSED`, `allFilesReported=true`, and `skipped/todo/cancelled=0`; do not skip, exclude, weaken, or fabricate artifact tests. A nonzero full run is acceptable only when every failure is an already registered, reproducible, non-M05 artifact/runtime prerequisite exception. Such a result is not called full gate PASS.

### Final run

Command:

```powershell
$env:RUN_ELECTRON_FOCUS_TESTS='1'
npm test -- --profile-output C:\Users\violet\AppData\Local\Temp\m05-j-full-profile-clean.json
```

Evidence:

- Profile: `C:\Users\violet\AppData\Local\Temp\m05-j-full-profile-clean.json`
- Log: `C:\Users\violet\AppData\Local\Temp\m05-j-full-run-clean.log`
- `1,798` tests; `1,796` passed; `2` failed; `0` skipped; `0` cancelled; `0` todo.
- `lifecycle=CLOSED`; `allFilesReported=true`; `noSkippedTodo=true`; all 248 discovered files were reported.
- The Electron settings focus suite ran and passed; no node runner process remained afterward.

The two failures are explicitly non-M05 and external to the changed test/inventory behavior:

1. `tests/alpha-smoke-verifier.test.js` — `PLAYWRIGHT_NODE_UNAVAILABLE: Bundled Playwright Node is unavailable`.
2. `tests/phase-06-capability-specific-inventory.test.js` — required `release-alpha/win-unpacked/resources/app.asar` is absent.

Both were observed in the historical M05-H/I evidence and again on the clean final run. They are classified `EXPOSED_PREEXISTING`, not introduced by M05-J. No artifact was generated, no test was skipped, and the runner was not altered to conceal the failures. Full-run status is therefore `PASS_WITH_EXPLICIT_NON_M05_EXCEPTIONS`; the M05-specific closure verdict remains PASS.

## Commands and results

| Command | Result |
| --- | --- |
| `node --test --test-concurrency=1 tests/test-inventory-contract.test.js tests/content-workbench-regression.test.js tests/doubao-content-workbench.test.js tests/hepan-provider-settings.test.js tests/renderer-hepan-settings.test.js tests/media-article-drawer-boundary.test.js tests/media-resource-ux.test.js tests/renderer-article-history.test.js tests/renderer-article-management-filters.test.js tests/renderer-article-management-flow.test.js tests/renderer-batch-generation.test.js tests/renderer-content-generation.test.js tests/renderer-content-submission-batch-actions.test.js tests/renderer-published-trash-flow.test.js tests/renderer-template-discovery-empty-client.test.js` | 45/45 pass; 0 fail; 0 skip/todo/cancelled |
| `node auto—publish/scripts/test-inventory.js` | 248 files; 231 JS; 17 MJS; 1,686 declarations; manifest `2beff83821ca66e328fe3b9f4fccd648178d9bea35c2a41c874af0d01445b556` |
| `npm run test:discover` | 248 discovered `.test.js/.test.mjs` files; no omission reported |
| `RUN_ELECTRON_FOCUS_TESTS=1 npm test -- --profile-output ...` | 1,798/1,796/2; clean runner contract satisfied; two explicit external exceptions above |
| `git diff --check` | pass before closure commit |
| `git status --porcelain` | clean at implementation/evidence anchor; closure docs are the only post-run additions |

## Final evidence references

- Authoritative inventory, disposition, static-category rationale, and manifest: `handoffs/M05-0-authoritative-test-disposition-ledger.md`.
- M05 runner/discovery and combined closure contract: `maintenance/M05-test-quality-cleanup.md` and `ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md`.
- Final implementation/evidence anchor: `7f113d2697d707120ecf40395ce30fee53ade48d`.

PASS — M05 can remain COMPLETE
