# M05-D handoff — typed IPC/domain contract、registrar、preload、bridge evidence

## 状态

- 结果：`COMPLETE`
- Base：`4c7f91533c378e6a86b8080a56fd3f39cb21e643`（M05-C Final clean HEAD）。
- Final：本 handoff 随本次 implementation/evidence closure commit 提交；commit 后已用 `git rev-parse HEAD` 与 `git status --porcelain` 验证 clean，最终 hash 以提交后的 Git evidence 为准。
- 下一包：`M05-E1`。
- 本任务未启动 E1 或任何后续包。

## 范围与 owner

本包只处理 typed IPC/domain DTO、schema version、unknown-field、safe error、event contract、registry/registrar/preload/bridge mapping，以及 named capability/consumer/absence/symbol identity evidence。没有修改 production contract implementation、registry、registrar、preload、bridge、Renderer business state、OperationalStore、adapter outcome 或 compatibility barrel/export。

## Rewrite residual 与 replacement mapping

- Final inventory：255 files（238 JS / 17 MJS）、1,706 declarations；42 file-level source-reading files / 232 declarations；105 assertion-level source-reading candidates；manifest `6c6af86a78a0bfefeafa83597657b122f5f89fac82949e7c036e93dbf2420b9c`；discovery `1f480cecd797c7f48a9a0583f628eb0c58a3882c9c1ac087cdec73e62bd1affc`。
- M05-D package declarations：`200 → 196`；D disposition：142 `RETAIN_BEHAVIOR`、41 `RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION`、11 `RETAIN_STATIC_GUARD`、2 `RETAIN_DYNAMIC_MATRIX`；D `REWRITE_PUBLIC_BEHAVIOR` residual=`0`。Global remaining rewrite rows belong to later packages and are untouched。
- `T-bb1eb48759`：paid-order registrar/preload source-shape assertion → `createAuthenticatedIpcMain` + `registerMediaIpc` handler behavior、shared preload harness、exact four named channels/DTOs；asserts retired `createOrder` absence。
- `T-42cc64911e`：Doubao event sender source read → retained registry `event`/`parseEvent` round-trip fixture。
- `T-a63264141f`：Doubao production caller source read → preload named-method transport matrix、exact request parser comparison、versioned event listener/disposer behavior。
- `T-3ff23a7004`：generation method-dispatch source read → generation preload named-method/request matrix、event disposer、runtime TypeScript bridge success and coded safe-error projection。
- `T-50c6ca2859`：raw preload VM fixture → shared preload harness plus real renderer coordinator/router observable diagnostic sink; malformed payload is dropped and secrets are absent from diagnostics。
- `T-f6553b4d6f` / `T-8ecd8ed794`：production matrix negative source-path mutations retired from that file; equivalent lifecycle `stateSource` and event `producer` fail-closed mutations remain in the symbol-identity evidence suite。
- `T-39625d58c5`：publication bridge source-shape assertion → runtime TypeScript bridge named-command mapping, confirmation injection, and `SafeOperationalError` projection。

## Retained / retired evidence

Retained 129-capability registry/parser behavior, exact request/result/event DTOs, version and unknown-field rejection, safe error closure, registrar rollback, preload raw transport/Auth exemption boundary, named bridge surface, capability/consumer/absence checks, 129 TypeChecker symbol identity, and the two dynamic lifecycle/event matrices. `DUP-02` was consolidated only at the evidence layer; no unproven duplicate behavior assertion was removed。

Retired only direct implementation-shape/source-regex assertions listed above and the two matrix assertions replaced by the equivalent symbol-identity mutation matrix. No production implementation or compatibility path was added。

## Gates and evidence

- D owner regression：34-file manifest set, `node --test --test-concurrency=1 ...` → **375/375 passed**。
- Focused rewrite regression：the five affected files → **36/36 passed**。
- `npm run test:production-ipc-matrix` → **33/33 passed**，including 129 TypeChecker identity closures, lifecycle/event consumer matrices, version/unknown-field/safe-error/Auth checks。
- `npm run typecheck:main` → passed。
- `npm run typecheck:bridge` → passed。
- `npm run typecheck:renderer` → passed。
- `npm run build:renderer` → passed。
- `npm run pack:smoke` and `verify-alpha-package.js` → passed；ASAR absence gate subsequently passed 4/4 in the D regression。
- `npm run test:ticket-24-e` → passed；`npm run test:legacy-absence` → passed。
- `npm run test:discover` → 255 files；`npm run test:inventory` → final manifest above，D residual 0。
- Targeted Prettier check for all changed test/helper files → passed；`git diff --check` → passed。

Primary review found no P0/P1/P2 blocking finding and no owner/scope violation. The only initial process evidence gap was the missing local `release-alpha` ASAR; the project `pack:smoke` gate generated and verified it, then the affected test passed. Bounded re-check of the changed tests, D regression, matrix, and residual all passed。

## Exceptions

- Dependency installation was required in the existing worktree: root `npm ci --ignore-scripts` and `media-workbench` `npm ci --ignore-scripts` completed. Reported npm audit findings were not auto-fixed because they are unrelated to this test-evidence package。
- No real login, publication, payment, cancellation, upload, production database, or third-party write operation was performed。

## Do-not-touch / next

Next is `M05-E1` only. Do not start `M05-E2`, `M05-E3`, `M05-F`, `M05-G`, `M05-H`, later lifecycle packages, or M06 from this handoff. Keep production contract/registry/registrar/preload/bridge implementation, Renderer business state, OperationalStore, adapter outcome, compatibility exports, and real external operations out of the next package unless its own contract explicitly authorizes them。
