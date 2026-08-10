# M05-J7 — Inventory Source-Taint Final Closure

> 日期：2026-08-10。本 handoff 只记录 M05-J7 inventory/classifier source-taint 修复、contract regression、bounded review 与 implementation-HEAD final gates；不重做 M05-A–I、M05-J/J3/J4/J5/J6、M04 或 Ticket 24。

## Verdict

`PASS — M05 COMPLETE, ready for M06`

- Base HEAD：`9209826591879b84a50ca2d1f1d2a93a7bee9656`。
- Implementation HEAD：`179577fd6e7849b7b6ab6e10cdb61a5e22929e05`。
- Closure HEAD：本 handoff、authoritative ledger、Maintenance M05 与 Wave Plan 的 docs-only commit；准确 SHA 以最终 Git 验证和交付响应为准。
- Branch：`codex/article-lifecycle-submission`；未创建新分支、未 push。
- M05：`COMPLETE`；M06：`READY`（`PENDING TO START`）；维护 10.5：`PARTIAL`。

## Scope and implementation

本轮只修改 `auto—publish/scripts/test-inventory.js` 与 `auto—publish/tests/test-inventory-contract.test.js`，没有修改 `auto—publish/src/**`、`auto—publish/desktop/**` 或 `auto—publish/media-workbench/src/**`，production behavior diff 为 0。

- source taint 统一为 `repo/config-path`、`source-text`、`source-text-derived-value` 与 `ordinary-runtime-value`；路径 taint 与实际源码文本 taint 分离。
- taint 传播覆盖 source alias、`slice`/`split`/`replace`/`length` 等 source-text transform，以及 `.forEach` 递归扫描、`for...of`、helper parameter、dynamic production root、`import.meta.dirname`、`__dirname` 与 repository CI/config/package/build/release paths。
- file-scope “读取源码”与 assertion-scope “返回/使用源码文本”分离；`loadPreloadHarness()`、`vm.runInNewContext()`、`moduleSpecifiers(read(...))` 等 ordinary runtime result 不再被提升为 source assertion。
- static category 只由 assertion matcher/test evidence 与合法 invariant 证据授权；source-holder 名称及 `bridge = source.slice(0)` 等 derived generic holder 不单独授权 static guard。
- 未修改 runner discovery、exclude、concurrency/timeout/pool policy，也未增加 production seam/export/flag。

## Inventory result

`npm run test:inventory` 与 `npm run test:discover` 均基于同一 `collectTestFiles` discovery set：

| Metric | Result |
| --- | ---: |
| Discovered files | 248（231 `.test.js`、17 `.test.mjs`） |
| Static declarations | 1,686 |
| Dynamic matrix candidates | 130 |
| Dynamic/unnamed declarations | 12 |
| File-level source-reading candidates | 46 files / 340 declarations |
| Assertion-level source-reading candidates | 66 |
| Legal static-category declarations | 66 |
| `REWRITE_PUBLIC_BEHAVIOR` | 0 |
| Semantic `REWRITE_PUBLIC_BEHAVIOR` | 0 |
| Manifest digest | `7d8b7e25deb59a172675bcad7df254540a5c87073a0cd3cee9f6820cf2f508a1` |

Current disposition counts are `RETAIN_BEHAVIOR=1336`、`RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION=272`、`RETAIN_DYNAMIC_MATRIX=12`、`RETAIN_STATIC_GUARD=66`；总数为 1,686。authoritative ledger 仍是 `M05-0-authoritative-test-disposition-ledger.md`，没有建立竞争分类表。

## Contract regression and bounded review

- `node --test --test-concurrency=1 tests/test-inventory-contract.test.js`：20/20 PASS。
- 新增覆盖 alias、source-text transforms、ordinary runtime result、helper parameter、`for...of`、recursive `forEach`、repository CI/config reader、`import.meta.dirname` 与 derived source holder static authorization。
- bounded review 范围仅限 source-taint/classifier diff、contract regression、重新生成的 inventory、直接受影响的 source/static classification 与最终 gates。
- Findings：无 P0/P1/P2/P3；未发现需要改变 owner、公开 contract、schema、事务边界或远端副作用边界的问题。bounded re-audit：PASS；未触发 escalation。

## Final validation on implementation HEAD

- `node --check scripts/test-inventory.js`：PASS。
- `npm run test:inventory`：PASS，248 files / 1,686 declarations，ledger digest 如上。
- `npm run test:discover`：PASS，248 files。
- `npm run lint`：PASS。
- `npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`：PASS。
- `npm run format:check`：PASS。
- `npm run test:legacy-absence`：PASS，source/archive matches 0。
- `npm run test:ticket-24-e`：PASS，public residue source matches 0、forbidden runtime statuses 0、forbidden imports 0。
- `npm run verify:phase-08`：PASS，129/129 capabilities reachable，dependency/owner/legacy/generated-output checks PASS。
- `npm run test:production-ipc-matrix`：33/33 PASS，129 capability identity checks PASS。
- `npm run test:phase-08:gates`：4/4 PASS。
- `npm run test:packaging`：46/46 PASS。
- `$env:RUN_ELECTRON_FOCUS_TESTS='1'; npm test -- --profile-output C:\Users\violet\AppData\Local\Temp\m05-j7-implementation-179577f.json`：248/248 files，1,798/1,798 passed，0 failed，0 skipped，0 todo，0 cancelled，`CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`。
- `git diff --check`：PASS。
- `git diff --name-only 9209826..179577f -- auto—publish/src auto—publish/desktop auto—publish/media-workbench/src`：空；production behavior diff = 0。

## Closure boundary

J7 只关闭 inventory source-taint classification 与其 evidence reconciliation。没有进入 M06，没有修改后续 package，没有执行真实登录、发布、付费、取消、上传、生产数据库或其他外部副作用操作。M06 保持 `READY / PENDING TO START`；在 M06 完成并通过 10.5 final gate 前，10.5 不得标记 `COMPLETE`，Ticket 25 不启动。
