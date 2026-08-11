# Ticket 25-F — Performance & Responsibility Gates Handoff

**状态：** `PACKAGE_COMPLETE`（仅 25-F package closure；不代表 Ticket 25 / Wave 11 `COMPLETE`）

**记录时间：** 2026-08-12（Asia/Shanghai）

## 调度预检与 provenance

- Base integration commit：`de72d734c47baca3129ddf43ee182eaa49a866f1`，与主任务提供的 clean integration HEAD 一致；`git merge-base --is-ancestor` 已确认。
- 执行 worktree：`C:\Users\violet\.codex\worktrees\f403\官媒投稿-refactor`；实际保持 detached HEAD，没有夺取 `codex/article-lifecycle-submission`。
- 当前主任务 worktree/branch 由主任务持有；本 worktree 未发现重复 25-F/25-G branch、worktree 或执行任务，没有创建线程、没有使用 `spawn_agent`/子代理。
- 25-E 已在 base 祖先链完成 package closure；25-0、Ticket 24、Maintenance 10.5 及 A～E 入口 gate 已由当前真实 Git/handoff 核验。未执行真实登录、发布、付费、订单刷新或其他外部副作用。

## 变更与提交

- Implementation/contract/test commit：`a91346499458c08fbb403ac64ed901fed94053b4` — `test: add Ticket 25-F performance evidence gates`。
- Matrix/evidence docs commit：`944dfcae2a180d0e62f481f6ec1607e4e00f7432` — `docs: record Ticket 25-F benchmark evidence`。
- Handoff-only commit：本文件提交后由最终 `git rev-parse HEAD` 返回；不在自身内容中自引用。
- 生产文章、队列、订单、迁移 schema、IPC/bridge API、Renderer 业务状态 owner 未修改；新增内容仅为 benchmark/evidence runner、公开行为测试、唯一 A contract/manifest 扩展及 story evidence refs。

## 固定预算与 benchmark evidence

25-F 使用既有唯一 `.scratch/article-lifecycle-and-submission/acceptance/25-a-query-scan-budget.json`，未修改 fixture、计数边界、预算、warm-up、重复协议或 wall-clock baseline。精确生成命令为：

```text
npm run benchmark:ticket-25-f -- --output build/evidence/ticket-25-f-benchmark.json
```

最终 benchmark 在 clean `sourceState` `944dfcae2a180d0e62f481f6ec1607e4e00f7432` 上运行；generated output 是 ignored 文件，报告中的 `commit`、`sourceState`、command、UTC 时间、Node/OS/机器摘要和 contract input hashes 均绑定该精确状态：

- sourceState status：`CLEAN`；diff digest：`712c7e70e629e881f202187c87838c85a6da7cab4759191860fc1a7a8a44126e`。
- Node：`v24.16.0`；npm：`11.13.0`；OS：Windows `win32/x64`，release `10.0.26200`，CPU count `20`；CI `false`。
- 安全摘要：`externalOperations=none`、`credentials=not-collected`、`sensitiveValues=excluded`；未收集或写入凭据、Cookie、Token、绝对路径、原始异常或供应商正文。
- contract hashes：query/scan budget `d6d5d238f7b7548b643dd9f84dfb1624ec7f743e04fdce99d2fdab9cfee7dfe9`；story matrix `4fd2d431f658563cf1fb8f6f511f74d32907e952ff9c15d3d1d222ae2f656b07`；state matrix `284976e412bababd5ac44035a85c28a747fa3f63b7e5ffd2616819b67b77171d`；唯一 evidence manifest `90c655c133f86cda434abfab49b989beffb9e4cc58febb925836b93588efad05`。

| operation | 公开 seam | 冻结规模 | query/scan hard budget | 实测 query/scan | external transport | wall-clock observation |
| --- | --- | --- | --- | --- | --- | --- |
| `article_management_snapshot` | `createArticleManagementSnapshot(...).get({ clientId })` | 2,000 articles；2,000 orders；200 trash；200 attention | `8/8` | `7/7` | `0/0` | p50 `48.085 ms` / p95 `54.926 ms` |
| `regular_queue_snapshot` | `createRegularQueueGroupOrchestrator(...).snapshot()`（对应普通队列 IPC list capability） | 8 groups；400 queue items | `6/6` | `1/1` | `0/0` | p50 `0.003 ms` / p95 `0.007 ms` |
| `paid_order_snapshot` | `createMediaOrderService(...).listOrderViews()` + `projectOrderList(...)` | 2,000 orders；20 clients | `6/6` | `1/1` | `0/0` | p50 `9.987 ms` / p95 `10.530 ms` |

每项均执行 warm-up 2 次、测量 7 次；每次测量创建 fresh in-memory read harness、重置 counters，按预算规定的 operation 顺序执行。7 个 measured samples 的 query/scan 计数均保持不变。三项报告状态为 `OBSERVED_NOT_A_FINAL_GATE`，各自 `counts.hardGate=PASSED`；因 25-A 的同环境 wall-clock baseline 为 `NOT_APPROVED`，p50/p95 只作 observation，regression 结论为 `NOT_ASSESSED_NO_APPROVED_BASELINE`，没有现场发明耗时阈值或 PASS/FAIL。

## Owner、依赖与不变量 evidence

唯一 tracked `.scratch/article-lifecycle-and-submission/acceptance/25-a-evidence-manifest.json` 新增 `moduleResponsibilityEvidence`，共 4 个模块，统一 disposition 为 `FACTS_FOR_INDEPENDENT_AUDIT`。它逐项记录 owner、职责边界、公开接口/最小 capability、直接调用方、依赖方向、隐藏不变量、公开合同测试、故障 evidence 和规模变化理由；该清单是事实材料，不是本执行任务对自身 diff/架构质量的 PASS。

| owner module | 最小公开 capability | 依赖方向/关键不变量 | 公开合同与故障 evidence |
| --- | --- | --- | --- |
| `desktop/services/article-management-snapshot.js` | `createArticleManagementSnapshot(...).get({ clientId })` | IPC → snapshot service → content/lifecycle read capabilities；client scope、revision stale retry、每类持久读取一次 | `article-management-snapshot.test.js`、25-B、25-F；stale/archive failure evidence |
| `desktop/services/regular-queue-group-orchestrator.js` | `createRegularQueueGroupOrchestrator(...).snapshot()` | content IPC/composition → orchestrator → transition ports；FIFO current/remaining、平台锁隔离、uncertain 不 replay | phase-07、25-C、25-F；uncertain/group-blocked evidence |
| `desktop/services/media-order-service.js` | `createMediaOrderService(...).listOrderViews()` | media application → order service → observation transitions；list 不调用 supplier、unknown/transport 保真、published first-wins | media order projection、order-list、25-D、25-F；transport/refresh evidence |
| `media-workbench/src/features/media/order-list-projection.js` | `projectOrderList(orders, input)` | OrdersView → pure in-memory projection；默认待安排、状态计数、创建时间倒序、无 transport | order-list projection、25-F；default-filter evidence |

F benchmark/test 通过上述公开 service/renderer seams 观察批量结果，没有读取私有函数、内部表结构或源码行数，也没有增加 test-only production API、acceptance-owned store/writer/state machine、第二状态矩阵或第二 evidence manifest。

## 实际命令与结果

环境依赖使用 `npm ci --ignore-scripts --no-audit --no-fund`（`auto—publish` 与 `auto—publish/media-workbench`）；未启动外部服务。

| 命令 | 实际结果 |
| --- | --- |
| `npm run benchmark:ticket-25-f -- --output build/evidence/ticket-25-f-benchmark.json` | `OBSERVED_NOT_A_FINAL_GATE`；3/3 query/scan hard budgets passed，wall-clock observation-only，clean sourceState=`944dfca` |
| `npm run test:ticket-25-a -- --output build/evidence/ticket-25-a-contract.json` | `PASS`；85 stories、95 rows、21 state cases、10 deferred image rows、17 tracked artifacts、5 generated artifact definitions、4 responsibility facts；sourceState=`944dfca` |
| `node --test --test-concurrency=1 tests/ticket-25-a-contract.test.js tests/ticket-25-f-performance.test.js` | `7/7 PASS` |
| `node --test --test-concurrency=1 tests/architecture-seams.test.js tests/phase-01-architecture.test.js tests/phase-05-production-seams.test.js tests/phase-08-cleanup-gates.test.js` | `15/15 PASS`；dependency direction/architecture/legacy/package gates通过；Phase 8 全树检查约 98.5 秒 |
| `npm run test:capacity` | `13/13 PASS`；phase-02 runtime、phase-05 handoff、phase-06 Renderer capacity |
| `npm run test:discover` | `PASS`；255 个 `.test.js/.test.mjs` 文件，包含 25-F test |
| `npm run lint` | `PASS` |
| `npm run format:check` | `PASS` |
| `git diff --check` | `PASS` |

期间曾有一次 25-F harness 断言将订单 `counts.all` 与六类 status count 重复相加，已在包内修正并重新运行定向测试、benchmark 和相关 contract gates；没有降低断言、预算或 fixture。

## 未运行、残余风险与停止边界

- 未运行完整 `npm test`、typed IPC 全量 gate、Renderer/Preload build、production packaging/dirty smoke、25-G full execution gate、Independent Combined Audit、bounded re-audit 或 final clean smoke；这些属于后续 G/独立 closure，不得用本包结果替代。
- 25-A wall-clock baseline 未批准，因此没有耗时 regression PASS/FAIL；当前只证明固定规模的 query/scan hard budget。
- 真实普通平台两组纯文本并行、网站媒体真实订单状态刷新仍为 `USER_EXTERNAL_ACCEPTANCE_REQUIRED`；本包未登录、发布、创建/刷新/取消订单、付费、图片上传、生产数据库操作或访问真实供应商。
- 图片相关 rows 继续保持 `DEFERRED_IMAGE_EXTENSION`；F 不实现图片链，也不把 text-only evidence 当图片验收。
- 本包不执行 Independent Audit，不对自身 diff 或模块责任清单下 architecture PASS；后续独立 combined audit 使用本 handoff、唯一 tracked matrices/manifest 和 clean generated evidence。

## 下一包入口与明确停止

25-F package closure 已完成，Ticket 25/Wave 11 仍保持 `PARTIAL`。下一包入口为 `25-G`，必须由主任务在核验本 package 的 implementation/docs/handoff commits、clean 状态和 sourceState 后另行创建；本执行任务没有创建、预建、分析或调度 25-G，不执行 merge、push、独立审计或真实外部操作。
