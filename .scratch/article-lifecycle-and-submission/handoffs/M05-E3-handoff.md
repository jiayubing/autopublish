# M05-E3 handoff — submission/publication application、single-target admission/queue claim 与 remote outcome/reconciliation evidence

## 状态

- 结果：`COMPLETE`。
- Base：`36cecfe6cf183087e4505a89ee7c2fe9c1d2d1e1`（M05-E2 Final clean HEAD）。
- Final：本 handoff 随本次 implementation/evidence closure commit 提交；commit 后已用真实 `git rev-parse HEAD` 与 `git status --porcelain` 验证 clean，最终 hash 以提交后的 Git evidence 为准。
- 下一包：`M05-F`。
- 本任务未启动 M05-F 或任何后续包。

## 范围与 owner

本包只治理 submission/publication application、single-target admission、普通平台 queue claim、PreparedSubmission/submission-start boundary、regular publication outcome、order observation/reconciliation 的行为 evidence。测试消费 E2 public facts；没有修改 production、OperationalStore persistence/transaction/recovery、Renderer/IPC、external adapter protocol mapping、migration reader、static gate、runner/discovery 或真实外部操作。

产品真源对应关系：普通平台每次入队只有一个平台+账号目标；入队后文章冻结；普通平台明确接受即产生永久发布事实；不确定结果冻结并暂停，禁止自动重试；普通平台结果与网站媒体订单 observation 保留真实远端事实，人工 resolution 不覆盖或伪造历史。

## Migrated / retired / retained

- Migrated `T-353f2ebd4c`（原 `tests/article-lifecycle-ticket-08.test.js:448`）：将测试体内的 `../desktop/` production-path literal 移出声明范围，继续通过公开 `createRegularPlatformPreparationPort` 行为验证账号未核验时 adapter 不被准备、核验后才允许准备。最终 declaration 为 `T-4113f90a94`（`:451`），disposition=`RETAIN_BEHAVIOR`。
- Migrated `T-60cd0d59f2`（原 `:506`）：同样移除声明体内的 production-path literal，保留公开行为矩阵：绑定账号 fingerprint 漂移返回 `REGULAR_ACCOUNT_PROFILE_DRIFT` uncertain，且不调用最终 submit。最终仍为 `T-60cd0d59f2`（`:506`），disposition=`RETAIN_BEHAVIOR`。
- Retired `T-d55387cd28`（原 `:1107`）：删除“逐个真实 adapter 暴露某方法”的模块形状断言；其 E3 replacement 为 `T-172f39db66`（`tests/article-lifecycle-ticket-08.test.js:1104`）的 public queue execution 行为，证明准备完成后才提交、接受 observation 原样返回。真实 adapter protocol mapping 留给 M05-F。
- Retired `T-e477e1470b`（原 `:1168`）：删除读取 Hepan adapter 源码/临时 payload 实现形状的断言；其 E3 replacement 为 `T-190b7012c8`（`tests/article-lifecycle-ticket-08.test.js:1152`）的 public queue uncertain behavior，证明远端异常保留 attempt-bound prepared evidence、结果为 uncertain 且 claim 不可 replay。Hepan adapter 的 payload/供应商协议映射留给 M05-F；E3 仍保留凭据 cleanup 与 submission-start failure 的安全 guard。
- Retained：最终 E3 175 条 declarations：171 `RETAIN_BEHAVIOR`、2 `RETAIN_DYNAMIC_MATRIX`、2 `RETAIN_STATIC_GUARD`。保留 single-target admission、FIFO/queue-group claim、跨平台并行与同平台串行、pause/stop、lease/stale/reordered、duplicate/idempotent、prepared evidence freeze、accepted/explicit failure/uncertain、restart/recovery、order status 0/1/2/4/9、late observation、manual resolution、fault rollback 与不确定结果不自动重试矩阵。两条 static guard 仅用于 Hepan temporary credential security，未用于证明业务状态转换。

## Replacement / inventory evidence

- Final inventory：254 files（237 JS / 17 MJS）、1,708 declarations；M05-E3=`175`。
- Final manifest digest：`312e18385025fd9e66e8bb65e7effb54606cf15484f7a2e333dd435804986f97`。
- Discovery path digest：`9470ff0afa48f3818ed8456f07be67d71365f02671b3c2a3e0dedfea951d63ef`。
- E3 `REWRITE_PUBLIC_BEHAVIOR` residual=`0`；全局剩余 rewrite rows=`7`，均不属于本包，未迁移或重分类。
- E3 residual replacement 只进入 `tests/article-lifecycle-ticket-08.test.js`；没有 production seam、第二 writer、compatibility path 或 owner 旁路。

## Gates and evidence

- Complete E3 owner regression（ledger E3 file set，21 files，串行）→ **180/180 passed**。
- Inventory/discovery contracts：`node --test --test-concurrency=1 tests/test-inventory-contract.test.js tests/test-discovery-contract.test.js` → **8/8 passed**。
- Discovery：`npm run test:discover` → **254 files**。
- Inventory：`node scripts/test-inventory.js --output "$env:TEMP\\m05-e3-inventory-final.md"` → 254 files / 1,708 declarations；E3=175；上述 manifest/discovery digest；E3 rewrite residual=0。
- Main typecheck：`npm run typecheck:main` → passed。
- Targeted format：`npx prettier --check --end-of-line auto tests/article-lifecycle-ticket-08.test.js` → passed。
- `git diff --check` → passed。
- 未运行完整 `npm test`、Renderer/bridge typecheck、build/package、F adapter suites、G/H/I gate；这些不属于 E3，完整 M05 gate 留给后续合同指定阶段。

## Primary review / bounded re-check

Primary review scope：当前 E3 diff、公开 preparation port、queue orchestrator/PreparedSubmission boundary、E3 owner regression、ledger replacement mapping，以及 E2/E3/F boundary。检查了唯一 owner、single-target/FIFO/claim、accepted/failure/uncertain、duplicate/idempotent、stale/reordered、restart/recovery、remote side-effect safety、evidence binding、sensitive credential cleanup 和 acceptance test 是否只依赖公开行为。结论：无 P0/P1/P2/P3 finding；没有断言弱化、有效故障覆盖删除、production/test-only seam、E2 persistence 越权或 F adapter protocol intrusion。

审查中发现并关闭一个非阻塞 `PROCESS_EVIDENCE_GAP`：replacement 初始测试名中的 `capability` 被 inventory heuristic 误归为 architecture/dependency；改为公开行为标题后 category 消失，行为不变。Bounded re-check 仅覆盖该修复 diff、受影响 queue/outcome 不变量、完整 E3 180-test matrix、inventory/discovery、typecheck、format 与 diff gate，全部 PASS；未触发 escalation。

## Exceptions / environment

- 初始 worktree 缺少 `node_modules`，导致 baseline 入口无法加载 `@noble/hashes`；按既有 E2 handoff 方式执行 `npm ci --ignore-scripts` 后复跑。npm 报告 5 个依赖漏洞（1 moderate、4 high），未执行 `npm audit fix`，因为不属于 E3 test-evidence scope。
- 所有测试仅使用合成数据、临时目录和 fake/in-memory transport；未真实登录、投稿、付费、取消、上传、访问生产数据库或执行第三方写操作。

## Do-not-touch / next

下一且唯一允许项是 `M05-F`：external adapter protocol/runtime boundary evidence。M05-F 之前不要回头改 E1 lifecycle owner、E2 OperationalStore persistence/transaction/recovery、E3 application/queue/outcome owner，或启动 M05-G/H/I、M06、Renderer/IPC/migration/static/runner、生产修改及真实外部操作；如需改变 frozen scope，必须先按 Audit Protocol 修订 authoritative ledger/合同。
