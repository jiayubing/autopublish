# M05-0 Handoff — authoritative test inventory / classification / ownership freeze

## Result

`COMPLETE`。本包只完成 inventory、classification、disposition ledger、A–H ownership/scope freeze 与 E complexity decision；没有实施 M05-A–H 测试迁移、没有修改 production behavior、没有进入 M06，也没有执行真实外部操作。

## Git / source state

- Base HEAD：`0e8d3fa084ebba2886461395c5dc4a144c295219`
- Final clean HEAD（M05-0 implementation/evidence source state）：`a90f3a14cfe158900745f7cd40a2b4c858be1b31`
- Implementation/evidence commit：`a90f3a14cfe158900745f7cd40a2b4c858be1b31` (`maintenance: freeze M05-0 test inventory`)
- Worktree：detached HEAD；提交后已确认 clean。handoff-only 文档提交会在此 source state 之上，不改变 production/test behavior。

## Scope / owner freeze

- 唯一 owner：test evidence inventory / classification；不拥有任何业务事实。
- Discovery 与 `scripts/run-tests.js::collectTestFiles` 对齐：251 个 `.test.js`、17 个 `.test.mjs`、共 268 个文件；静态解析 1,818 个声明。
- Ledger：[`M05-0-authoritative-test-disposition-ledger.md`](M05-0-authoritative-test-disposition-ledger.md)。它是 M05-A–H 唯一的 before inventory、ownership、scope、disposition、replacement mapping 和保留 static guard 理由真源。
- Before manifest digest：`b568eae8cbd7937bd7a182265014c22663d43f82b90f66d01fb56a83d1a1932b`。
- Discovery path digest：`0f9e2566ac3a7fc8abc598ed94b0524f9cb71a28341a77e62c7bd8bc4438afea`。
- 其他 evidence：135 个 dynamic matrix candidate、61 个 file-level source-reading file / 405 个声明、218 个 assertion-level source-reading candidate、91 个合法 static-category candidate、2 个 duplicate-name cluster、133 个 fixture/assertion signature cluster（546 个声明）；runner pool 为 parallel 227 / serial 41。
- Renderer ownership：M05-A content/generation/attention（含 content workbench paid-media execution command state）；M05-B platform/publication/media read model；M05-C workspace/settings/shell/confirmation/presentation。共享 App/Sidebar/harness/component 不取得业务 ownership；混合断言已逐项拆 disposition。
- A–H package ownership/scope、禁止范围和 direct gate 已冻结在 ledger 与 maintenance contract；后续包不得自行移动 owner、合并/拆分 package 或扩大 scope。

## M05-E decision

冻结为 `M05-E1 → M05-E2 → M05-E3`，严格顺序 `M05-D → M05-E1 → M05-E2 → M05-E3 → M05-F`：

- E1：lifecycle projection、article permissions/attention/query、ArticleMutationCoordinator。
- E2：OperationalStore public facade、持久事实、transaction、fault/restart/recovery、removal transaction storage。
- E3：submission/publication application、single-target admission、queue claim、remote outcome/reconciliation、order observation。
- migration reader、migration-only payload/journal 和 legacy absence 不进入 E1–E3；只在既有 migration/absence owner 上由 M05-G 处理合法 static/absence guard。

## Verification / audit

- `npm run test:discover`：PASS，268 files，JS/MJS 均被发现。
- `npm run test:discover:evidence`：PASS，268 / 251 JS / 17 MJS，digest 与 ledger 一致。
- `npm run test:inventory`：PASS，ledger 可重复生成，manifest digest 稳定。
- `node --test tests/test-inventory-contract.test.js tests/test-discovery-contract.test.js`：PASS，8/8。
- `npx prettier --check scripts/test-inventory.js tests/test-inventory-contract.test.js package.json`：PASS。
- `git diff --check` 与 staged diff check：PASS。
- Bounded self-review：PASS；检查 discovery 对齐、JS/MJS 覆盖、逐项 disposition、合法 static category、duplicate cluster owner、A–H boundary、E decision、禁止触碰范围；无 blocking finding。

## Exceptions / evidence gaps

- `npm run lint` 未执行成功：当前 worktree 无可用 `eslint` executable（`'eslint' is not recognized`）。这是 `PROCESS_EVIDENCE_GAP`，但不阻塞 M05-0 合同要求；没有以未运行命令冒充 PASS。
- 完整 `npm test`、auth-server tests、Renderer build/typecheck、packaging/release 未运行：它们属于后续包或阶段 gate，不在 M05-0 允许范围；本包没有修改其 owner。

## Next

`M05-A` 是下一且唯一允许启动的 package，必须从本 handoff 进入新的 clean integration HEAD 后开始；只消费 ledger，不重新分类或改 scope。

## Do-not-touch boundary

后续不得在 M05-0 名义下触碰 production、runner concurrency/timeout/pool policy、业务测试断言删除/降级、auth-server 业务测试、Renderer/IPC/store/adapter implementation、真实登录/发布/付费/取消/上传、M06 或 Ticket 25。只有当前包 Primary Audit 确认的 blocking finding 才能按 Audit Protocol 先修订 ledger/合同，再暂停并重新调度。
