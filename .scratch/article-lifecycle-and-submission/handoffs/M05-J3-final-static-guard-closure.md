# M05-J3 final static-guard closure

> 日期：2026-08-10。本文是 M05-J3 的最新 closure handoff；M05-0 ledger 继续作为 inventory/disposition 真源，本文件只记录 J3 的 remediation、bounded re-audit、最终证据和 handoff 指针。

## Verdict

`PASS` — M05 COMPLETE，ready for M06；M06 未启动。

- Base HEAD：`f693b440f81fe5f2cd597c9f8cc64bd712cd8481`
- Implementation HEAD：`35ff6998419af1f1ae7d5708862bc9634ca13409` (`test: close M05 static guard classification`)
- Closure HEAD：本文件及相关 Wave/maintenance/ledger 更新组成 docs/evidence-only closure commit；准确 hash 由最终 Git 验证记录在本次交接与最终响应中。
- Branch：`codex/article-lifecycle-submission`；未创建新分支、未 push。

## Scope and production boundary

J3 只处理 classifier false positive、private source-shape residual、replacement evidence 与 final evidence reconciliation。没有修改 `src/**`、`desktop/**`、`media-workbench/src/**`、auth-server production、runner concurrency/timeout/pool policy 或真实外部操作；没有恢复旧生命周期/兼容路线。

## P1 closure

### Classifier allowlist

从 `scripts/test-inventory.js` 的 static target 中移除仅凭名字不能证明公开行为的私有实现 token：

- architecture：`createArticleStore`、`ArticleStore`、`articleStore`、`createWorkspaceRuntime`。
- security：`initializeAuth`、`createAuthenticatedIpcMain`、`activateAuthenticatedRuntime`、`WORKSPACE_OPEN_FAILED`、`disposeRuntime`。
- packaging/release：`rendererEntryPath`、`createRendererSmokeProbeSource`、`captureEnvironmentValue`、`restoreEnvironmentValue`、`activateAuthenticatedRuntime`、`WORKSPACE_OPEN_FAILED`、`disposeRuntime`、`app.relaunch`。

保留项只属于 architecture/dependency、security、retired-capability/legacy-absence、packaging/release/CI 等合法 static category；测试 helper `requiredRuntimeFile`、`escapeRegExp` 仅在真实 package-inclusion assertion 中使用，未被作为 production implementation 行为证明。

### Residual source assertions and replacements

- 删除 `desktop-packaging` 中对 `activateAuthenticatedRuntime`、`WORKSPACE_OPEN_FAILED`、`disposeRuntime` 以及私有 composition helper/order/Doubao source assembly 的 source-shape assertions；workspace bootstrap、authenticated runtime、quit/disposal、公开 Doubao preload/IPC 行为测试仍保留。
- 删除 `relaunch-environment` 的私有 helper/order source assertion；`captureEnvironmentValue`/`restoreEnvironmentValue` 的直接行为测试和 workspace bootstrap relaunch coverage 保留。
- 删除 `rendererEntryPath`、`createRendererSmokeProbeSource`、`createWorkspaceRuntime`、`initializeAuth`、`createAuthenticatedIpcMain`、`mediaApi`、`deriveNavigationSummary` 等私有 source-shape断言；保留 package path、preload/bridge/security、settings owner、legacy absence 和可观察 Renderer 行为。
- 将 `phase-05-production-seams` 的 article-store owner 断言改为真实 module import-boundary contract；将 `phase-06-content-core-typed-ipc` 的 attention 断言收敛到公开 capability/bridge surface；没有为了测试新增 production seam。

对应的 public behavior/contract owner 包括 workspace bootstrap service/IPC、authenticated/workspace runtime lifecycle、quit disposal、relaunch helper behavior、production packaging/smoke contract、public preload/bridge/security/legacy gates 及 Renderer feature/harness 测试。删除项均有等价替代映射，未以相似测试名称代替证明。

## Classifier proof

`tests/test-inventory-contract.test.js` 新增 regression：

- 任意 fixture 中的 `someInternalRuntimeHelper`、`disposeRuntime` name-only source assertion：`allStatic=false`，disposition=`REWRITE_PUBLIC_BEHAVIOR`。
- 真实 `desktop/preload.js` sandbox boundary assertion：category=`security`，disposition=`RETAIN_STATIC_GUARD`。

该回归与受影响定向集合共 `28 passed, 0 failed`；最终 inventory 中 `REWRITE_PUBLIC_BEHAVIOR=0`，semantic `REWRITE_PUBLIC_BEHAVIOR=0`。

## Final inventory and static guard proof

`node scripts/test-inventory.js` 与 `npm run test:discover` 均基于 `scripts/run-tests.js::collectTestFiles`：

| Metric | Result |
| --- | ---: |
| Discovered files | 248 |
| `.test.js` / `.test.mjs` | 231 / 17 |
| Static declarations | 1,680 |
| File-level source candidates | 35 files / 228 declarations |
| Assertion-level source candidates | 53 |
| Retained static guards | 53 |
| `REWRITE_PUBLIC_BEHAVIOR` | 0 |
| Dynamic matrix declarations | 12 |

Retained static categories are `architecture/dependency`, `security`, `retired-capability/legacy-absence` and `packaging/release/CI`; no private implementation-name-only assertion is classified as a retained guard.

- Discovery SHA-256：`4703caa064cbd3036cb97eba0f66ff4efcc7451fc645f366843850454ab4822f`
- Manifest digest：`20d60705ce3e899cfcbca230954bcfff4247c7df86b23c8da7c21af4a988ac8a`
- P3：manifest digest 的跨平台换行/字节复现差异仅影响 digest portability，不影响 file set、classifier、测试结果或 production；登记为 non-blocking，不扩大本次范围。

## Final evidence on implementation HEAD

- `node --test tests/test-inventory-contract.test.js tests/architecture-seams.test.js tests/desktop-packaging.test.js tests/relaunch-environment.test.js tests/desktop-workbench-flow.test.js tests/production-packaging.test.js tests/phase-01-architecture.test.js tests/electron-security.test.js tests/phase-03-composition.test.js tests/phase-05-production-seams.test.js tests/phase-06-content-core-typed-ipc.test.js tests/phase-06-production-caller-inventory.test.js tests/renderer-resource-library-api.test.js`：`86 passed, 0 failed`。
- Replacement coverage：workspace/bootstrap/runtime/lifecycle/Doubao/Renderer 相关组合测试 `117 passed, 0 failed`。
- `npm run test:discover`：exit 0，248 files，未修改 discovery/exclude。
- `node scripts/test-inventory.js`：生成 authoritative ledger，248 files / 1,680 declarations，manifest 如上。
- `npm run lint`：PASS。
- `npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`：PASS。
- `npm run test:legacy-absence`：PASS，source/archive matches 0，archive status `NOT_APPLICABLE`。
- `npm run test:ticket-24-e`：PASS，capability 129/129、IPC/legacy/extension/renderer/migration checks 全部通过。
- `npm run verify:phase-08`：PASS，dependency direction、OperationalStore boundary、unique owners/writers、129/129 reachable capability、legacy absence、generated output gates 全部通过。
- `npm run test:production-ipc-matrix`：PASS，33 tests passed，129 capability identity checks passed。
- 完整 runner：`$env:RUN_ELECTRON_FOCUS_TESTS='1'; npm test -- --profile-output C:\Users\violet\AppData\Local\Temp\m05-j3-full-runner.json`（在 `auto—publish/` 执行）：
  - collected 248，parallel 210，serial 38；
  - tests `1792`，passed `1792`，failed `0`，skipped `0`，todo `0`，cancelled `0`；
  - `lifecycle=CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`。
- 最终 `git diff --check`：PASS。

## Production diff and findings

- `git diff --name-only f693b440f81fe5f2cd597c9f8cc64bd712cd8481..35ff6998419af1f1ae7d5708862bc9634ca13409 -- auto—publish/src auto—publish/desktop auto—publish/media-workbench/src`：空；production behavior diff 为 0。
- P0/P1：无。
- P2：无。
- P3：仅 manifest digest cross-platform portability note，non-blocking。
- 未执行真实登录、发布、付费、取消、上传、生产数据库或 push。

## Closure handoff

最终交付顺序为：implementation commit `35ff699...` → docs/evidence-only closure commit。closure commit 只包含本 handoff、M05 maintenance contract、Wave Plan 状态和 generated authoritative ledger；不得包含 production/test implementation。closure 后 working tree 必须 clean，`implementation HEAD..closure HEAD` 必须仅命中文档/evidence 路径；M05 COMPLETE 后停止，不进入 M06。
