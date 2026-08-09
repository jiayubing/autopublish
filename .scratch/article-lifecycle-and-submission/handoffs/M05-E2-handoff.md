# M05-E2 handoff — OperationalStore public facade、持久事实、transaction 与 fault/restart/recovery evidence

## 状态

- 结果：`COMPLETE`。
- Base：`f690bf1e61e30fb9e57fe9ca298d3ff1c31514c9`（M05-E1 Final clean HEAD）。
- Final：本 handoff 随 implementation/evidence closure commit 提交；提交后以真实 `git rev-parse HEAD` 为准。
- 下一包：`M05-E3`。
- 本任务未启动 E3 或任何后续包。

## 范围与 owner

本包只治理 OperationalStore public facade、持久事实、SQLite transaction、fault/restart/recovery、runtime lease/容量与 removal transaction storage 的测试 evidence。没有修改 production、OperationalStore owner、submission/publication application orchestration、Renderer/IPC/adapter/migration reader/static gate/runner 或真实外部操作。

## Migrated / retired / retained

- Migrated：`T-1d328a82c5`（`tests/phase-08-operational-store-internals.test.js:131`）迁移为 `T-8d8c14161d`（同文件 `:135`）：移除 test body 内的 production-path coupling，保留 exact public caller-surface contract，并增加 public-facade SQLite persistence round-trip。
- Retired：没有删除测试文件、fixture 或有效 failure/recovery coverage；只退休上述声明对 production path 的实现形状耦合。
- Retained：其余 59 条 E2 ledger rows，覆盖 `phase-02/03/04/08` OperationalStore suites、removal transaction/recovery scheduler、device identity、runtime capacity、renderer removal tracking 与 submission-file failure cleanup。所有能定位 transaction/fault/restart/recovery boundary 的测试均保留。

## Replacement mapping

| 原 evidence | Replacement public evidence |
| --- | --- |
| `phase-08-operational-store-internals.test.js:131` test body 内的 production-path coupling 与 caller-surface contract | `phase-08-operational-store-internals.test.js:135` 保留 exact `Object.keys(store)` public contract，并通过 `createAccountProfile`/`listAccountProfiles` 写入、关闭、重开并读取同一持久事实；同时验证 frozen facade、内部 capability 不可见和 schema verification |

E2 不新增 production seam，不复制内部 transaction owner，也没有把 submission/publication orchestration 或 adapter outcome 纳入 replacement。

## Inventory / evidence

- After inventory：254 files（237 JS / 17 MJS）、1,709 declarations、42 file-level source-reading files / 229 declarations、102 assertion-level source-reading candidates。
- Manifest：`56a33477e0e4120e3734fb48bbf681c207eb7f22ff31855a5132f7cfa18721ca`。
- Discovery path digest：`9470ff0afa48f3818ed8456f07be67d71365f02671b3c2a3e0dedfea951d63ef`。
- E2 `REWRITE_PUBLIC_BEHAVIOR` residual=`0`；全局剩余 residual=`11` 属于 E3/F/G，未在本包处理。

## Gates and evidence

- Directly affected facade replacement：`node --test --test-concurrency=1 tests/phase-08-operational-store-internals.test.js` → **7/7 passed**。
- Complete E2 owner regression（10 个 ledger owner files）→ **64/64 passed**。
- Inventory contract：`node --test --test-concurrency=1 tests/test-inventory-contract.test.js tests/test-discovery-contract.test.js` → **8/8 passed**。
- Discovery：`npm run test:discover` → **254 files**。
- Inventory：`node scripts/test-inventory.js --output "$env:TEMP\\m05-e2-inventory-final.md"` → 254 files / 1,709 declarations；上述 manifest/discovery digest。
- Main typecheck：`npm run typecheck:main` → **passed**。
- Targeted format check：`npx prettier --check --end-of-line auto tests/phase-08-operational-store-internals.test.js` → **passed**。
- `git diff --check` → **passed**。

本包不要求完整 `npm test`；M05 全套 gate 留给 M05-I final clean-HEAD closure。未执行真实登录、投稿、付费、取消、上传、生产数据库或第三方写操作。

## Primary review / bounded re-check

Primary review scope：changed public-facade evidence、E2 owner regression files、OperationalStore public contract、ledger replacement mapping 与 E2/E3 boundary。检查唯一 owner、持久事实、transaction rollback、fault/restart/recovery、uncertain/idempotent/duplicate、sensitive diagnostics 与 public behavior evidence。Final diff 保留 frozen caller-surface、`verify`/`backup` type contract 与所有 E2 failure/recovery coverage；没有 production seam、第二 writer、owner 旁路、断言弱化或 E3 scope intrusion。结论：**PASS；无 P0/P1/P2 blocking finding**。

Bounded re-check 覆盖 replacement diff、已知 E2 row、E2 64-test matrix、inventory/discovery/typecheck/format/diff gates，全部 PASS；未触发 escalation。结论：**PASS**。不启动 fresh full review，也不进入 E3。

## Exceptions / environment

- 初次运行 renderer-history 支持测试时 worktree 缺少 root/media-workbench 依赖；按 lockfile 执行 `npm ci --ignore-scripts` 后复跑全 E2 regression 64/64 通过。npm audit 报告的依赖漏洞未自动修复，因不属于 E2 evidence scope。
- Renderer build 仅作为 ledger 已分配的 E2 supporting regression 运行；没有修改 Renderer source。构建仅报告既有 chunk-size warning。
- Node：`v24.16.0`；npm：`11.13.0`。

## Do-not-touch / next

下一且唯一允许项是 `M05-E3`：submission/publication application、admission/queue claim、remote outcome/reconciliation。E2 不得回头修改 E1 owner，除非按 Audit Protocol 确认 blocking finding 并显式修订 ledger/合同。不要从本 handoff 启动 E3 之外的 F/G/H/I、Renderer/IPC/adapter/migration reader/static gate/runner、production 修改、M06 或真实外部操作。
