# Bounded Remediation F-005 — Generated Article Paid-Staging Eligibility

## 结论

`R3_PASS`

刚生成完成、已经持久化且标题/正文完整的 `generated` article 可以直接进入 paid staging；`saved` article 继续通过。编辑器存在未保存修改时，regular admission 与 paid staging 仍由 renderer 阻止。generated admission 不自动保存文章，也不改变 `article.status`。

## Provenance

- Base integration HEAD: `38af9fc8a47378d95b5b4c6b2864691b16e5c32e`
- R3 execution thread: `019ff8f9-f4f9-7d61-b530-962ad55ce229`
- Source/main thread: `019ff8d3-3af2-7a50-86fe-4d01204bdff9`
- Worktree: `C:\Users\violet\.codex\worktrees\7803\官媒投稿-refactor`
- Implementation commit: `f30e84f0c991a97db7c5a8ed3d2de66fc1f4e984`
- Merge/push/real external submission: none

## Scope and implementation

Primary owner was `auto—publish/desktop/services/operational-content-submission-service.js`.

- Renamed the local paid-staging eligibility assertion and allowed only `generated` or `saved` persisted articles to pass its status check.
- Preserved existing `ARTICLE_NOT_FOUND`, `ARTICLE_NOT_SAVED`, active-target, duplicate/idempotency, content, and regular/paid conflict behavior.
- Did not change generation persistence, Article lifecycle, publication lifecycle, schema, IPC/preload, regular queue owner, or dirty-state transport/store.
- Added a real application/store regression proving generated admission leaves the persisted status as `generated` and does not call `saveArticle`.
- Extended the existing paid preflight behavior test to cover both empty title and empty body.

## Changed files

Implementation commit contains only:

- `auto—publish/desktop/services/operational-content-submission-service.js`
- `auto—publish/tests/phase-02-paid-media-staging-application-ipc.test.js`
- `auto—publish/tests/phase-12-paid-media-preflight.test.js`

This handoff is the only additional R3 evidence file.

## Acceptance evidence

- T1: persisted complete `generated` article → paid staging PASS, in `phase-02-paid-media-staging-application-ipc.test.js`.
- T2: persisted complete `saved` article → PASS, same application/store test.
- T3: missing article → `ARTICLE_NOT_FOUND`, same test.
- T4: empty title and empty body → `PAID_MEDIA_ARTICLE_CONTENT_REQUIRED` preflight block, in `phase-12-paid-media-preflight.test.js`.
- T5: real renderer history/editor flow disables both regular and paid staging entry points for an unsaved article, in `renderer-history-editor-flow.test.js`.
- T6: generated admission leaves the persisted article `generated` and records zero `saveArticle` calls, same application/store test.
- T7: regular admission remains blocked while paid-staged and recovers only after explicit removal; active-target conflict and duplicate/idempotency guards remain covered.

## Commands and real results

Before the fix, the red loop was:

```text
$env:NODE_PATH = 'F:\官媒投稿-refactor\auto—publish\node_modules'; node --test --test-concurrency=1 tests/phase-02-paid-media-staging-application-ipc.test.js
```

Result: 3 passed, 1 failed; the generated admission failed with `ARTICLE_NOT_SAVED` at the known service eligibility guard.

Final bounded R3 application/store/renderer/preflight command:

```text
$env:NODE_PATH = 'F:\官媒投稿-refactor\auto—publish\node_modules'; node --test --test-concurrency=1 tests/phase-01-paid-media-staging.test.js tests/phase-02-paid-media-staging-application-ipc.test.js tests/phase-03-paid-media-staging-renderer.test.mjs tests/phase-12-paid-media-preflight.test.js
```

Result: `34` tests passed, `0` failed.

Additional final renderer evidence:

```text
$env:NODE_PATH = 'F:\官媒投稿-refactor\auto—publish\node_modules;F:\官媒投稿-refactor\auto—publish\media-workbench\node_modules'; node --test --test-concurrency=1 tests/renderer-history-editor-flow.test.js
npm --prefix media-workbench run lint
npm --prefix media-workbench run build
```

Results: renderer history flow `5` passed; renderer typecheck passed; renderer build passed. Vite emitted its existing bundle-size warning (>500 kB) but exited successfully.

`git diff --check` passed. The derived worktree had no renderer dependencies, so a temporary junction to `F:\官媒投稿-refactor\auto—publish\media-workbench\node_modules` was used for the renderer test/typecheck/build, then removed and verified absent; the real target remained present.

## Self-audit

Scope was limited to the known F-005 finding and its direct public tests. The single application owner now accepts the two persisted lifecycle statuses; the lower OperationalStore content/status/active-target guard remains authoritative. Known business errors remain typed and are not mapped to `IPC_INTERNAL`. No second writer, auto-save, status mutation, retry, publication side effect, or dirty-state store was introduced.

Blocking findings: none. `R3_PASS`.

## Not run and remaining risk

- Full repository `npm test`, full desktop/core gate, main-process typecheck, preload build, packaging, and the combined R1–R4 bounded re-audit were not run; they belong to the later integration/closure gate rather than this bounded R3 remediation.
- No real login, publishing, paid order, or external provider operation was performed.
- The worktree remains detached at the R3 implementation commit and retains the main thread's pre-existing deletion of `M05-J8_Inventory_Authoritative_Closure_Execution_Plan.md` and untracked `PAID-SUBMISSION-ACCEPTANCE-REMEDIATION-R1-R4.md`; neither was staged or modified by R3.
