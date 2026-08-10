# M05-J4 — Final Static Guard Closure

> 日期：2026-08-10。本 handoff 只记录 M05-J4 的最后 2 个 static-classification residual、bounded re-audit、最终实现 HEAD evidence 和 M05/M06 状态；M05-0 ledger 仍是 inventory/disposition 真源。

## Verdict

`PASS — M05 COMPLETE, ready for M06`

- Base HEAD：`cec59418ef09638a97faee78344ecdc578d73393`
- Implementation HEAD：`bf5bd711007548ded0d6eca74cce50053f0afb3e`（`test: close M05 final static guard residuals`）
- Closure HEAD：本 handoff、ledger、Wave Plan、M05/M06 maintenance 更新组成 docs-only closure commit；准确 SHA 由最终 Git 验证和交付响应记录。
- Branch：`codex/article-lifecycle-submission`；未创建新分支、未 push。
- M05：`COMPLETE`
- M06：`READY`（`PENDING TO START`）
- Wave 10.5：`PARTIAL`；M06 完成前不能 `COMPLETE`
- Ticket 25：`PENDING`，继续等待 M06 完成。

## Scope and production boundary

本次只修改 `scripts/test-inventory.js` 与测试文件，补充 classifier/adapter behavior regression，并同步 handoff、authoritative ledger、Wave Plan、M05/M06 maintenance 文档。未修改 `auto—publish/src/**`、`auto—publish/desktop/**`、`auto—publish/media-workbench/src/**` 或 auth-server production；未修改 runner concurrency/timeout/pool policy；未执行真实登录、发布、付费、取消、上传、生产数据库或其他真实外部操作。

## Residual closure

### 1. `orderNid` static classification

- 从 `scripts/test-inventory.js` 的 `retired-capability/legacy-absence` target 中删除 `orderNid`，不再因为 identifier name 授权 static guard。
- `phase-03-media-adapter-readonly.test.js` 删除 `assert.match(source, /orderNid/)`；`SubmissionOrderStore` 与 `.record(...)` 的真正 legacy absence guard 保留。
- 新增 synthetic fake-transport behavior test，实际调用 `createMediaAdapter(...).publish(...)`，断言远端 `{ data: { order_nid } }` 映射为 public `result.orderNid`；该测试覆盖了 source assertion 的 replacement，不触碰 production seam。
- 新增 classifier regression：仅有 `assert.match(source, /orderNid/)` 时 disposition 为 `REWRITE_PUBLIC_BEHAVIOR`，不是 `RETAIN_STATIC_GUARD`。

### 2. Generic source-holder token and listener line

- 从 architecture/packaging static target 中移除 generic `preload` context token；`main`、`renderer`、`source` 不作为独立 static authorization 条件。真实 capability/invariant token（例如 `platforms:`, `getQueue`, `onDoubaoQueueState`、精确 package/security/absence terms）仍可授权合法 static guard。
- 新增要求中的 regression fixture：`const preload = readProductionSource(); assert.match(preload, /someInternalBusinessThing/)`，结果不是 `RETAIN_STATIC_GUARD`，而是 `REWRITE_PUBLIC_BEHAVIOR`。
- `desktop-packaging.test.js` 删除 `assert.match(preload, /removeListener\("content:doubao-queue-state", handler\)/)` implementation-line assertion；typed IPC/preload behavior coverage 继续由 `phase-06-typed-ipc-production.test.js` 与 production IPC fixture matrix 提供。
- Doubao public capability assertions保留，并改为基于实际 channel/capability literal 的窄匹配；未以 `preload` 变量名恢复 static 特赦。

## Final inventory and classifier proof

`npm run test:discover` 与 `node scripts/test-inventory.js` 均基于 `scripts/run-tests.js::collectTestFiles`。

| Metric | Result |
| --- | ---: |
| Discovered files | 248 |
| `.test.js` / `.test.mjs` | 231 / 17 |
| Static declarations | 1,683 |
| Dynamic matrix candidates | 128 |
| Dynamic/unnamed declarations | 12 |
| File-level source-reading candidates | 35 files / 231 declarations |
| Assertion-level source-reading candidates | 53 |
| Retained static guards | 53 |
| `REWRITE_PUBLIC_BEHAVIOR` | 0 |
| Semantic `REWRITE_PUBLIC_BEHAVIOR` | 0 |
| Runner pools | `parallel=210`, `serial=38` |
| Manifest digest | `ada2fe811784a6574c3ecaf7a6ab4d8dd8b08c2ec20b474b3c210fb23065ed71` |
| Discovery path digest | `4703caa064cbd3036cb97eba0f66ff4efcc7451fc645f366843850454ab4822f` |

Disposition totals：`RETAIN_BEHAVIOR=1442`、`RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION=176`、`RETAIN_DYNAMIC_MATRIX=12`、`RETAIN_STATIC_GUARD=53`。

Final retained static guard manual review found only `architecture/dependency`、`security`、`retired-capability/legacy-absence`、`packaging/release/CI` categories. Targeted scan of retained assertions found zero private implementation names from the closed residual set, zero `orderNid` name-only guard, zero removed `removeListener("content:doubao-queue-state", handler)` line, and zero generic source-holder-only authorization. Retained line-shaped assertions are limited to explicit architecture/security/package boundaries and public capability/absence contracts; no positive business/UI behavior is authorized by a generic token.

## Verification on implementation HEAD

- `node --test tests/phase-03-media-adapter-readonly.test.js tests/test-inventory-contract.test.js tests/desktop-packaging.test.js tests/phase-06-typed-ipc-production.test.js`：58 passed，0 failed。
- `npm run test:discover`：PASS，248 files，未修改 discovery/exclude。
- `node scripts/test-inventory.js`：PASS，生成上述 248-file authoritative ledger。
- `npm run lint`：PASS。
- `npm run typecheck:renderer`：PASS。
- `npm run typecheck:bridge`：PASS。
- `npm run typecheck:main`：PASS。
- `npm run test:legacy-absence`：PASS，source/archive matches 0。
- `npm run test:ticket-24-e`：PASS，capability/IPC/legacy/renderer/migration checks 通过。
- `npm run verify:phase-08`：PASS，129/129 capability reachable，ownership/dependency/legacy/generated gates 通过。
- `npm run test:production-ipc-matrix`：PASS，33 tests，129 capability identity checks 通过。
- `npm run test:phase-08:gates`：PASS，4 tests。
- `npm run test:packaging`：PASS，46 tests。
- `$env:RUN_ELECTRON_FOCUS_TESTS='1'; npm test -- --profile-output C:\Users\violet\AppData\Local\Temp\m05-j4-implementation-28740.json`：PASS，248/248 files，1,795/1,795 passed，0 failed，0 skipped，0 todo，0 cancelled，`CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`。
- `git diff --check`：PASS。

`npm run format:check` 仍报告 4 个既有且未修改文件：`media-workbench/src/types/generation.ts`、`tests/architecture-seams.test.js`、`tests/phase-01-architecture.test.js`、`tests/production-packaging.test.js`。本次未扩大范围修复；该 pre-existing formatting drift 记录为 non-blocking P3，不改变实现 HEAD 的 M05 static/full-test evidence。

## Production diff and findings

- `git diff --name-only cec59418ef09638a97faee78344ecdc578d73393..bf5bd711007548ded0d6eca74cce50053f0afb3e -- auto—publish/src auto—publish/desktop auto—publish/media-workbench/src`：空；production behavior diff 为 `0`。
- Closure commit 仅包含 docs/evidence；closure 后 production diff 仍为 `0`。
- P0：无。
- P1：无。
- P2：无。
- P3：既有 format-check drift（4 个未修改文件），non-blocking；无新增 M05 residual。

## State handoff

M05 的最终 acceptance、bounded re-audit、implementation-HEAD full runner 和 retained-static manual review 已全部闭合，因此 M05 保持 `COMPLETE`。M06 仅进入 `READY` / `PENDING TO START`，本次不实施 M06；维护 10.5 必须保持 `PARTIAL`，直到 M06 完成并通过其最终 gate，之后才允许 Ticket 25 调度。
